import { readFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { AUTHOR_ID, emptySnapshot, nextSync, isDue, isOwnName, normalizeTitle, getPublications, matchArticle, approvedArticle } from '../../src/lib/publications.mjs';

export class SyncError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export const snapshotPath = (root, mode = 'live') => path.join(root, mode === 'mock' ? '.local/mock/publications-scholar.json' : 'src/data/publications-scholar.json');
export async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return structuredClone(fallback); throw new SyncError('INVALID_FILE', `Cannot read valid JSON from ${path.basename(file)}.`); }
}
export async function runtimeConfig(root) {
  let local = {};
  try { local = parseEnv(await readFile(path.join(root, '.env'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new SyncError('INVALID_ENV', 'Cannot read the local .env file.'); }
  const settings = await readJson(path.join(root, 'src/data/publication-settings.json'), { liveSyncEnabled: false });
  const enabled = settings.liveSyncEnabled === true;
  return { key: process.env.SERPAPI_KEY || local.SERPAPI_KEY || '', enabled, auto: enabled && (process.env.LOCAL_AUTO_SYNC || local.LOCAL_AUTO_SYNC || 'false') === 'true' };
}
export async function readSnapshot(root, mode = 'live') {
  const snapshot = await readJson(snapshotPath(root, mode), mode === 'mock' ? emptySnapshot() : undefined);
  if (snapshot.schemaVersion !== 1 || snapshot.authorId !== AUTHOR_ID || !Array.isArray(snapshot.articles) || !Array.isArray(snapshot.reviewQueue) ||
      !(snapshot.lastSuccessfulSync === null || typeof snapshot.lastSuccessfulSync === 'string')) throw new SyncError('INVALID_CACHE', 'Publication cache is invalid; restore the last valid version.');
  try {
    if (snapshot.nextScheduledSync !== nextSync(snapshot.lastSuccessfulSync)) throw new Error();
  } catch { throw new SyncError('INVALID_CACHE', 'Refresh timestamps are invalid or inconsistent.'); }
  return snapshot;
}
export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close(); handle = null;
    await rename(temporary, file);
  } finally { await handle?.close(); await unlink(temporary).catch(() => {}); }
}
async function withLock(file, operation) {
  await mkdir(path.dirname(file), { recursive: true });
  let handle;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { handle = await open(file, 'wx', 0o600); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = await readJson(file, {});
      let dead = false;
      if (Number.isInteger(owner.pid) && owner.pid > 0) {
        try { process.kill(owner.pid, 0); } catch (error) { dead = error.code === 'ESRCH'; }
      }
      if (attempt === 0 && dead) { await unlink(file).catch(() => {}); continue; }
      throw new SyncError('BUSY', 'A publication refresh is already running. Try again when it finishes.');
    }
  }
  try { await handle.writeFile(JSON.stringify({ pid: process.pid })); return await operation(); }
  finally { await handle.close(); await unlink(file).catch(() => {}); }
}
const clean = (value, limit = 2000) => typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
export function normalizeArticle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = clean(raw.title);
  const citationId = clean(raw.citation_id, 160);
  if (!title || !new RegExp(`^${AUTHOR_ID}:[A-Za-z0-9_-]+$`).test(citationId)) return null;
  const authors = clean(raw.authors).split(/,\s*/).filter(Boolean);
  const yearValue = typeof raw.year === 'number' || /^\d{4}$/.test(raw.year ?? '') ? Number(raw.year) : null;
  const year = Number.isInteger(yearValue) && yearValue >= 1900 && yearValue <= 2100 ? yearValue : null;
  const venue = clean(raw.publication, 1000);
  const attributionVerified = authors.some(isOwnName);
  const citationCount = Number.isSafeInteger(raw.cited_by?.value) && raw.cited_by.value >= 0 ? raw.cited_by.value : null;
  const scholarUrl = new URL('https://scholar.google.com/citations');
  scholarUrl.search = new URLSearchParams({ view_op: 'view_citation', user: AUTHOR_ID, citation_for_view: citationId, hl: 'en' }).toString();
  return { citationId, title, authors, year, venue, attributionVerified, citationCount, scholarUrl: scholarUrl.href };
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function fetchScholar(key, { fetchImpl = fetch, sleep = pause } = {}) {
  if (!key) throw new SyncError('MISSING_KEY', 'SERPAPI_KEY is missing. Add it to your local .env file, then retry.');
  const records = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const url = new URL('https://serpapi.com/search.json');
    url.search = new URLSearchParams({ engine: 'google_scholar_author', author_id: AUTHOR_ID, hl: 'en', sort: 'pubdate', num: '100', start: String(offset), api_key: key }).toString();
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { response = await fetchImpl(url, { signal: AbortSignal.timeout(20000), redirect: 'error' }); }
      catch {
        if (attempt < 2) { await sleep(1000 * (attempt + 1)); continue; }
        throw new SyncError('NETWORK', 'SerpApi could not be reached or timed out. The previous cache was retained.');
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) { await sleep(1000 * (attempt + 1)); continue; }
      break;
    }
    if (!response.ok) {
      const code = response.status === 429 ? 'RATE_LIMIT' : [401, 403].includes(response.status) ? 'AUTH' : 'API_ERROR';
      throw new SyncError(code, code === 'RATE_LIMIT' ? 'SerpApi rate limit reached. Retry later; your cache and timer are unchanged.' : code === 'AUTH' ? 'SerpApi rejected the API key. Check your local configuration.' : `SerpApi returned HTTP ${response.status}. The previous cache was retained.`);
    }
    let data;
    try {
      const body = await response.text();
      if (body.length > 2_000_000) throw new Error();
      data = JSON.parse(body);
    } catch { throw new SyncError('INVALID_RESPONSE', 'SerpApi returned an invalid or oversized response.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SyncError('INVALID_RESPONSE', 'SerpApi returned an invalid response object.');
    if (data.error || (data.search_metadata?.status && data.search_metadata.status !== 'Success')) throw new SyncError('API_ERROR', 'SerpApi reported an unsuccessful search. The previous cache was retained.');
    if ((data.search_parameters?.author_id && data.search_parameters.author_id !== AUTHOR_ID) ||
        (page === 0 && !isOwnName(data.author?.name))) throw new SyncError('WRONG_AUTHOR', 'The returned Scholar author does not match this profile. Nothing was updated.');
    if (!Array.isArray(data.articles) || data.articles.length > 100) throw new SyncError('INVALID_RESPONSE', 'SerpApi returned an invalid articles list.');
    if (page === 0 && data.articles.length === 0) throw new SyncError('EMPTY_RESPONSE', 'Scholar returned no publications. The last valid cache and timer were retained.');
    const normalized = data.articles.map(normalizeArticle).filter(Boolean);
    records.push(...normalized);
    // Never follow API-supplied URLs: they can contain a key or another host.
    if (!data.serpapi_pagination?.next && data.articles.length < 100) break;
    if (data.articles.length === 0) break;
    offset += data.articles.length;
    if (page === 19) throw new SyncError('PAGINATION_LIMIT', 'Scholar pagination exceeded the safety limit. No partial response was saved.');
  }
  if (!records.some(record => record.attributionVerified && record.year && record.venue)) throw new SyncError('INCOMPLETE_RESPONSE', 'No complete, attributable publication records were returned. The cache was retained.');
  if (JSON.stringify(records).includes(key)) throw new SyncError('UNSAFE_RESPONSE', 'The API response included credential material in publication fields and was not saved.');
  return records;
}
function mergeArticles(previous, incoming) {
  const records = new Map();
  const currentCounts = new Map();
  for (const article of incoming) if (article.attributionVerified && Number.isSafeInteger(article.citationCount)) {
    const title = normalizeTitle(article.title);
    currentCounts.set(title, Math.max(currentCounts.get(title) ?? 0, article.citationCount));
  }
  for (const article of [...previous, ...incoming]) {
    const id = normalizeTitle(article.title);
    const old = records.get(id);
    if (!old) { records.set(id, { ...article }); continue; }
    if (!old.attributionVerified && article.attributionVerified) { records.set(id, { ...article }); continue; }
    // A duplicate without a verified author cannot replace a verified record.
    if (old.attributionVerified && !article.attributionVerified) continue;
    const merged = { ...old };
    for (const field of ['title', 'authors', 'year', 'venue', 'attributionVerified']) {
      if (article[field] !== null && article[field] !== '' && !(Array.isArray(article[field]) && !article[field].length)) merged[field] = article[field];
    }
    merged.citationCount = currentCounts.has(id) ? currentCounts.get(id) : old.citationCount ?? article.citationCount ?? null;
    records.set(id, merged);
  }
  return [...records.values()].sort((a, b) => a.citationId.localeCompare(b.citationId));
}
export function reviewQueue(articles, curated, overrides) {
  return articles.flatMap(article => {
    if (curated.some(paper => matchArticle(paper, [article], overrides.records?.[paper.id]))) return [];
    const override = overrides.records?.[article.citationId];
    if (override?.hidden || approvedArticle(article, override)) return [];
    const reasons = ['Requires manual verification of attribution and publication status'];
    if (!article.attributionVerified) reasons.push('Research author name is missing or ambiguous');
    if (!article.year || !article.venue || !article.authors.length) reasons.push('Incomplete bibliographic metadata');
    return [{ citationId: article.citationId, title: article.title, reasons }];
  });
}
export const publicHash = publications => createHash('sha256').update(JSON.stringify(publications)).digest('hex');
export async function mockScholar(root, scenario = 'success') {
  if (scenario === 'failure') throw new SyncError('MOCK_FAILURE', 'Simulated API failure. Mock cache and timer were retained.');
  if (scenario === 'empty') throw new SyncError('EMPTY_RESPONSE', 'Simulated empty response. Mock cache and timer were retained.');
  const curated = await readJson(path.join(root, 'src/data/publications-curated.json'));
  const records = curated.map((paper, index) => normalizeArticle({ title: paper.title, citation_id: `${AUTHOR_ID}:MOCK_${index}`, authors: paper.authors.join(', '), year: String(paper.year), publication: paper.venue, cited_by: { value: 0 } }));
  if (scenario === 'duplicates') records.push(...records);
  return records;
}
export async function runSync({ root, mode = 'live', force = true, now = () => new Date(), key, fetchImpl, sleep, scenario = 'success', writeSnapshot = atomicJson }) {
  if (!['live', 'mock'].includes(mode)) throw new SyncError('INVALID_MODE', 'Choose live or mock mode.');
  if (mode === 'live' && !(await runtimeConfig(root)).enabled) return { status: 'disabled', mode, contentChanged: false, message: 'Live publication refresh is disabled in src/data/publication-settings.json. Update curated content manually.' };
  return withLock(path.join(root, `.local/locks/${mode}.lock`), async () => {
    const previous = await readSnapshot(root, mode);
    if (!force && !isDue(previous, now())) return { status: 'skipped', mode, contentChanged: false, nextScheduledSync: nextSync(previous.lastSuccessfulSync) };
    const curated = await readJson(path.join(root, 'src/data/publications-curated.json'));
    const overrides = await readJson(path.join(root, 'src/data/publications-overrides.json'));
    const before = publicHash(getPublications(curated, previous, overrides));
    const records = mode === 'mock' ? await mockScholar(root, scenario) : await fetchScholar(key ?? (await runtimeConfig(root)).key, { fetchImpl, sleep });
    const articles = mergeArticles(previous.articles, records);
    const snapshot = { schemaVersion: 1, authorId: AUTHOR_ID, lastSuccessfulSync: now().toISOString(), nextScheduledSync: null, articles, reviewQueue: reviewQueue(articles, curated, overrides) };
    snapshot.nextScheduledSync = nextSync(snapshot.lastSuccessfulSync);
    const contentChanged = before !== publicHash(getPublications(curated, snapshot, overrides));
    // Cache + durable scheduling state commit together, only after full validation.
    try { await writeSnapshot(snapshotPath(root, mode), snapshot); }
    catch { throw new SyncError('WRITE_FAILED', 'Could not commit the publication cache. Success was not recorded; retry after checking file access.'); }
    return { status: mode === 'mock' ? 'mock-success' : 'success', mode, contentChanged, articleCount: articles.length, reviewCount: snapshot.reviewQueue.length, lastSuccessfulSync: snapshot.lastSuccessfulSync, nextScheduledSync: snapshot.nextScheduledSync };
  });
}

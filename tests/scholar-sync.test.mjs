import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { AUTHOR_ID, WEEK_MS, isDue, nextSync, getPublications, emptySnapshot } from '../src/lib/publications.mjs';
import { runSync, readSnapshot, snapshotPath, fetchScholar, normalizeArticle, atomicJson } from '../scripts/lib/scholar-sync.mjs';
import { createAdminServer } from '../scripts/lib/admin-server.mjs';

const curated = JSON.parse(await readFile(new URL('../src/data/publications-curated.json', import.meta.url), 'utf8'));
const initial = emptySnapshot();
const key = 'test-key-never-expose';
const date = value => () => new Date(value);
const first = '2026-11-01T10:00:00.000Z';
function rawPaper(index = 0, extra = {}) {
  const paper = curated[index];
  return { title: paper.title, authors: paper.authors.join(', '), citation_id: `${AUTHOR_ID}:TEST_${index}`, year: String(paper.year), publication: paper.venue, cited_by: { value: 3 }, ...extra };
}
const payload = (articles = curated.map((_, index) => rawPaper(index)), extra = {}) => ({ search_metadata: { status: 'Success' }, search_parameters: { author_id: AUTHOR_ID }, author: { name: 'Dexter Wen Jie Teo' }, articles, ...extra });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetcher = body => async () => response(body ?? payload());
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dexter-sync-test-'));
  await mkdir(path.join(root, 'src/data'), { recursive: true });
  for (const [name, data] of Object.entries({ 'publications-curated.json': curated, 'publications-scholar.json': initial, 'publications-overrides.json': { records: {} }, 'publication-settings.json': { liveSyncEnabled: true } })) await writeFile(path.join(root, 'src/data', name), JSON.stringify(data));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert(path.basename(root).startsWith('dexter-sync-test-'));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}
const live = (root, extra = {}) => runSync({ root, key, now: date(first), fetchImpl: fetcher(), sleep: async () => {}, ...extra });

test('initial live synchronization commits cache and UTC scheduling state together', async t => {
  const root = await fixture(t);
  const result = await live(root);
  assert.equal(result.status, 'success'); assert.equal(result.contentChanged, true);
  const snapshot = await readSnapshot(root);
  assert.equal(snapshot.articles.length, 5);
  assert.equal(snapshot.lastSuccessfulSync, first);
  assert.equal(snapshot.nextScheduledSync, '2026-11-08T10:00:00.000Z');
  assert.equal(getPublications(curated, snapshot).length, 5);
});
test('manual refresh resets the rolling interval; due checks use last success, not cron dates', async t => {
  const root = await fixture(t);
  await live(root);
  const manual = await live(root, { now: date('2026-11-04T10:00:00Z') });
  assert.equal(manual.nextScheduledSync, '2026-11-11T10:00:00.000Z');
  assert.equal(manual.contentChanged, false);
  const skipped = await live(root, { force: false, now: date('2026-11-11T09:59:59Z'), fetchImpl: () => { throw new Error('Must not call API before due'); } });
  assert.equal(skipped.status, 'skipped');
  const due = await live(root, { force: false, now: date('2026-11-11T10:00:00Z') });
  assert.equal(due.nextScheduledSync, '2026-11-18T10:00:00.000Z');
  assert.equal(Date.parse(due.nextScheduledSync) - Date.parse(due.lastSuccessfulSync), WEEK_MS);
});
test('initial state is due; malformed scheduling state fails closed', () => {
  assert(isDue({ lastSuccessfulSync: null }));
  assert.throws(() => nextSync('invalid'));
});
test('empty responses retain the entire previous cache and do not reset the timer', async t => {
  const root = await fixture(t); await live(root);
  const before = await readFile(snapshotPath(root), 'utf8');
  await assert.rejects(live(root, { fetchImpl: fetcher(payload([])) }), { code: 'EMPTY_RESPONSE' });
  assert.equal(await readFile(snapshotPath(root), 'utf8'), before);
});
test('missing credentials, API failures, rate limits, and network failures preserve valid state', async t => {
  const root = await fixture(t); await live(root);
  const before = await readFile(snapshotPath(root), 'utf8');
  await assert.rejects(live(root, { key: '' }), { code: 'MISSING_KEY' });
  for (const [status, code] of [[401, 'AUTH'], [429, 'RATE_LIMIT'], [503, 'API_ERROR']]) {
    await assert.rejects(live(root, { fetchImpl: async () => response({ error: key }, status) }), error => error.code === code && !error.message.includes(key));
  }
  await assert.rejects(live(root, { fetchImpl: async () => { throw new Error(`Network URL with ${key}`); } }), error => error.code === 'NETWORK' && !error.message.includes(key));
  assert.equal(await readFile(snapshotPath(root), 'utf8'), before);
});
test('pagination reconstructs trusted requests and duplicate records do not inflate results', async t => {
  const root = await fixture(t); const starts = [];
  const result = await live(root, { fetchImpl: async url => {
    assert.equal(url.hostname, 'serpapi.com'); starts.push(url.searchParams.get('start'));
    return response(starts.length === 1 ? payload([rawPaper(0)], { serpapi_pagination: { next: 'https://evil.example/?api_key=ignored' } }) : payload([rawPaper(0), rawPaper(1)]));
  } });
  assert.deepEqual(starts, ['0', '1']); assert.equal(result.articleCount, 2);
});
test('wrong profile and incomplete results are rejected without a successful timestamp', async t => {
  const root = await fixture(t);
  await assert.rejects(live(root, { fetchImpl: fetcher(payload(undefined, { author: { name: 'Another Researcher' } })) }), { code: 'WRONG_AUTHOR' });
  await assert.rejects(live(root, { fetchImpl: fetcher(payload([rawPaper(0, { year: '', publication: '' })])) }), { code: 'INCOMPLETE_RESPONSE' });
  assert.equal((await readSnapshot(root)).lastSuccessfulSync, null);
});
test('curated statuses and manual overrides remain authoritative over Scholar', async t => {
  const root = await fixture(t);
  const overrides = { records: { 'aorta-inr-2026': { venue: 'Manually corrected venue', status: 'Under review', links: [{ label: 'Project', url: 'https://example.org/verified-project' }] } } };
  await atomicJson(path.join(root, 'src/data/publications-overrides.json'), overrides);
  await live(root, { fetchImpl: fetcher(payload([rawPaper(1, { publication: 'Accepted journal 2099', year: '2099' })])) });
  const paper = getPublications(curated, await readSnapshot(root), overrides).find(p => p.id === 'aorta-inr-2026');
  assert.equal(paper.year, 2026); assert.equal(paper.status, 'Under review');
  assert.equal(paper.venue, 'Manually corrected venue'); assert.equal(paper.citationCount, 3);
  assert(paper.links.some(link => link.label === 'Project'));
  assert(paper.links.some(link => link.label === 'Scholar'));
});
test('unknown and ambiguous discoveries are quarantined; explicit verified approval publishes a new record', async t => {
  const root = await fixture(t);
  const candidate = rawPaper(0, { citation_id: `${AUTHOR_ID}:NEW`, title: 'Mock candidate requiring review' });
  const ambiguous = rawPaper(0, { citation_id: `${AUTHOR_ID}:OTHER`, title: 'Mock ambiguous candidate', authors: 'Other Person' });
  await live(root, { fetchImpl: fetcher(payload([candidate, ambiguous])) });
  const snapshot = await readSnapshot(root);
  assert.equal(snapshot.reviewQueue.length, 2); assert.equal(getPublications(curated, snapshot).length, 5);
  const overrides = { records: { [`${AUTHOR_ID}:NEW`]: { approved: true, verificationUrl: 'https://example.org/official-proceedings', title: candidate.title, authors: ['D. W. J. Teo'], year: 2026, venue: 'Verified test venue', status: 'Workshop paper', type: 'workshop', contribution: 'First author', links: [] } } };
  assert.equal(getPublications(curated, snapshot, overrides).length, 6);
  overrides.records[`${AUTHOR_ID}:NEW`].verificationUrl = 'javascript:alert(1)';
  assert.equal(getPublications(curated, snapshot, overrides).length, 5);
});
test('concurrent refresh requests cannot overwrite each other', async t => {
  const root = await fixture(t); let release; let started;
  const gate = new Promise(resolve => { release = resolve; });
  const reached = new Promise(resolve => { started = resolve; });
  const pending = live(root, { fetchImpl: async () => { started(); await gate; return response(payload()); } });
  await reached;
  await assert.rejects(live(root), { code: 'BUSY' });
  release(); await pending;
  assert.equal((await readSnapshot(root)).articles.length, 5);
});
test('interrupted/failed commit never reports success or resets the timer', async t => {
  const root = await fixture(t); await live(root);
  const before = await readFile(snapshotPath(root), 'utf8');
  await assert.rejects(live(root, { writeSnapshot: async () => { throw new Error('disk full'); } }), { code: 'WRITE_FAILED' });
  assert.equal(await readFile(snapshotPath(root), 'utf8'), before);
});
test('mock success/failure exercise cache and timer logic without touching live data', async t => {
  const root = await fixture(t); const before = await readFile(snapshotPath(root), 'utf8');
  const result = await runSync({ root, mode: 'mock', now: date(first), scenario: 'duplicates' });
  assert.equal(result.status, 'mock-success'); assert.equal(result.articleCount, 5);
  const mockBefore = await readFile(snapshotPath(root, 'mock'), 'utf8');
  for (const scenario of ['empty', 'failure']) await assert.rejects(runSync({ root, mode: 'mock', scenario }));
  assert.equal(await readFile(snapshotPath(root, 'mock'), 'utf8'), mockBefore);
  assert.equal(await readFile(snapshotPath(root), 'utf8'), before);
});
test('invalid metadata URLs are discarded and author variants normalize', () => {
  for (const name of ['Dexter Wen Jie Teo', 'Dexter W. J. Teo', 'D. W. J. Teo', 'WJD Teo']) assert(normalizeArticle(rawPaper(0, { authors: name, link: 'javascript:alert(1)' })).attributionVerified);
  assert.equal(normalizeArticle(rawPaper(0, { citation_id: 'ANOTHER:ID' })), null);
  const article = normalizeArticle(rawPaper(0, { link: `https://evil.example/?api_key=${key}`, cited_by: {} }));
  assert.equal(new URL(article.scholarUrl).hostname, 'scholar.google.com'); assert.equal(article.citationCount, null);
});
test('admin requires token, loopback Host, same-origin JSON; button endpoint commits real mock refresh', async t => {
  const root = await fixture(t); const admin = await createAdminServer({ root, port: 0, startTimer: false });
  t.after(() => admin.close());
  const origin = `http://127.0.0.1:${admin.port}`;
  assert.equal((await fetch(`${origin}/api/state`)).status, 401);
  const headers = { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json', Origin: origin };
  const hostStatus = await new Promise((resolve, reject) => {
    http.get(`${origin}/api/state`, { headers: { ...headers, Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
  assert.equal((await fetch(`${origin}/api/refresh`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: '{"mode":"mock"}' })).status, 403);
  const refreshed = await fetch(`${origin}/api/refresh`, { method: 'POST', headers, body: JSON.stringify({ mode: 'mock' }) });
  assert.equal(refreshed.status, 200); assert.equal((await refreshed.json()).status, 'mock-success');
  const state = await (await fetch(`${origin}/api/state`, { headers })).json();
  assert.equal(state.live.lastSuccessfulSync, null); assert(state.mock.lastSuccessfulSync);
  assert.equal(state.keyConfigured, false); assert(!JSON.stringify(state).includes(admin.token));
  const html = await (await fetch(origin)).text(); assert(!html.includes(admin.token));
});
test('transient responses retry and malformed JSON is rejected', async () => {
  let count = 0;
  const records = await fetchScholar(key, { sleep: async () => {}, fetchImpl: async () => ++count === 1 ? response({}, 503) : response(payload()) });
  assert.equal(count, 2); assert.equal(records.length, 5);
  await assert.rejects(fetchScholar(key, { fetchImpl: async () => new Response('invalid') }), { code: 'INVALID_RESPONSE' });
});
test('API credential echoes cannot be persisted in publication fields', async t => {
  const root = await fixture(t);
  await assert.rejects(live(root, { fetchImpl: fetcher(payload([rawPaper(0, { title: `API echo ${key}` })])) }), { code: 'UNSAFE_RESPONSE' });
  assert.equal((await readSnapshot(root)).lastSuccessfulSync, null);
});
test('failure on a later API page cannot save a partial result', async t => {
  const root = await fixture(t); await live(root);
  const before = await readFile(snapshotPath(root), 'utf8'); let page = 0;
  await assert.rejects(live(root, { fetchImpl: async () => ++page === 1 ? response(payload([rawPaper(0)], { serpapi_pagination: { next: 'https://serpapi.com/search.json?start=1' } })) : response({}, 401) }), { code: 'AUTH' });
  assert.equal(await readFile(snapshotPath(root), 'utf8'), before);
});
test('missing later fields and omitted papers preserve cache; verified citation corrections can decrease', async t => {
  const root = await fixture(t); await live(root);
  await live(root, { fetchImpl: fetcher(payload([rawPaper(0, { cited_by: { value: 1 } }), rawPaper(1, { year: '', publication: '', cited_by: {} })])) });
  const snapshot = await readSnapshot(root);
  assert.equal(snapshot.articles.length, curated.length);
  assert.equal(snapshot.articles.find(a => a.citationId.endsWith('TEST_0')).citationCount, 1);
  const preserved = snapshot.articles.find(a => a.citationId.endsWith('TEST_1'));
  assert.equal(preserved.year, curated[1].year); assert.equal(preserved.venue, curated[1].venue); assert.equal(preserved.citationCount, 3);
});
test('disabled live sync blocks manual and scheduled API calls but retains cache and mock mode', async t => {
  const root = await fixture(t); await live(root);
  const before = await readFile(snapshotPath(root), 'utf8');
  await atomicJson(path.join(root, 'src/data/publication-settings.json'), { liveSyncEnabled: false });
  for (const force of [true, false]) {
    const result = await live(root, { force, fetchImpl: () => { throw new Error('Disabled sync must not contact SerpApi'); } });
    assert.equal(result.status, 'disabled');
  }
  assert.equal(await readFile(snapshotPath(root), 'utf8'), before);
  assert.equal((await runSync({ root, mode: 'mock' })).status, 'mock-success');
  await atomicJson(path.join(root, 'src/data/publication-settings.json'), { liveSyncEnabled: true });
  assert.equal((await live(root)).status, 'success');
});

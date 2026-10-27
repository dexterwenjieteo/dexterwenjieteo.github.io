export const AUTHOR_ID = 'NXlm0_UAAAAJ';
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const normalizeTitle = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function isOwnName(value) {
  // The linked robotics paper uses W. J. D. Teo. Public author text stays curated.
  return ['dexterwenjieteo', 'dexterwjteo', 'dwjteo', 'wjdteo', 'teodwj', 'teodexterwenjie', 'dexterteo'].includes(normalizeTitle(value));
}
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.searchParams.has('api_key') ? url.href : null;
  } catch { return null; }
}
export function nextSync(lastSuccessfulSync) {
  if (lastSuccessfulSync === null) return null;
  const time = Date.parse(lastSuccessfulSync);
  if (!Number.isFinite(time)) throw new Error('Invalid last-successful-sync timestamp.');
  return new Date(time + WEEK_MS).toISOString();
}
export function isDue(snapshot, now = new Date()) {
  return !snapshot.lastSuccessfulSync || now.getTime() >= Date.parse(nextSync(snapshot.lastSuccessfulSync));
}
export function emptySnapshot() {
  return { schemaVersion: 1, authorId: AUTHOR_ID, lastSuccessfulSync: null, nextScheduledSync: null, articles: [], reviewQueue: [] };
}
function validPaper(paper) {
  return typeof paper.title === 'string' && paper.title.length > 0 && Array.isArray(paper.authors) && paper.authors.every(author => typeof author === 'string') && paper.authors.some(isOwnName) &&
    typeof paper.venue === 'string' && paper.venue.length > 0 && Number.isInteger(paper.year) && paper.year >= 1900 && paper.year <= 2100 &&
    ['workshop', 'conference', 'manuscript', 'journal', 'preprint'].includes(paper.type) && typeof paper.status === 'string' && paper.status.length > 0 &&
    typeof paper.contribution === 'string' && Array.isArray(paper.links) && paper.links.every(link => typeof link.label === 'string' && safeUrl(link.url));
}
export function matchArticle(paper, articles, override = {}) {
  const titles = [normalizeTitle(paper.title), normalizeTitle(override.title)].filter(Boolean);
  return articles.find(article => article.attributionVerified &&
    (titles.includes(normalizeTitle(article.title)) || override.scholarCitationIds?.includes(article.citationId)));
}
export function approvedArticle(article, override) {
  return Boolean(override?.approved === true && safeUrl(override.verificationUrl) && validPaper(override) &&
    override.authors.every(author => typeof author === 'string') && article.attributionVerified);
}
export function getPublications(curated, snapshot, overrides = { records: {} }) {
  const seen = new Set();
  const articles = snapshot.articles ?? [];
  function enrich(paper, article) {
    const links = (paper.links ?? []).filter(link => typeof link.label === 'string' && safeUrl(link.url));
    if (article) {
      seen.add(article.citationId);
      if (safeUrl(article.scholarUrl) && !links.some(link => link.url === article.scholarUrl)) links.push({ label: 'Scholar', url: article.scholarUrl });
    }
    return { ...paper, links, citationCount: article?.citationCount ?? null };
  }
  const output = curated.flatMap(base => {
    const override = overrides.records?.[base.id] ?? {};
    const article = matchArticle(base, articles, override);
    if (article) seen.add(article.citationId);
    if (override.hidden) return [];
    // Only explicitly supported publication fields can enter the public page.
    const paper = { ...base };
    for (const field of ['title', 'authors', 'venue', 'year', 'status', 'type', 'contribution', 'links']) {
      if (Object.hasOwn(override, field)) paper[field] = override[field];
    }
    if (!validPaper(paper)) throw new Error(`Invalid curated publication/override: ${base.id}`);
    return [enrich(paper, article)];
  });
  for (const article of articles) {
    if (seen.has(article.citationId)) continue;
    const override = overrides.records?.[article.citationId];
    if (!override?.hidden && approvedArticle(article, override)) {
      const paper = { id: article.citationId };
      for (const field of ['title', 'authors', 'venue', 'year', 'status', 'type', 'contribution', 'links']) paper[field] = override[field];
      output.push(enrich(paper, article));
    }
  }
  return output;
}

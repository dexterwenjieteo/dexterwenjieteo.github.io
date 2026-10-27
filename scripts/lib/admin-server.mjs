import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { isDue } from '../../src/lib/publications.mjs';
import { runSync, readSnapshot, readJson, atomicJson, runtimeConfig, reviewQueue, SyncError } from './scholar-sync.mjs';

const assets = new URL('../admin/', import.meta.url);
export async function createAdminServer({ root, port = 4322, token = randomBytes(32).toString('hex'), sync = runSync, startTimer = true }) {
  const attemptFile = path.join(root, '.local/admin-attempts.json');
  const attempts = await readJson(attemptFile, { live: null, mock: null });
  for (const mode of ['live', 'mock']) if (attempts[mode]?.status === 'running') attempts[mode] = { status: 'interrupted', message: 'The previous process ended during a refresh. The durable successful timestamps below remain authoritative.' };
  const running = new Set();
  async function perform(mode, force, scenario) {
    if (running.has(mode)) throw new SyncError('BUSY', 'A refresh is already running.');
    running.add(mode);
    attempts[mode] = { status: 'running', startedAt: new Date().toISOString(), message: mode === 'mock' ? 'Running simulated synchronization in the mock sandbox…' : 'Retrieving and validating Google Scholar metadata…' };
    await atomicJson(attemptFile, attempts).catch(() => {});
    try {
      const result = await sync({ root, mode, force, scenario });
      attempts[mode] = { ...result, finishedAt: new Date().toISOString(), message: result.status === 'disabled' ? result.message : result.status === 'skipped' ? 'Not due yet. The seven-day timer is unchanged.' : mode === 'mock' ? 'Mock synchronization committed to the sandbox. No live cache or public page was changed.' : 'Publication cache and successful-refresh timestamps were committed.' };
      return attempts[mode];
    } catch (error) {
      const safe = error instanceof SyncError ? error : new SyncError('REFRESH_FAILED', 'Refresh failed. No successful refresh was reported. Check file access and retry.');
      attempts[mode] = { status: 'error', code: safe.code, message: safe.message, finishedAt: new Date().toISOString() };
      throw safe;
    } finally { running.delete(mode); await atomicJson(attemptFile, attempts).catch(() => {}); }
  }
  function json(response, status, body) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(body)); }
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const boundPort = server.address()?.port;
    const allowedHosts = [`127.0.0.1:${boundPort}`, `localhost:${boundPort}`];
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress) || !allowedHosts.includes(request.headers.host)) return json(response, 403, { error: 'Local connections only.' });
    let pathname;
    try { pathname = new URL(request.url, `http://${request.headers.host}`).pathname; }
    catch { return json(response, 400, { error: 'Invalid request URL.' }); }
    if (request.method === 'GET' && ['/', '/admin.js'].includes(pathname)) {
      const file = pathname === '/' ? 'index.html' : 'admin.js';
      response.writeHead(200, { 'Content-Type': file.endsWith('html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8' });
      response.end(await readFile(new URL(file, assets))); return;
    }
    const supplied = Buffer.from(request.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(response, 401, { error: 'Use the local administration URL printed in your terminal, or enter its access token.' });
    try {
      if (pathname === '/api/state' && request.method === 'GET') {
        const config = await runtimeConfig(root);
        const curated = await readJson(path.join(root, 'src/data/publications-curated.json'));
        const overrides = await readJson(path.join(root, 'src/data/publications-overrides.json'));
        const live = await readSnapshot(root), mock = await readSnapshot(root, 'mock');
        // Manual approvals appear immediately; no paid API call is needed.
        for (const snapshot of [live, mock]) snapshot.reviewQueue = reviewQueue(snapshot.articles, curated, overrides);
        return json(response, 200, { live, mock, attempts, liveSyncEnabled: config.enabled, keyConfigured: Boolean(config.key), automaticChecks: config.auto && Boolean(config.key), workflowUrl: 'https://github.com/dexterwenjieteo/dexterwenjieteo.github.io/actions/workflows/sync-publications.yml' });
      }
      if (['/api/refresh', '/api/check-due'].includes(pathname) && request.method === 'POST') {
        if (request.headers.origin !== `http://${request.headers.host}` || request.headers['content-type'] !== 'application/json') return json(response, 403, { error: 'Same-origin JSON requests are required.' });
        let raw = '';
        for await (const chunk of request) { raw += chunk; if (raw.length > 2048) throw new SyncError('BAD_REQUEST', 'Request is too large.'); }
        let body;
        try { body = JSON.parse(raw); } catch { throw new SyncError('BAD_REQUEST', 'Invalid request JSON.'); }
        if (!['live', 'mock'].includes(body.mode) || (body.scenario && !['success', 'empty', 'failure', 'duplicates'].includes(body.scenario))) throw new SyncError('BAD_REQUEST', 'Invalid mode or mock scenario.');
        return json(response, 200, await perform(body.mode, pathname === '/api/refresh', body.scenario));
      }
      json(response, 404, { error: 'Not found.' });
    } catch (error) {
      const code = error instanceof SyncError ? error.code : 'INTERNAL_ERROR';
      json(response, code === 'BUSY' ? 409 : code === 'BAD_REQUEST' ? 400 : code === 'MISSING_KEY' ? 503 : 500, { code, error: error instanceof SyncError ? error.message : 'The operation failed. Credentials and raw API responses are never returned.' });
    }
  });
  server.requestTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  let timer;
  if (startTimer) {
    timer = setInterval(async () => {
      try { const config = await runtimeConfig(root); if (config.auto && config.key && !running.has('live') && isDue(await readSnapshot(root))) await perform('live', false); }
      catch { /* Sanitized result is available in the authenticated dashboard. */ }
    }, 60000);
    timer.unref();
  }
  return { server, token, port: server.address().port, url: `http://127.0.0.1:${server.address().port}/#${token}`, close: async () => { clearInterval(timer); await new Promise(resolve => server.close(resolve)); } };
}

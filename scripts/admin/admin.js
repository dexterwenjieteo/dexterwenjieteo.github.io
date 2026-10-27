const el = id => document.getElementById(id);
let token = location.hash.slice(1);
try { token ||= sessionStorage.getItem('publication-admin-token') || ''; if (token) sessionStorage.setItem('publication-admin-token', token); } catch {}
history.replaceState(null, '', location.pathname);
let state;
let busy = false;
async function api(url, body) {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401) { el('unlock').hidden = false; el('dashboard').hidden = true; } throw new Error(data.error || 'Request failed.'); }
  return data;
}
function showResult(message, type = '') { el('result').textContent = message; el('result').className = `notice ${type}`; }
function render() {
  if (!state) return;
  const mode = el('mode').value;
  const snapshot = state[mode];
  const attempt = state.attempts[mode];
  el('mode-note').textContent = mode === 'mock' ? 'MOCK MODE: timestamps and metadata are written only to a separate sandbox. Mock successes never update the homepage or the live schedule.' : 'LIVE MODE: retrieves real Google Scholar metadata and updates the website cache. This can use your SerpApi quota.';
  el('scenario-label').hidden = mode !== 'mock';
  el('last').textContent = snapshot.lastSuccessfulSync || 'Never';
  el('next').textContent = mode === 'live' && !state.liveSyncEnabled ? `Paused (stored due date: ${snapshot.nextScheduledSync || 'none'})` : snapshot.nextScheduledSync || 'Due now; no successful refresh yet';
  el('status').textContent = attempt?.status || 'Idle';
  el('counts').textContent = `${snapshot.articles.length} / ${snapshot.reviewQueue.length}`;
  el('credential-status').textContent = !state.liveSyncEnabled ? 'Live refresh is disabled. Edit the curated data files to update the website. To re-enable later, set liveSyncEnabled to true in src/data/publication-settings.json. Mock mode remains available.' : state.keyConfigured ? `SerpApi key configured on the server. Local automatic checks ${state.automaticChecks ? 'enabled' : 'disabled'}.` : 'No SerpApi key configured. Mock mode works now. For live refresh, copy .env.example to .env and set SERPAPI_KEY there; never paste the key into this page.';
  el('workflow').href = state.workflowUrl;
  const list = el('review'); list.replaceChildren();
  snapshot.reviewQueue.forEach(item => { const li = document.createElement('li'); li.textContent = `${item.title} (${item.citationId}): ${item.reasons.join('; ')}`; list.append(li); });
  el('no-review').hidden = snapshot.reviewQueue.length > 0;
  if (!busy && attempt) showResult(attempt.message, attempt.status === 'error' ? 'error' : /success/.test(attempt.status) ? 'success' : '');
  for (const id of ['refresh', 'check-due']) el(id).disabled = busy || attempt?.status === 'running' || (mode === 'live' && !state.liveSyncEnabled);
  el('mode').disabled = busy; el('scenario').disabled = busy;
}
async function load() {
  try { state = await api('/api/state'); el('connection-status').textContent = ''; el('unlock').hidden = true; el('dashboard').hidden = false; render(); }
  catch (error) { el('connection-status').textContent = error.message; }
}
async function refresh(due = false) {
  busy = true; render(); showResult('Refreshing… waiting for validation and a committed cache update.');
  try { const result = await api(due ? '/api/check-due' : '/api/refresh', { mode: el('mode').value, scenario: el('scenario').value }); showResult(result.message, 'success'); }
  catch (error) { showResult(error.message, 'error'); }
  finally { busy = false; await load(); }
}
el('unlock-button').addEventListener('click', () => { token = el('token').value.trim(); try { sessionStorage.setItem('publication-admin-token', token); } catch {} void load(); });
el('mode').addEventListener('change', () => { showResult('Ready.'); render(); });
el('refresh').addEventListener('click', () => void refresh());
el('check-due').addEventListener('click', () => void refresh(true));
if (token) void load(); else el('unlock').hidden = false;
setInterval(() => { if (token) void load(); }, 2500);

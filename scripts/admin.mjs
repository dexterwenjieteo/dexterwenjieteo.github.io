import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAdminServer } from './lib/admin-server.mjs';
import { atomicJson } from './lib/scholar-sync.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const admin = await createAdminServer({ root });
  await atomicJson(path.join(root, '.local/admin-session.json'), { url: admin.url, token: admin.token, port: admin.port, pid: process.pid });
  console.log(`Local publication administration (keep this session URL private):\n${admin.url}`);
  console.log('The SerpApi key remains server-side. Mock mode never changes public data.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await admin.close(); process.exit(); });
} catch { console.error('Could not start local administration. Check that port 4322 is free and .local is writable.'); process.exitCode = 1; }

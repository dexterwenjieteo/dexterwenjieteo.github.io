import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runSync, SyncError } from './lib/scholar-sync.mjs';

const args = process.argv.slice(2);
if (args.some(arg => !['--mock', '--due'].includes(arg))) { console.error('Usage: npm run sync:publications -- [--mock] [--due]'); process.exit(1); }
try {
  const result = await runSync({ root: fileURLToPath(new URL('../', import.meta.url)), mode: args.includes('--mock') ? 'mock' : 'live', force: !args.includes('--due') });
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `content_changed=${result.contentChanged}\nstatus=${result.status}\n`);
} catch (error) {
  console.error(error instanceof SyncError ? `${error.code}: ${error.message}` : 'Publication refresh failed. The previous cache was retained.');
  process.exitCode = 1;
}

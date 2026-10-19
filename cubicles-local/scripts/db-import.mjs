import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/server/config.mjs';
import { initApp, shutdownApp } from '../src/server/runtime.mjs';
import { importStateFile, validateState } from '../src/server/store.mjs';

const args = process.argv.slice(2);
const valueOf = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const file = path.resolve(valueOf('--file') || config.importFile);

try {
  const text = await readFile(file, 'utf8');
  const parsed = JSON.parse(text);
  const state = parsed.data && parsed.version && parsed.revision ? parsed.data : parsed;
  validateState(state);
  console.log(`validated ${file}: ${state.users.length} users, ${state.zones.length} zones`);
  if (dryRun) {
    console.log('dry run: no database writes performed');
    process.exit(0);
  }

  await initApp({ monitoring: false, autoImport: false, createIfMissing: false });
  const result = await importStateFile(file, { force });
  console.log(JSON.stringify({ ok: true, file, ...result }, null, 2));
  if (!result.backup) console.log('no previous database state existed; nothing to roll back to');
} catch (error) {
  console.error(`import failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await shutdownApp().catch(() => {});
}

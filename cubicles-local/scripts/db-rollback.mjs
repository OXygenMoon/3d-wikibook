import path from 'node:path';
import { initApp, shutdownApp } from '../src/server/runtime.mjs';
import { restoreStateFile } from '../src/server/store.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: npm run db:rollback -- backups/community-<timestamp>.json');
  process.exit(1);
}

try {
  await initApp({ monitoring: false, autoImport: false });
  const result = await restoreStateFile(path.resolve(file));
  console.log(JSON.stringify({ ok: true, restored: path.resolve(file), ...result }, null, 2));
} catch (error) {
  console.error(`rollback failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await shutdownApp().catch(() => {});
}

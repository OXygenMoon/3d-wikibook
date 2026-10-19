import { initApp, shutdownApp } from '../src/server/runtime.mjs';
import { writeBackup, dumpState } from '../src/server/store.mjs';

try {
  await initApp({ monitoring: false, autoImport: false });
  const dump = await dumpState();
  if (!dump) throw new Error('database does not contain a community state yet');
  const file = await writeBackup(process.argv[2] || 'manual');
  console.log(JSON.stringify({ ok: true, file, users: dump.data.users.length, revision: dump.revision }, null, 2));
} catch (error) {
  console.error(`backup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await shutdownApp().catch(() => {});
}

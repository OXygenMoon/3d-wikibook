import { initDatabase, closeDatabase } from '../src/server/db.mjs';
import { writeFullBackup, pruneFullBackups } from '../src/server/backup.mjs';

try {
  await initDatabase({ migrate: false, reset: false, access: 'reader' });
  const directory = await writeFullBackup(process.argv[2] || 'manual');
  await pruneFullBackups();
  console.log(JSON.stringify({ ok: true, directory }, null, 2));
} catch (error) {
  console.error(`backup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => {});
}

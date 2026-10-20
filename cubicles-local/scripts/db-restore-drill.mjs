import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../src/server/config.mjs';
import { initDatabase, closeDatabase } from '../src/server/db.mjs';
import { writeFullBackup } from '../src/server/backup.mjs';

const temp = await mkdtemp(path.join(tmpdir(), 'cubicles-restore-drill-'));
try {
  await initDatabase({ migrate: false, reset: false, access: 'reader' });
  const backup = await writeFullBackup('drill-source');
  await closeDatabase();
  const env = {
    ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent', AUTO_IMPORT: 'false',
    CUBICLES_DATA_DIR: path.join(temp, 'data'), PGLITE_DIR: path.join(temp, 'pglite'),
    CUBICLES_BACKUP_DIR: path.join(temp, 'backups'), DATABASE_URL: '', CUBICLES_DB_RESET: '0',
  };
  for (const command of ['scripts/db-rollback.mjs', 'scripts/db-verify.mjs']) {
    const result = spawnSync(process.execPath, [command, backup], { cwd: config.root, env, encoding: 'utf8', timeout: 120_000 });
    if (result.status !== 0) throw new Error(`${command} failed:\n${result.stdout}\n${result.stderr}`);
  }
  console.log(JSON.stringify({ ok: true, backup, verified: ['community', 'models', 'sessions', 'messages', 'audit'] }, null, 2));
} catch (error) {
  console.error(`restore drill failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => {});
  await rm(temp, { recursive: true, force: true });
}

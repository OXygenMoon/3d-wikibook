import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../src/server/config.mjs';
import { initApp, shutdownApp } from '../src/server/runtime.mjs';
import { writeBackup } from '../src/server/store.mjs';

const temp = await mkdtemp(path.join(tmpdir(), 'cubicles-restore-drill-'));
let backup = null;

try {
  await initApp({ monitoring: false, autoImport: false });
  backup = await writeBackup('drill-source');
  if (!backup) throw new Error('no community state to back up');
  await shutdownApp();

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    AUTO_IMPORT: 'false',
    CUBICLES_DATA_DIR: path.join(temp, 'data'),
    PGLITE_DIR: path.join(temp, 'pglite'),
    DATABASE_URL: '',
  };

  const importRun = spawnSync(process.execPath, ['scripts/db-import.mjs', '--file', backup, '--force'], {
    cwd: config.root,
    env: { ...env, CUBICLES_DB_RESET: '1' },
    encoding: 'utf8',
  });
  if (importRun.status !== 0) {
    throw new Error(`import step failed:\n${importRun.stdout}\n${importRun.stderr}`);
  }

  const verifyRun = spawnSync(process.execPath, ['scripts/db-verify.mjs', backup], {
    cwd: config.root,
    env,
    encoding: 'utf8',
  });
  if (verifyRun.status !== 0) {
    throw new Error(`verify step failed:\n${verifyRun.stdout}\n${verifyRun.stderr}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        backup,
        restoredInto: temp,
        import: importRun.stdout.trim(),
        verify: verifyRun.stdout.trim(),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(`restore drill failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await shutdownApp().catch(() => {});
  await rm(temp, { recursive: true, force: true });
}

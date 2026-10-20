import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { initApp, shutdownApp } from '../src/server/runtime.mjs';
import { getState } from '../src/server/store.mjs';
import { initDatabase, closeDatabase } from '../src/server/db.mjs';
import { databaseSnapshot, verifyFullBackup } from '../src/server/backup.mjs';
import { config } from '../src/server/config.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/db-verify.mjs <backup.json>');
  process.exit(1);
}

try {
  if ((await stat(file)).isDirectory()) {
    const expected = await verifyFullBackup(path.resolve(file));
    await initDatabase({ migrate: false, reset: false, access: 'reader' });
    if (!isDeepStrictEqual(await databaseSnapshot(), expected.tables)) throw new Error('restored database tables do not match the backup');
    for (const entry of expected.manifest.files.filter(entry => entry.path.startsWith('models/'))) {
      const original = await readFile(path.join(file, entry.path));
      const restored = await readFile(path.join(config.modelsDir, path.basename(entry.path)));
      if (!original.equals(restored)) throw new Error(`restored model does not match: ${entry.path}`);
    }
    console.log(JSON.stringify({ ok: true, file: path.resolve(file), verified: ['community', 'models', 'sessions', 'messages', 'audit'] }, null, 2));
  } else {
    const parsed = JSON.parse(await readFile(path.resolve(file), 'utf8'));
    const expected = parsed.data || parsed;
    await initApp({ monitoring: false, autoImport: false });
    const actual = getState();
    if (!isDeepStrictEqual(actual, expected)) {
      console.error(`verification failed: ${file} does not match the loaded database state`);
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ ok: true, file: path.resolve(file), users: actual.users.length, zones: actual.zones.length }, null, 2));
    }
  }
} catch (error) {
  console.error(`verification failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await shutdownApp().catch(() => {});
  await closeDatabase().catch(() => {});
}

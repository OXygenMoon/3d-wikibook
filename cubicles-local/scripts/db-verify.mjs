import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { initApp, shutdownApp } from '../src/server/runtime.mjs';
import { getState } from '../src/server/store.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/db-verify.mjs <backup.json>');
  process.exit(1);
}

try {
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
} catch (error) {
  console.error(`verification failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await shutdownApp().catch(() => {});
}

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = await mkdtemp(path.join(tmpdir(), 'cubicles-lock-'));
Object.assign(process.env, { CUBICLES_DATA_DIR: directory, PGLITE_DIR: path.join(directory, 'pglite'), DATABASE_URL: '', AUTO_IMPORT: 'false', LOG_LEVEL: 'silent', CUBICLES_DB_RESET: '0' });
const { initDatabase, closeDatabase } = await import('../src/server/db.mjs');
after(async () => { await closeDatabase(); await rm(directory, { recursive: true, force: true }); });

test('another process cannot open an active PGlite database, including backup readers', async () => {
  await initDatabase();
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import {initDatabase} from './src/server/db.mjs'; await initDatabase({access:'reader',migrate:false,reset:false});"], { encoding: 'utf8', env: process.env });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PGlite 数据库正在使用/);
  await closeDatabase();
  const unlocked = spawnSync(process.execPath, ['--input-type=module', '-e', "import {initDatabase,closeDatabase} from './src/server/db.mjs'; await initDatabase({access:'reader',migrate:false,reset:false}); await closeDatabase();"], { encoding: 'utf8', env: process.env });
  assert.equal(unlocked.status, 0, unlocked.stderr);
});

test('a lock belonging to a dead process is recoverable', async () => {
  const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  await writeFile(`${process.env.PGLITE_DIR}.lock`, JSON.stringify({ pid: dead.pid, owner: 'abandoned' }));
  await initDatabase();
  await closeDatabase();
});

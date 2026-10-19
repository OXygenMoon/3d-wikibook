import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'cubicles-session-'));
process.env.CUBICLES_DATA_DIR = join(directory, 'data');
process.env.PGLITE_DIR = join(directory, 'pglite');
process.env.CUBICLES_DB_RESET = '1';
process.env.AUTO_IMPORT = 'false';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = '';

const { initApp, shutdownApp } = await import('../src/server/runtime.mjs');
const { getState } = await import('../src/server/store.mjs');
const { freshSession } = await import('../src/server/auth.mjs');
const { sessions, loadSessions, persistSession, deleteSession } = await import('../src/server/session-store.mjs');

after(async () => {
  await shutdownApp();
  await rm(directory, { recursive: true, force: true });
});

test('sessions survive a cache reload and can be revoked from the database', async () => {
  await initApp({ monitoring: false, autoImport: false });
  const admin = getState().users[0];
  const session = await freshSession(admin);
  assert.ok(sessions.has(session.id));

  sessions.clear();
  await loadSessions();
  assert.equal(sessions.get(session.id)?.userId, admin.id);

  session.x = 12.5;
  session.z = -3.25;
  await persistSession(session);
  sessions.clear();
  await loadSessions();
  assert.equal(sessions.get(session.id)?.x, 12.5);
  assert.equal(sessions.get(session.id)?.z, -3.25);

  await deleteSession(session.id);
  sessions.clear();
  await loadSessions();
  assert.equal(sessions.has(session.id), false);
});

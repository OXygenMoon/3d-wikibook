import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = await mkdtemp(path.join(tmpdir(), 'cubicles-full-backup-'));
Object.assign(process.env, {
  CUBICLES_DATA_DIR: directory, PGLITE_DIR: path.join(directory, 'pglite'),
  CUBICLES_BACKUP_DIR: path.join(directory, 'backups'), DATABASE_URL: process.env.BACKUP_TEST_DATABASE_URL || '',
  AUTO_IMPORT: 'false', NODE_ENV: 'test', LOG_LEVEL: 'silent', CUBICLES_DB_RESET: '0',
});
const { initApp, shutdownApp } = await import('../src/server/runtime.mjs');
const { getState, saveState } = await import('../src/server/store.mjs');
const { databaseSnapshot, writeFullBackup, verifyFullBackup, restoreFullBackup } = await import('../src/server/backup.mjs');
const { freshSession } = await import('../src/server/auth.mjs');
const { addMessage } = await import('../src/server/message-store.mjs');
const { writeAudit } = await import('../src/server/audit.mjs');
const { getDb } = await import('../src/server/db.mjs');
const schema = await import('../src/server/db/schema.mjs');
let server;
after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await shutdownApp();
  await rm(directory, { recursive: true, force: true });
});

test('full backup restores models, layouts, sessions, messages and audit across a restart', async () => {
  await initApp({ monitoring: false });
  const state = getState();
  const admin = state.users[0];
  const id = randomUUID();
  const bytes = await readFile(new URL('../public/examples/grid-pavilion.glb', import.meta.url));
  await writeFile(path.join(directory, 'models', `${id}.glb`), bytes);
  state.modelAssets.push({ id, name: '备份模型', ownerId: admin.id, visibility: 'private', scale: 1, width: 4, height: 3, depth: 4, url: `/uploads/${id}.glb`, description: '' });
  state.officeStyles[admin.officeId] = { furniture: [{ id: 'backup-placement', itemId: `model:${id}`, x: 0, z: 0, rotation: 0 }] };
  await saveState();
  const session = await freshSession(admin);
  await addMessage({ id: randomUUID(), name: admin.name, text: '备份消息', time: Date.now(), playerId: session.id });
  await writeAudit({ actorId: admin.id, action: 'backup.test', detail: { model: id } });
  const expected = await databaseSnapshot();
  const backup = await writeFullBackup('test');
  assert.deepEqual((await verifyFullBackup(backup)).tables, expected);
  await getDb().delete(schema.sessions);
  await getDb().delete(schema.messages);
  await getDb().delete(schema.auditLog);
  await rm(path.join(directory, 'models', `${id}.glb`));
  await getDb().delete(schema.communityState);
  await restoreFullBackup(backup);
  assert.deepEqual(await databaseSnapshot(), expected);
  assert.deepEqual(await readFile(path.join(directory, 'models', `${id}.glb`)), bytes);
  await shutdownApp();
  await initApp({ monitoring: false });
  ({ server } = await import('../server.mjs'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const me = await fetch(`${base}/api/me`, { headers: { Cookie: `community_session=${session.id}` } });
  assert.equal((await me.json()).user.id, admin.id);
  const model = await fetch(`${base}/uploads/${id}.glb`, { headers: { Cookie: `community_session=${session.id}` } });
  assert.equal(model.status, 200);
  assert.deepEqual(Buffer.from(await model.arrayBuffer()), bytes);
  const world = await (await fetch(`${base}/api/world`, { headers: { Cookie: `community_session=${session.id}` } })).json();
  assert.equal(world.offices.find(office => office.id === admin.officeId).furniture[0].itemId, `model:${id}`);
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: admin.username, password: '123456' }) });
  assert.equal(login.status, 200);
});

test('tampered files and unsafe paths are rejected before modifying the database', async () => {
  const backup = await writeFullBackup('tamper-test');
  const before = await databaseSnapshot();
  const manifestPath = path.join(backup, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const model = manifest.files.find(file => file.path.startsWith('models/'));
  await writeFile(path.join(backup, model.path), 'damaged model');
  await assert.rejects(restoreFullBackup(backup), /校验失败/);
  assert.deepEqual(await databaseSnapshot(), before);
  manifest.files[0].path = '../outside.json';
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(restoreFullBackup(backup), /路径无效/);
});

test('missing models abort backup without publishing an incomplete bundle', async () => {
  const id = getState().modelAssets[0].id;
  const file = path.join(directory, 'models', `${id}.glb`);
  const bytes = await readFile(file);
  await rm(file);
  try {
    await assert.rejects(writeFullBackup('missing-test'), /ENOENT/);
    assert.ok(!(await readdir(path.join(directory, 'backups'))).some(name => name.includes('missing-test') || name.startsWith('.pending-')));
  } finally {
    await writeFile(file, bytes);
  }
});

test('a failed database restore rolls back tables and removes newly copied models', async () => {
  const backup = await writeFullBackup('transaction-test');
  const before = await databaseSnapshot();
  const snapshotPath = path.join(backup, 'snapshot.json');
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  snapshot.tables.sessions.push(snapshot.tables.sessions[0]);
  const snapshotBytes = Buffer.from(JSON.stringify(snapshot));
  await writeFile(snapshotPath, snapshotBytes);
  const manifestPath = path.join(backup, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const entry = manifest.files.find(file => file.path === 'snapshot.json');
  entry.bytes = snapshotBytes.length;
  entry.sha256 = createHash('sha256').update(snapshotBytes).digest('hex');
  await writeFile(manifestPath, JSON.stringify(manifest));
  const modelPath = path.join(directory, 'models', `${getState().modelAssets[0].id}.glb`);
  const bytes = await readFile(modelPath);
  await rm(modelPath);
  try {
    await assert.rejects(restoreFullBackup(backup, { backupCurrent: false }));
    assert.deepEqual(await databaseSnapshot(), before);
    await assert.rejects(readFile(modelPath), { code: 'ENOENT' });
  } finally {
    await writeFile(modelPath, bytes);
  }
});

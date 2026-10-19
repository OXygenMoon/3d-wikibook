import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'cubicles-store-'));
process.env.CUBICLES_DATA_DIR = join(directory, 'data');
process.env.PGLITE_DIR = join(directory, 'pglite');
process.env.CUBICLES_BACKUP_DIR = join(directory, 'backups');
process.env.AUTO_IMPORT = 'false';
process.env.CUBICLES_DB_RESET = '1';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
// This file always uses its own embedded PGlite so it can run in parallel
// with the PostgreSQL-backed integration suite.
process.env.DATABASE_URL = '';

const { initApp, shutdownApp } = await import('../src/server/runtime.mjs');
const { importStateFile, restoreStateFile, dumpState, getState, writeBackup } = await import('../src/server/store.mjs');

after(async () => {
  await shutdownApp();
  await rm(directory, { recursive: true, force: true });
});

const sample = {
  version: 2,
  visitors: 7,
  users: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      username: 'imported',
      name: '导入用户',
      passwordHash: 'salt:digest',
      role: 'user',
      classId: 1,
      officeId: 1002,
      avatar: 'classic',
      color: '#a6b79a',
      inventory: {},
      score: 3,
      createdAt: 1,
    },
  ],
  zones: [{ id: 1, name: '导入班级', x: 0, z: 0, columns: 2, rows: 2, spacing: 7, color: '#91ad83' }],
  settings: { timeMode: 'manual', hour: 9 },
  officeStyles: {},
  stickers: [],
  buildings: [],
  officePositions: {},
  modelAssets: [],
  layoutRevision: 4,
};

test('JSON import is validated, backed up and restorable', async () => {
  const source = join(directory, 'community.json');
  await writeFile(source, JSON.stringify(sample, null, 2));

  await initApp({ monitoring: false, autoImport: false, createIfMissing: false });
  const imported = await importStateFile(source, { force: true });
  assert.equal(imported.users, 1);
  assert.ok(imported.sourceBackup);
  assert.equal(getState().users[0].username, 'imported');
  assert.equal(getState().visitors, 7);

  const backup = await writeBackup('test');
  assert.ok(backup);
  assert.ok((await readFile(backup, 'utf8')).includes('导入用户'));

  const snapshot = await dumpState();
  const snapshotFile = join(directory, 'snapshot.json');
  await writeFile(snapshotFile, JSON.stringify(snapshot));
  getState().users[0].name = '已修改';
  await restoreStateFile(snapshotFile);
  assert.equal(getState().users[0].name, '导入用户');
});

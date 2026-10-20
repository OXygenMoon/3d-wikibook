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
const { importStateFile, restoreStateFile, dumpState, getState, writeBackup, normalizeState } = await import('../src/server/store.mjs');

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

test('legacy model scales remain unset across repeated normalization', async () => {
  for (const scale of [undefined, null, 0, -1, '', NaN, Infinity, 'invalid']) {
    const state = structuredClone(sample);
    state.modelAssets = [{ id: 'legacy-model', width: 4, height: 3, depth: 2, scale }];
    await normalizeState(state);
    assert.equal(state.modelAssets[0].scale, null);
    assert.equal(state.modelAssets[0].visibility, 'shared');
    await normalizeState(state);
    assert.equal(state.modelAssets[0].scale, null);
  }
  const state = structuredClone(sample);
  state.modelAssets = [{ id: 'scaled-model', scale: '1.2' }];
  await normalizeState(state);
  await normalizeState(state);
  assert.equal(state.modelAssets[0].scale, 1.2);
});

test('legacy scenery migrates once, avoids existing land and never resurrects collected props',async()=>{
 const source=structuredClone(sample);
 source.buildings=[{id:'model-existing',kind:'custom',name:'已建建筑',gridX:-58,gridZ:59,width:5,depth:5,rotation:0,enabled:true}];
 await normalizeState(source);
 const props=source.buildings.filter(building=>['tree','streetlight'].includes(building.kind));
 assert.equal(props.length,72);assert.ok(props.some(prop=>prop.enabled===false));
 const revision=source.layoutRevision;
 source.buildings=source.buildings.filter(building=>building.id!==props[0].id);
 await normalizeState(source);
 assert.equal(source.buildings.filter(building=>['tree','streetlight'].includes(building.kind)).length,71);
 assert.equal(source.layoutRevision,revision);
});

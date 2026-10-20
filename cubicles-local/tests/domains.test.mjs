import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';

const directory = await mkdtemp(path.join(tmpdir(), 'cubicles-domains-'));
Object.assign(process.env, { CUBICLES_DATA_DIR: directory, PGLITE_DIR: path.join(directory,'pglite'), CUBICLES_BACKUP_DIR: path.join(directory,'backups'), DATABASE_URL: process.env.DOMAIN_TEST_DATABASE_URL || '', AUTO_IMPORT:'false', CUBICLES_DB_RESET:'0', LOG_LEVEL:'silent', NODE_ENV:'test' });
const { initDatabase, closeDatabase, getDb } = await import('../src/server/db.mjs');
const { initStore, getState, saveState, createDefaultState, bumpRevision, withStateContext } = await import('../src/server/store.mjs');
const { databaseSnapshot, restoreFullBackup } = await import('../src/server/backup.mjs');
const schema = await import('../src/server/db/schema.mjs');
let legacy, modelBytes;
after(async () => { await closeDatabase(); await rm(directory,{recursive:true,force:true}); });

test('legacy community JSON migrates to domain rows and survives a restart without duplicate document data', async () => {
  await initDatabase();
  legacy = await createDefaultState();
  const id = randomUUID();
  modelBytes = await readFile(new URL('../public/examples/grid-pavilion.glb',import.meta.url));
  legacy.modelAssets.push({id,name:'迁移模型',ownerId:legacy.users[0].id,visibility:'private',scale:1.2,width:4,height:3,depth:4,url:`/uploads/${id}.glb`});
  legacy.officeStyles[1001] = {name:'迁移工位',furniture:[{id:'legacy-placement',itemId:`model:${id}`,x:0,z:.5,rotation:0}]};
  await mkdir(path.join(directory,'models'));
  await writeFile(path.join(directory,'models',`${id}.glb`),modelBytes);
  await getDb().insert(schema.communityState).values({id:1,version:2,revision:7,data:legacy});
  await initStore();
  const metadata = (await getDb().select().from(schema.communityState))[0];
  assert.equal(metadata.data.domainStorage,1);
  for(const key of ['users','zones','modelAssets','buildings','officeStyles','classTasks','classSubmissions','rewardGrants'])assert.equal(metadata.data[key],undefined);
  assert.equal((await getDb().select().from(schema.users))[0].username,legacy.users[0].username);
  assert.equal((await getDb().select().from(schema.modelAssets))[0].id,id);
  assert.equal((await getDb().select().from(schema.officeLayouts))[0].data.style.name,'迁移工位');
  assert.ok((await readdir(path.join(directory,'backups'))).some(name=>name.includes('pre-domain-migration')));
  await closeDatabase(); await initDatabase(); await initStore();
  assert.equal(getState().users[0].id,legacy.users[0].id);
  assert.equal(getState().officeStyles[1001].furniture[0].itemId,`model:${id}`);
});

test('domain constraints roll back user changes and community metadata in the same transaction', async () => {
  const before = await databaseSnapshot();
  const state = getState();
  state.users[0].name = '事务失败后不应保留';
  state.settings.hour = 23;
  state.users.push({...state.users[0],id:randomUUID(),officeId:1002});
  bumpRevision();
  await assert.rejects(saveState());
  assert.deepEqual(await databaseSnapshot(),before);
  assert.equal(getState().users.length,1);
  assert.equal(getState().users[0].name,legacy.users[0].name);
  await initStore();
  assert.equal(getState().users.length,1);
  assert.equal(getState().users[0].name,legacy.users[0].name);
});

test('legacy four-table full backups remain restorable and migrate after reopening', async () => {
  const backup = path.join(directory,'legacy-bundle');
  await mkdir(path.join(backup,'models'),{recursive:true});
  const snapshot = Buffer.from(JSON.stringify({format:'cubicles-full-backup',version:1,tables:{communityState:[{id:1,version:2,revision:7,data:legacy,updatedAt:new Date().toISOString()}],sessions:[],messages:[],auditLog:[]}}));
  const modelPath = `models/${legacy.modelAssets[0].id}.glb`;
  await writeFile(path.join(backup,'snapshot.json'),snapshot);
  await writeFile(path.join(backup,modelPath),modelBytes);
  await writeFile(path.join(backup,'manifest.json'),JSON.stringify({format:'cubicles-full-backup',version:1,files:[{path:'snapshot.json',bytes:snapshot.length,sha256:createHash('sha256').update(snapshot).digest('hex')},{path:modelPath,bytes:modelBytes.length,sha256:createHash('sha256').update(modelBytes).digest('hex')}]}));
  await restoreFullBackup(backup);
  assert.equal((await getDb().select().from(schema.users)).length,0);
  await initStore();
  assert.equal(getState().users[0].id,legacy.users[0].id);
  assert.equal((await getDb().select().from(schema.users).where(eq(schema.users.id,legacy.users[0].id))).length,1);
  assert.equal(getState().officeStyles[1001].name,'迁移工位');
});

test('requests already in flight cannot commit stale state after another write rolls back',async()=>{
 let release;
 const gate=new Promise(resolve=>release=resolve);
 const before=await databaseSnapshot();
 const pending=withStateContext(async()=>{
  const old=getState();
  await gate;
  assert.throws(()=>getState(),error=>error.status===503);
  old.settings.hour=22;
  await assert.rejects(saveState(),error=>error.status===503);
 });
 getState().users.push({...getState().users[0],id:randomUUID(),officeId:1002});
 await assert.rejects(saveState());
 release();await pending;
 assert.deepEqual(await databaseSnapshot(),before);
 assert.equal(getState().users.length,1);
});

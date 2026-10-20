import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import { config } from '../src/server/config.mjs';
import { validateGLB } from '../lib/validate-glb.mjs';
import { createStressGLB } from '../lib/stress-model.mjs';

const count = Number(process.env.PERF_USERS || 30);
const rounds = Number(process.env.PERF_ROUNDS || 10);
const limit = Number(process.env.PERF_P95_LIMIT_MS || 1000);
if (!Number.isInteger(count) || count < 1 || count > 100 || !Number.isInteger(rounds) || rounds < 1 || rounds > 120) throw new Error('PERF_USERS 需为 1–100，PERF_ROUNDS 需为 1–120。');
const databaseUrl = process.env.PERF_DATABASE_URL || '';
if (databaseUrl && !/_(perf|performance|test)(_|$)/.test(new URL(databaseUrl).pathname)) throw new Error('PERF_DATABASE_URL 必须指向专用 perf/performance/test 数据库。');
await mkdir(path.join(config.root, '.tmp', 'acceptance'), { recursive: true });
const directory = await mkdtemp(path.join(config.root, '.tmp', 'performance-'));
const probe = net.createServer();
await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port = probe.address().port;
await new Promise(resolve=>probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const lines = [];
const server = spawn(process.execPath, ['server.mjs', '--production'], {
  cwd: config.root, env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test', LOG_LEVEL: 'warn', HOST: '127.0.0.1', PORT: String(port), CUBICLES_DATA_DIR: directory, PGLITE_DIR: path.join(directory, 'pglite'), AUTO_IMPORT: 'false', CUBICLES_DB_RESET: '0', DEFAULT_ADMIN_USERNAME: 'perfadmin', DEFAULT_ADMIN_PASSWORD: 'performance-test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data',chunk=>lines.push(String(chunk)));
server.stderr.on('data',chunk=>lines.push(String(chunk)));
let processError;
server.on('error',error=>processError=error);
const timings = {};
let requests = 0;
async function request(kind, url, token, data, method = data ? 'POST' : 'GET', raw = false) {
  const start = performance.now();
  const response = await fetch(base + url, { method, headers: { 'Content-Type': raw?'model/gltf-binary':'application/json', ...(token?{'X-Session-Token':token}:{}) }, ...(data?{body:raw?data:JSON.stringify(data)}:{}), signal: AbortSignal.timeout(15_000) });
  const result = await response.json();
  assert.ok(response.ok, `${url} ${response.status}: ${result.error}`);
  (timings[kind] ||= []).push(performance.now()-start);
  requests += 1;
  return result;
}
try {
  const until = Date.now() + 60_000;
  let healthy = false;
  while (Date.now()<until) {
    if (processError || server.exitCode !== null) throw processError || new Error(lines.join(''));
    try { if ((await fetch(`${base}/healthz`,{signal:AbortSignal.timeout(1000)})).ok) {healthy=true;break;} } catch {}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(healthy,'performance server did not become ready');
  const admin = await request('setup','/api/login',null,{username:'perfadmin',password:'performance-test'});
  const users = (await request('setup','/api/admin',admin.token)).users;
  assert.equal(users.length,1,'性能测试必须使用全新数据库。');
  if (count<=34) {
    const world=await request('setup','/api/world');
    await request('setup','/api/admin/zones/1',admin.token,{...world.zones[0],rows:5,columns:7},'PATCH');
  } else {
    const world=await request('setup','/api/world');
    await request('setup','/api/admin/zones/1',admin.token,{...world.zones[0],x:-30,z:0,rows:7,columns:8},'PATCH');
    await request('setup','/api/admin/zones',admin.token,{name:'性能测试二班',x:30,z:0,rows:7,columns:8,spacing:7,color:'#99aa88'});
  }
  const rows=Array.from({length:count},(_,index)=>({username:`perf${String(index).padStart(3,'0')}`,password:'performance-test',name:`测试用户${index}`,classId:count>34&&index>=55?2:1}));
  await request('setup','/api/admin/import',admin.token,{users:rows});
  const clients=await Promise.all(rows.map(async row=>({...(await request('login','/api/login',null,{username:row.username,password:row.password})),username:row.username})));
  const world=await request('world','/api/world');
  for(const client of clients)client.office=world.offices.find(office=>office.ownerId===client.user.id);
  await Promise.all(clients.map(client=>request('tick','/api/tick',client.token,{x:client.office.x,z:client.office.z+1.5})));
  const bytes=process.env.PERF_MODEL==='stress'?createStressGLB():await readFile(new URL('../public/examples/grid-pavilion.glb',import.meta.url));
  await Promise.all(clients.map(async client=>{client.asset=(await request('upload','/api/models?filename=load.glb&scale=1',client.token,bytes,'POST',true)).asset;}));
  await Promise.all(clients.map(client=>request('save',`/api/offices/${client.office.id}`,client.token,{name:`${client.username}的测试工位`,furniture:[...client.office.furniture,{id:'performance-model',itemId:`model:${client.asset.id}`,x:0,z:.5,rotation:0}]},'PATCH')));
  const started=performance.now();
  for(let round=0;round<rounds;round+=1){
    const begin=performance.now();
    await Promise.all(clients.map(client=>request('tick','/api/tick',client.token,{x:client.office.x,z:client.office.z+1.5,rotation:round*.1})));
    await request('world','/api/world');
    const rest=1000-(performance.now()-begin);
    if(rest>0)await new Promise(resolve=>setTimeout(resolve,rest));
  }
  const final=await request('world','/api/world');
  for(const client of clients)assert.ok(final.offices.find(office=>office.ownerId===client.user.id).furniture.some(placed=>placed.itemId===`model:${client.asset.id}`));
  const summaries=Object.fromEntries(Object.entries(timings).map(([kind,values])=>{const sorted=values.slice().sort((first,second)=>first-second);return [kind,{requests:values.length,p50Ms:Number(sorted[Math.floor((sorted.length-1)*.5)].toFixed(2)),p95Ms:Number(sorted[Math.ceil((sorted.length-1)*.95)].toFixed(2)),maxMs:Number(sorted.at(-1).toFixed(2))}];}));
  const health=await(await fetch(`${base}/healthz`)).json();
  const result={ok:true,users:count,driver:databaseUrl?'postgres':'pglite',rounds,requests,durationSeconds:Number(((performance.now()-started)/1000).toFixed(2)),latencies:summaries,model:validateGLB(bytes),sessionPersistence:health.sessionPersistence,p95LimitMs:limit,hardware:'current development machine; HTTP clients with one imported model each',rendering:'not measured by this script'};
  assert.ok(summaries.tick.p95Ms<=limit,`tick p95 ${summaries.tick.p95Ms} exceeds ${limit}`);
  assert.ok(summaries.save.p95Ms<=limit,`save p95 ${summaries.save.p95Ms} exceeds ${limit}`);
  const label=process.env.PERF_LABEL||'latest';
  if(!/^[a-z0-9-]+$/i.test(label))throw new Error('PERF_LABEL 无效。');
  await writeFile(path.join(config.root,'.tmp','acceptance',`performance-${count}-${label}.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {
  if(server.pid&&server.exitCode===null){server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}
  await rm(directory,{recursive:true,force:true});
}

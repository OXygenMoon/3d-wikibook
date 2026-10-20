import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/server/config.mjs';
import { createDefaultState } from '../src/server/store.mjs';

await mkdir(path.join(config.root, '.tmp'), { recursive: true });
const temp = await mkdtemp(path.join(config.root, '.tmp', 'deployment-'));
const project = `cubicles-check-${process.pid}`;
const port = Number(process.env.DEPLOYMENT_TEST_PORT || 4273);
const base = `http://127.0.0.1:${port}`;
const compose = process.env.COMPOSE_COMMAND || 'docker-compose';
const override = path.join(temp, 'compose.json');
const argumentsBase = ['-p', project, '-f', path.join(config.root, 'compose.yaml'), '-f', override];
const env = { ...process.env, CUBICLES_PORT: String(port), DEFAULT_ADMIN_USERNAME: 'lzy', DEFAULT_ADMIN_PASSWORD: '123456', POSTGRES_USER: 'cubicles', POSTGRES_PASSWORD: 'cubicles-test', POSTGRES_DB: 'cubicles_check', AUTO_IMPORT: 'true' };
const execute = args => new Promise((resolve, reject) => {
  const child = spawn(compose, [...argumentsBase, ...args], { cwd: config.root, env, stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${args.join(' ')} exited with ${code}`)));
});

async function ready() {
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    try {
      const response = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('deployment did not become healthy');
}

async function json(url, data, token) {
  const response = await fetch(base + url, {
    method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Session-Token': token } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  assert.ok(response.ok, `${url}: ${response.status}`);
  return response.json();
}

try {
  await mkdir(path.join(temp, 'data', 'models'), { recursive: true });
  await mkdir(path.join(temp, 'backups'));
  await writeFile(override, JSON.stringify({ services: {
    app: { volumes: [`${temp}/data:/data`, `${temp}/backups:/app/backups`] },
    backup: { volumes: [`${temp}/data:/data`, `${temp}/backups:/app/backups`] },
  } }));
  const state = await createDefaultState();
  const id = randomUUID();
  const model = await readFile(new URL('../public/examples/grid-pavilion.glb', import.meta.url));
  state.modelAssets.push({ id, name: '部署验收模型', ownerId: state.users[0].id, visibility: 'private', scale: 1, width: 4, height: 3, depth: 4, url: `/uploads/${id}.glb` });
  state.officeStyles[state.users[0].officeId] = { furniture: [{ id: 'deployment-model', itemId: `model:${id}`, x: 0, z: 0, rotation: 0 }] };
  await writeFile(path.join(temp, 'data', 'community.json'), JSON.stringify(state), { mode: 0o600 });
  await writeFile(path.join(temp, 'data', 'models', `${id}.glb`), model, { mode: 0o600 });
  await execute(['up', '--build', '-d', 'app']);
  await ready();
  assert.equal((await json('/healthz')).driver, 'postgres');
  assert.ok((await fetch(base+'/')).ok);
  assert.ok((await fetch(base+'/src/world.js')).ok);
  const login = await json('/api/login', { username: 'lzy', password: '123456' });
  const token = login.token;
  await json('/api/messages', { text: '部署验收聊天' }, token);
  const world = await json('/api/world');
  assert.ok(world.offices.some(office => office.furniture.some(item => item.itemId === `model:${id}`)));
  await execute(['exec', '-T', 'app', 'npm', 'run', 'db:backup', '--', 'deployment']);
  await execute(['exec', '-T', 'app', 'npm', 'run', 'db:restore-drill']);
  await execute(['restart', 'app']);
  await ready();
  assert.equal((await json('/api/me', null, token)).user.id, login.user.id);
  const downloaded = await fetch(`${base}/uploads/${id}.glb`, { headers: { 'X-Session-Token': token } });
  assert.equal(downloaded.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), model);
  const tick = await json('/api/tick', { x: 0, z: 24 }, token);
  assert.ok(tick.messages.some(message => message.text === '部署验收聊天'));
  const result = { ok: true, driver: 'postgres', verified: ['image-build', 'json-import', 'model-download', 'session-restart', 'chat-restart', 'backup', 'isolated-full-restore'], secondMachine: 'not verified' };
  await mkdir(path.join(config.root, '.tmp', 'acceptance'), { recursive: true });
  await writeFile(path.join(config.root, '.tmp', 'acceptance', 'deployment-check.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await execute(['logs', '--tail', '80', 'app']).catch(() => {});
  throw error;
} finally {
  await execute(['down', '-v', '--remove-orphans']).catch(error => console.error(error.message));
  await rm(temp, { recursive: true, force: true });
}

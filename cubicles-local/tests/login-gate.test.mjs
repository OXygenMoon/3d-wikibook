import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = await mkdtemp(path.join(tmpdir(), 'cubicles-login-gate-'));
Object.assign(process.env, { CUBICLES_DATA_DIR: directory, PGLITE_DIR: path.join(directory, 'pglite'), DATABASE_URL: '', AUTO_IMPORT: 'false', LOG_LEVEL: 'silent', NODE_ENV: 'test', CUBICLES_DB_RESET: '0', REQUIRE_LOGIN: 'true' });
const { server } = await import('../server.mjs');
const { shutdownApp } = await import('../src/server/runtime.mjs');
const { sessions } = await import('../src/server/session-store.mjs');
const { freshSession } = await import('../src/server/auth.mjs');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(async () => { await new Promise(resolve => server.close(resolve)); await shutdownApp(); await rm(directory, { recursive: true, force: true }); });
async function call(url, token, method = 'GET', data) {
  return fetch(base + url, { method, headers: { ...(token ? { 'X-Session-Token': token } : {}), 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
}

test('visitors and legacy guest sessions cannot access world, community APIs or model files', async () => {
  const count = sessions.size;
  const bootstrap = await (await call('/api/session', '', 'POST', {})).json();
  assert.deepEqual({ user: bootstrap.user, token: bootstrap.token, loginRequired: bootstrap.loginRequired }, { user: null, token: '', loginRequired: true });
  assert.equal(sessions.size, count);
  const guest = await freshSession(null);
  for (const token of ['', guest.id, 'expired-token']) {
    for (const url of ['/api/world', '/api/stickers', '/api/models', '/api/pond', '/models/commons.glb', '/uploads/00000000-0000-0000-0000-000000000000.glb']) assert.equal((await call(url, token)).status, 401, url);
    assert.equal((await call('/api/tick', token, 'POST', { x: 0, z: 0 })).status, 401);
  }
  assert.equal((await call('/')).status, 200);
  assert.equal((await call('/healthz')).status, 200);
  assert.equal((await call('/api/login', '', 'POST', { username: 'lzy', password: 'wrong' })).status, 401);
});

test('authenticated members can load world and private-cache models; logout and expiry close access', async () => {
  const login = await (await call('/api/login', '', 'POST', { username: 'lzy', password: '123456' })).json();
  assert.equal((await call('/api/world', login.token)).status, 200);
  const bytes = await readFile(new URL('../public/examples/grid-pavilion.glb', import.meta.url));
  const upload = await fetch(base + '/api/admin/models?filename=gate.glb&name=Gate&scale=1', { method: 'POST', headers: { 'X-Session-Token': login.token }, body: bytes });
  assert.equal(upload.status, 201);
  const { asset } = await upload.json();
  assert.equal((await call(asset.url)).status, 401);
  const model = await call(asset.url, login.token);
  assert.equal(model.status, 200);
  assert.equal(model.headers.get('cache-control'), 'private, no-store');
  await call('/api/logout', login.token, 'POST');
  assert.equal((await call('/api/world', login.token)).status, 401);
  const renewed = await (await call('/api/login', '', 'POST', { username: 'lzy', password: '123456' })).json();
  sessions.get(renewed.token).createdAt = 1;
  assert.equal((await call('/api/world', renewed.token)).status, 401);
  const expired = await (await call('/api/session', renewed.token, 'POST', {})).json();
  assert.equal(expired.token, '');
  assert.equal(expired.user, null);
});

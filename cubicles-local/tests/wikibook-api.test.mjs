import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = await mkdtemp(path.join(tmpdir(), 'cubicles-wikibook-'));
Object.assign(process.env, { CUBICLES_DATA_DIR: directory, PGLITE_DIR: path.join(directory, 'pglite'), DATABASE_URL: '', AUTO_IMPORT: 'false', LOG_LEVEL: 'silent', NODE_ENV: 'test', CUBICLES_DB_RESET: '0' });
const { server } = await import('../server.mjs');
const { shutdownApp } = await import('../src/server/runtime.mjs');
const { getState, getRevision } = await import('../src/server/store.mjs');
const { databaseSnapshot } = await import('../src/server/backup.mjs');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(async () => { await new Promise(resolve => server.close(resolve)); await shutdownApp(); await rm(directory, { recursive: true, force: true }); });
async function post(url, data, token, headers = {}) {
  const response = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Session-Token': token } : {}), ...headers }, body: JSON.stringify(data) });
  return { status: response.status, data: await response.json() };
}
const payload = { format: 'wikibook-roster', version: 1, namespace: 'test-school', classes: [{ id: 90, name: '源班级' }], groups: [], students: [{ id: 1, username: 'preview_only', name: '脱敏学生', classId: 90, groupIds: [] }], classMappings: [{ sourceClassId: 90, targetZoneId: 1 }], bindings: [] };

test('preflight is admin-only, checks origin and changes neither database nor community revision', async () => {
  const admin = (await post('/api/login', { username: 'lzy', password: '123456' })).data;
  await post('/api/admin/import', { users: [{ username: 'student', password: '123456', name: '学生', classId: 1 }] }, admin.token);
  const student = (await post('/api/login', { username: 'student', password: '123456' })).data;
  const guest = (await post('/api/session', {})).data;
  const before = await databaseSnapshot();
  const revision = getRevision();
  const state = structuredClone(getState());
  assert.equal((await post('/api/admin/wikibook/preflight', payload)).status, 401);
  assert.equal((await post('/api/admin/wikibook/preflight', payload, guest.token)).status, 401);
  assert.equal((await post('/api/admin/wikibook/preflight', payload, student.token)).status, 403);
  assert.equal((await post('/api/admin/wikibook/preflight', payload, admin.token, { Origin: 'https://foreign.example' })).status, 403);
  const report = await post('/api/admin/wikibook/preflight', payload, admin.token);
  assert.equal(report.status, 200);
  assert.equal(report.data.canPlan, true);
  assert.equal(report.data.importImplemented, true);
  assert.equal(report.data.apiImportEnabled, false);
  assert.equal(report.data.targetRevision, revision);
  assert.deepEqual((await post('/api/admin/wikibook/preflight', payload, admin.token)).data, report.data);
  assert.equal((await post('/api/admin/wikibook/apply', payload, admin.token)).status, 404);
  assert.equal((await post('/api/admin/wikibook/preflight', { ...payload, password_hash: 'sensitive-placeholder' }, admin.token)).status, 400);
  assert.equal((await post('/api/admin/wikibook/preflight', { ...payload, padding: 'x'.repeat(510_000) }, admin.token)).status, 413);
  assert.deepEqual(getState(), state);
  assert.equal(getRevision(), revision);
  assert.deepEqual(await databaseSnapshot(), before);
});

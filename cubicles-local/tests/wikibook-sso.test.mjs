import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const secret = 'isolated-wikibook-sso-test-secret-32-characters';
let linked = false;
const calls = [];
const wiki = http.createServer(async (req, res) => {
  assert.equal(req.headers.authorization, `Bearer ${secret}`);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const data = JSON.parse(Buffer.concat(chunks));
  calls.push(data);
  res.setHeader('Content-Type', 'application/json');
  if (data.action === 'status') res.end(JSON.stringify({ ok: true, linked, username: linked ? 'wiki-student' : null }));
  else if (data.action === 'link_redeem') { linked = true; res.end('{"ok":true}'); }
  else if (data.action === 'unlink') { linked = false; res.end('{"ok":true}'); }
  else if (data.action === 'login_issue') res.end(JSON.stringify({ ok: true, code: 'x'.repeat(43) }));
  else { res.statusCode = 400; res.end('{"error":"unknown"}'); }
});
await new Promise(resolve => wiki.listen(0, '127.0.0.1', resolve));
const directory = await mkdtemp(path.join(tmpdir(), 'cubicles-wiki-sso-'));
Object.assign(process.env, { CUBICLES_DATA_DIR: directory, PGLITE_DIR: path.join(directory, 'pglite'), DATABASE_URL: '', AUTO_IMPORT: 'false', LOG_LEVEL: 'silent', NODE_ENV: 'test', CUBICLES_DB_RESET: '0', PUBLIC_ORIGIN: 'http://community.test', WIKIBOOK_OJ_URL: 'http://wiki.test/oj/problems', WIKIBOOK_SSO_SECRET: secret, WIKIBOOK_INTERNAL_URL: `http://127.0.0.1:${wiki.address().port}` });
const { server } = await import('../server.mjs');
const { shutdownApp } = await import('../src/server/runtime.mjs');
const { beginFlow, takeFlow } = await import('../src/server/wikibook-sso.mjs');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(async () => {
  await new Promise(resolve => server.close(resolve));
  await shutdownApp();
  await new Promise(resolve => wiki.close(resolve));
  await rm(directory, { recursive: true, force: true });
});

async function request(url, token, method = 'GET', data, extra = {}) {
  return fetch(base + url, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Session-Token': token } : {}), ...extra }, ...(data ? { body: JSON.stringify(data) } : {}) });
}

test('link, status, browser-bound launch, unlink and CSRF use only authenticated community identity', async () => {
  const admin = await (await request('/api/login', '', 'POST', { username: 'lzy', password: '123456' })).json();
  const guest = await (await request('/api/session', '', 'POST', {})).json();
  assert.equal((await request('/api/wikibook/account', guest.token)).status, 401);
  assert.equal((await request('/api/wikibook/link', admin.token, 'POST', {}, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await request('/api/wikibook/launch', admin.token, 'POST', { module: 'fishing', embedded: true })).status, 409);
  const initiation = await (await request('/api/wikibook/link', admin.token, 'POST', { communityId: 'forged-user' })).json();
  const target = new URL(initiation.url);
  assert.equal(target.origin, 'http://wiki.test');
  const [body, signature] = target.searchParams.get('request').split('.');
  assert.equal(signature, createHmac('sha256', secret).update(body).digest('base64url'));
  const payload = JSON.parse(Buffer.from(body, 'base64url'));
  assert.equal(payload.communityId, admin.user.id);
  assert.equal(payload.username, 'lzy');
  const callback = `/api/wikibook/link/callback?state=${payload.state}&code=${'c'.repeat(43)}`;
  assert.equal((await request(callback, guest.token)).status, 401);
  const response = await request(callback, admin.token);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'http://community.test/?wikibook=linked');
  assert.equal((await request(callback, admin.token)).status, 400);
  assert.equal((await (await request('/api/wikibook/account', admin.token)).json()).username, 'wiki-student');
  for (const module of ['oj', 'fishing']) {
    for (const embedded of [true, false]) {
      const result = await (await request('/api/wikibook/launch', admin.token, 'POST', { module, embedded, communityId: 'forged' })).json();
      const prepare = new URL(result.url);
      const state = 's'.repeat(43);
      const continuation = `/api/wikibook/continue?nonce=${prepare.searchParams.get('nonce')}&purpose=${prepare.searchParams.get('purpose')}&state=${state}`;
      const done = await request(continuation, admin.token);
      assert.equal(done.status, 303);
      assert.equal(new URL(done.headers.get('location')).pathname, '/community-sso/callback');
      const issue = calls.at(-1);
      assert.deepEqual(issue, { action: 'login_issue', communityId: admin.user.id, state, module, embedded });
      assert.equal((await request(continuation, admin.token)).status, 400);
    }
  }
  assert.equal((await request('/api/wikibook/launch', admin.token, 'POST', { module: 'https://evil.test', embedded: true })).status, 400);
  await request('/api/wikibook/account', admin.token, 'DELETE');
  assert.equal((await (await request('/api/wikibook/account', admin.token)).json()).linked, false);
});

test('pending requests reject other sessions, account switches, expiry and superseded requests', () => {
  const session = { id: 'session' }, user = { id: 'user' };
  const flow = beginFlow(session, user, 'link');
  assert.throws(() => takeFlow(flow.nonce, { id: 'other' }, user, 'link'));
  assert.throws(() => takeFlow(flow.nonce, session, { id: 'other' }, 'link'));
  beginFlow(session, user, 'link');
  assert.throws(() => takeFlow(flow.nonce, session, user, 'link'));
  const expired = beginFlow(session, user, 'link', { expires: 1 });
  assert.throws(() => takeFlow(expired.nonce, session, user, 'link'));
});

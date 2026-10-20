import { createHash, createHmac, randomBytes } from 'node:crypto';
import { config } from './config.mjs';
import { fail } from './http.mjs';

const pending = new Map();
const random = () => randomBytes(32).toString('base64url');
export const challengeFor = verifier => createHash('sha256').update(verifier).digest('hex');

export function ssoEnabled() {
  return config.wikibookSsoSecret.length >= 32 && Boolean(config.publicOrigin && config.wikibookInternalUrl && config.wikibookOjUrl);
}

export function wikiOrigin() {
  if (!ssoEnabled()) fail(503, 'WikiBook 账号关联尚未配置，请联系管理员。');
  return new URL(config.wikibookOjUrl).origin;
}

export function wikiRedirect(path, params = {}) {
  const url = new URL(path, wikiOrigin());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}

export function signLinkRequest(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', config.wikibookSsoSecret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function beginFlow(session, user, purpose, extra = {}) {
  for (const [key, value] of pending) if (value.expires < Date.now() || (value.sessionId === session.id && value.purpose === purpose)) pending.delete(key);
  if (pending.size >= 5000) fail(429, '账号服务繁忙，请稍后重试。');
  const nonce = random();
  const flow = { sessionId: session.id, userId: user.id, purpose, verifier: random(), expires: Date.now() + 300000, ...extra };
  pending.set(nonce, flow);
  return { nonce, ...flow };
}

export function takeFlow(nonce, session, user, purpose) {
  const flow = pending.get(nonce);
  if (!flow || flow.expires < Date.now() || flow.sessionId !== session.id || flow.userId !== user.id || flow.purpose !== purpose) fail(400, '请求已过期或账号已切换，请重新发起。');
  pending.delete(nonce);
  return flow;
}

export async function wikiCall(action, payload) {
  wikiOrigin();
  const internal = new URL(config.wikibookInternalUrl);
  if (internal.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(internal.hostname)) fail(503, 'WikiBook 服务端通道必须使用回环地址或 HTTPS。');
  let response, data;
  try {
    response = await fetch(new URL('/internal/community-sso', config.wikibookInternalUrl), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.wikibookSsoSecret}` },
      body: JSON.stringify({ action, ...payload }),
    });
    data = await response.json();
  } catch {
    fail(503, 'WikiBook 暂时无法连接，请稍后重试。');
  }
  if (!response.ok) fail([400, 403, 409].includes(response.status) ? response.status : 503, data.error || 'WikiBook 账号服务暂时不可用。');
  if (!data || typeof data !== 'object' || data.ok !== true) fail(503, 'WikiBook 账号服务返回无效响应。');
  return data;
}

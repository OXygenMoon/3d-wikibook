import { requireAdmin, requireUser } from '../auth.mjs';
import { getState, getRevision } from '../store.mjs';
import { readJson, sendJson, fail } from '../http.mjs';
import { planWikibookRoster } from '../wikibook-preflight.mjs';
import { config } from '../config.mjs';
import { beginFlow, takeFlow, signLinkRequest, challengeFor, ssoEnabled, wikiCall, wikiRedirect } from '../wikibook-sso.mjs';
import { writeAudit } from '../audit.mjs';

function redirect(res, url) {
  res.writeHead(303, { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  res.end();
}

export async function handleWikibookRoutes(req, res, url, session) {
  if (url.pathname.startsWith('/api/wikibook/')) {
    const user = requireUser(session);
    const path = url.pathname;
    if (path === '/api/wikibook/account' && req.method === 'GET') {
      sendJson(res, 200, ssoEnabled() ? { enabled: true, ...await wikiCall('status', { communityId: user.id }) } : { enabled: false, linked: false });
      return true;
    }
    if (path === '/api/wikibook/link' && req.method === 'POST') {
      if (!ssoEnabled()) fail(503, 'WikiBook 账号关联尚未配置，请联系管理员。');
      const flow = beginFlow(session, user, 'link');
      const request = signLinkRequest({ communityId: user.id, username: user.username, state: flow.nonce, challenge: challengeFor(flow.verifier), expires: Math.floor(flow.expires / 1000) });
      sendJson(res, 200, { url: wikiRedirect('/community-sso/authorize', { request }) });
      return true;
    }
    if (path === '/api/wikibook/link/callback' && req.method === 'GET') {
      const flow = takeFlow(url.searchParams.get('state'), session, user, 'link');
      await wikiCall('link_redeem', { communityId: user.id, code: url.searchParams.get('code'), verifier: flow.verifier });
      await writeAudit({ actorId: user.id, action: 'wikibook.linked' });
      redirect(res, new URL('/?wikibook=linked', config.publicOrigin).href);
      return true;
    }
    if (path === '/api/wikibook/account' && req.method === 'DELETE') {
      await wikiCall('unlink', { communityId: user.id });
      await writeAudit({ actorId: user.id, action: 'wikibook.unlinked' });
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (path === '/api/wikibook/launch' && req.method === 'POST') {
      const data = await readJson(req);
      if (!['oj', 'fishing'].includes(data.module) || typeof data.embedded !== 'boolean') fail(400, 'WikiBook 页面类型无效。');
      const status = await wikiCall('status', { communityId: user.id });
      if (!status.linked) fail(409, '请先在“我的账号”中关联 WikiBook。');
      const flow = beginFlow(session, user, `launch-${data.module}-${data.embedded}`, { module: data.module, embedded: data.embedded });
      sendJson(res, 200, { url: wikiRedirect('/community-sso/prepare', { nonce: flow.nonce, purpose: flow.purpose }) });
      return true;
    }
    if (path === '/api/wikibook/continue' && req.method === 'GET') {
      const state = url.searchParams.get('state') || '';
      const purpose = url.searchParams.get('purpose');
      if (!/^[-\w]{43}$/.test(state) || !['launch-oj-true', 'launch-oj-false', 'launch-fishing-true', 'launch-fishing-false'].includes(purpose)) fail(400, '跳转请求无效。');
      const flow = takeFlow(url.searchParams.get('nonce'), session, user, purpose);
      const ticket = await wikiCall('login_issue', { communityId: user.id, state, module: flow.module, embedded: flow.embedded });
      redirect(res, wikiRedirect('/community-sso/callback', { code: ticket.code, state }));
      return true;
    }
    return false;
  }
  if (url.pathname !== '/api/admin/wikibook/preflight' || req.method !== 'POST') return false;
  requireAdmin(session);
  const payload = await readJson(req);
  const result = planWikibookRoster(payload, getState());
  sendJson(res, 200, { ...result, targetRevision: getRevision() });
  return true;
}

import { clean, fail, readJson, sendJson, setSessionCookie, clearSessionCookie } from '../http.mjs';
import { getState, saveState, bumpRevision } from '../store.mjs';
import { sessions, persistSession, deleteSession } from '../session-store.mjs';
import { freshSession, loginByPassword, publicUser, requireUser } from '../auth.mjs';
import { userOf } from '../domain.mjs';
import { config } from '../config.mjs';

export async function handleAuthRoutes(req, res, url, session) {
  const path = url.pathname;

  if (path === '/api/session' && req.method === 'POST') {
    const data = await readJson(req);
    const candidate = sessions.get(clean(data.token, 100));
    const old = session || (candidate && Date.now() - candidate.createdAt <= config.sessionTtlMs ? candidate : null);
    const current = old || (await freshSession(null));
    if (!old) {
      getState().visitors += 1;
      await saveState();
    }
    current.seen = Date.now();
    await persistSession(current);
    setSessionCookie(res, current.id);
    sendJson(res, old ? 200 : 201, {
      token: current.id,
      user: publicUser(userOf(current)),
      visitors: getState().visitors,
      position: { x: current.x, z: current.z },
    });
    return true;
  }

  if (path === '/api/login' && req.method === 'POST') {
    const data = await readJson(req);
    const username = clean(data.username, 80);
    const user = await loginByPassword(username, data.password, session, req.socket.remoteAddress);
    if (session) await deleteSession(session.id);
    const next = await freshSession(user);
    setSessionCookie(res, next.id);
    sendJson(res, 200, {
      token: next.id,
      user: publicUser(user),
      position: { x: next.x, z: next.z },
    });
    return true;
  }

  if (path === '/api/logout' && req.method === 'POST') {
    if (!session) fail(401, '会话已过期，请重新进入社区。');
    await deleteSession(session.id);
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (path === '/api/me' && req.method === 'GET') {
    if (!session) fail(401, '会话已过期，请重新进入社区。');
    sendJson(res, 200, { user: publicUser(userOf(session)) });
    return true;
  }

  if (path === '/api/me' && req.method === 'PATCH') {
    if (!session) fail(401, '会话已过期，请重新进入社区。');
    const user = requireUser(session);
    const data = await readJson(req);
    if (data.name) user.name = clean(data.name, 24);
    if (['classic', 'smooth'].includes(data.avatar)) user.avatar = data.avatar;
    if (/^#[\da-f]{6}$/i.test(data.color || '')) user.color = data.color;
    bumpRevision();
    await saveState();
    sendJson(res, 200, { user: publicUser(user) });
    return true;
  }

  return false;
}

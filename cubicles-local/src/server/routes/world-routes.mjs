import { clean, fail, readJson, sendJson } from '../http.mjs';
import { getState, getRevision, saveState, bumpRevision } from '../store.mjs';
import { persistHeartbeat } from '../session-store.mjs';
import { validateFurniture } from '../../layout-validation.js';
import { GRID } from '../../grid.js';
import { requireUser, onlineUsers } from '../auth.mjs';
import { editPermission, offices, players, worldData } from '../domain.mjs';
import { recentMessages } from '../message-store.mjs';
import { writeAudit } from '../audit.mjs';

const REACTIONS = ['👋', '❤️', '✨', '☕', '🎉', '🌿'];

export async function handleWorldRoutes(req, res, url, session) {
  const path = url.pathname;

  if (path === '/api/world' && req.method === 'GET') {
    sendJson(res, 200, worldData());
    return true;
  }

  if (path === '/api/tick' && req.method === 'POST') {
    if (!session) fail(401, '会话已过期，请重新进入社区。');
    const data = await readJson(req);
    session.seen = Date.now();
    for (const key of ['x', 'z']) {
      if (Number.isFinite(Number(data[key]))) session[key] = Math.min(GRID.max-1, Math.max(GRID.min+1, Number(data[key])));
    }
    if(Number.isFinite(Number(data.y)))session.y=Math.min(64,Math.max(0,Number(data.y)));
    session.rotation = Number(data.rotation) || 0;
    session.dancing = Boolean(data.dancing);
    if (!session.userId) {
      if (data.name) session.name = clean(data.name, 24);
      if (['classic', 'smooth'].includes(data.avatar)) session.avatar = data.avatar;
      if (/^#[\da-f]{6}$/i.test(data.color || '')) session.color = data.color;
    }
    if (REACTIONS.includes(data.reaction)) {
      session.reaction = data.reaction;
      session.reactionAt = Date.now();
    }
    await persistHeartbeat(session);
    const state = getState();
    sendJson(res, 200, {
      players: players(session.id),
      online: players().length,
      onlineUserIds: [...onlineUsers()],
      messages: recentMessages(50),
      visitors: state.visitors,
      revision: getRevision(),
      settings: state.settings,
      layoutRevision: state.layoutRevision,
    });
    return true;
  }

  if (/^\/api\/offices\/\d+$/.test(path) && req.method === 'PATCH') {
    if (!session) fail(401, '会话已过期，请重新进入社区。');
    const id = Number(path.split('/').pop());
    const user = requireUser(session);
    editPermission(session, id, user);
    const data = await readJson(req);
    const state = getState();
    const change = {};
    if (data.name) {
      change.name = clean(data.name, 32);
      change.monogram = change.name[0];
    }
    if (data.tagline) change.tagline = clean(data.tagline, 100);
    if (/^#[\da-f]{6}$/i.test(data.color || '')) change.color = data.color;

    if (data.furniture) {
      change.furniture = validateFurniture(data.furniture, { assets: state.modelAssets, inventory: user.inventory, userId: user.id, unlockedModelIds: user.unlockedModelIds, admin: user.role === 'admin' });
    }
    state.officeStyles[id] = { ...state.officeStyles[id], ...change };
    bumpRevision();
    await saveState();
    await writeAudit({ actorId: user.id, action: 'office.update', target: String(id), detail: { name: change.name } });
    sendJson(res, 200, offices().find(office => office.id === id));
    return true;
  }

  return false;
}

import { clean, fail, readJson, sendJson } from '../http.mjs';
import { getState, getRevision, saveState, bumpRevision } from '../store.mjs';
import { persistSession } from '../session-store.mjs';
import { ITEMS } from '../../community.js';
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
      if (Number.isFinite(Number(data[key]))) session[key] = Math.min(69, Math.max(-69, Number(data[key])));
    }
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
    await persistSession(session);
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
    const change = {};
    if (data.name) {
      change.name = clean(data.name, 32);
      change.monogram = change.name[0];
    }
    if (data.tagline) change.tagline = clean(data.tagline, 100);
    if (/^#[\da-f]{6}$/i.test(data.color || '')) change.color = data.color;

    if (data.furniture) {
      if (!Array.isArray(data.furniture) || data.furniture.length > 16) fail(400, '家具最多放置 16 件。');
      const counts = {};
      const ids = new Set();
      change.furniture = data.furniture.map(item => {
        const definition = ITEMS.find(candidate => candidate.id === item.itemId);
        if (!definition || typeof item.id !== 'string' || ids.has(item.id)) fail(400, '家具记录无效。');
        ids.add(item.id);
        counts[definition.id] = (counts[definition.id] || 0) + 1;
        if (counts[definition.id] > (user.inventory[definition.id] || 0)) {
          fail(400, '摆放的家具数量超过背包持有数量。');
        }
        if (
          !Number.isFinite(item.x) ||
          !Number.isFinite(item.z) ||
          Math.abs(item.x) > 1.55 ||
          Math.abs(item.z) > 1.5 ||
          !Number.isFinite(item.rotation)
        ) {
          fail(400, '家具必须摆在工位范围内。');
        }
        if (definition.surface === 'floor') {
          const angle = (item.rotation * Math.PI) / 180;
          const hx =
            definition.id === 'desk'
              ? Math.abs(Math.cos(angle)) * 0.82 + Math.abs(Math.sin(angle)) * 0.4
              : definition.radius;
          const hz =
            definition.id === 'desk'
              ? Math.abs(Math.sin(angle)) * 0.82 + Math.abs(Math.cos(angle)) * 0.4
              : definition.radius;
          if (Math.abs(item.x) + hx > 1.7 || Math.abs(item.z) + hz > 1.65) {
            fail(400, '家具超出工位边界，请向内移动一点。');
          }
        }
        return {
          id: item.id.slice(0, 64),
          itemId: definition.id,
          x: item.x,
          z: item.z,
          rotation: ((item.rotation % 360) + 360) % 360,
        };
      });
      const desk = change.furniture.find(item => item.itemId === 'desk');
      for (const item of change.furniture) {
        if (ITEMS.find(candidate => candidate.id === item.itemId).surface !== 'desk') continue;
        if (!desk) fail(400, '桌面物品需要先放置书桌。');
        const radians = (-desk.rotation * Math.PI) / 180;
        const dx = item.x - desk.x;
        const dz = item.z - desk.z;
        if (
          Math.abs(dx * Math.cos(radians) + dz * Math.sin(radians)) > 0.78 ||
          Math.abs(-dx * Math.sin(radians) + dz * Math.cos(radians)) > 0.48
        ) {
          fail(400, '请把桌面物品摆到书桌上。');
        }
      }
    }

    const state = getState();
    state.officeStyles[id] = { ...state.officeStyles[id], ...change };
    bumpRevision();
    await saveState();
    await writeAudit({ actorId: user.id, action: 'office.update', target: String(id), detail: { name: change.name } });
    sendJson(res, 200, offices().find(office => office.id === id));
    return true;
  }

  return false;
}

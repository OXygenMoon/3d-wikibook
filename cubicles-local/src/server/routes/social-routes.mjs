import { randomUUID } from 'node:crypto';
import { clean, fail, readJson, sendJson } from '../http.mjs';
import { getState, saveState, bumpRevision } from '../store.mjs';
import { persistSession } from '../session-store.mjs';
import { requireUser } from '../auth.mjs';
import { nearbyArea, userOf } from '../domain.mjs';
import { addMessage } from '../message-store.mjs';

export async function handleSocialRoutes(req, res, url, session) {
  const path = url.pathname;

  if (path === '/api/messages' && req.method === 'POST') {
    if (!session) fail(401, '会话已过期，请重新进入社区。');
    const data = await readJson(req);
    const text = clean(data.text);
    if (!text) fail(400, '请先输入消息。');
    if (Date.now() - (session.lastMessage || 0) < 400) fail(429, '发送太快了，请稍等片刻。');
    const message = {
      id: randomUUID(),
      name: userOf(session)?.name || session.name,
      text,
      time: Date.now(),
      playerId: session.id,
    };
    await addMessage(message);
    session.lastMessage = Date.now();
    await persistSession(session);
    sendJson(res, 201, message);
    return true;
  }

  if (path === '/api/stickers' && req.method === 'GET') {
    if (!session) fail(401, '会话已过期，请重新进入社区。');
    nearbyArea(session, 'wall');
    sendJson(res, 200, { stickers: getState().stickers });
    return true;
  }

  if (path === '/api/stickers' && req.method === 'POST') {
    if (!session) fail(401, '会话已过期，请重新进入社区。');
    nearbyArea(session, 'wall');
    const user = requireUser(session);
    const data = await readJson(req);
    const text = clean(data.text, 80);
    if (!text) fail(400, '请写一点内容。');
    if (Date.now() - (session.lastSticker || 0) < 3000) fail(429, '请稍等片刻再贴。');
    const sticker = {
      id: randomUUID(),
      userId: user.id,
      name: user.name,
      text,
      color: ['#e7cf7a', '#b7cfaa', '#d7bfd8', '#b4d4da'].includes(data.color) ? data.color : '#e7cf7a',
      time: Date.now(),
    };
    const state = getState();
    state.stickers.push(sticker);
    state.stickers = state.stickers.slice(-60);
    session.lastSticker = Date.now();
    bumpRevision();
    await saveState();
    await persistSession(session);
    sendJson(res, 201, { stickers: state.stickers });
    return true;
  }

  return false;
}

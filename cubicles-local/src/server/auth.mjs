import { randomUUID } from 'node:crypto';
import { config } from './config.mjs';
import { fail } from './http.mjs';
import { getState } from './store.mjs';
import { offices, userOf } from './domain.mjs';
import { verifyPassword } from './password.mjs';
import { sessions, createSession, onlineUserIds } from './session-store.mjs';

export const attempts = new Map();

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, credentialFormat, ...safe } = user;
  return safe;
}

export function tokenOf(req) {
  return (
    req.headers['x-session-token'] ||
    req.headers.cookie
      ?.split(';')
      .map(part => part.trim())
      .find(part => part.startsWith('community_session='))
      ?.slice('community_session='.length)
  );
}

export function getSession(req) {
  const session = sessions.get(tokenOf(req));
  if (!session || Date.now() - session.createdAt > config.sessionTtlMs) return null;
  return session;
}

export function onlineUsers() {
  return onlineUserIds();
}

export function requireUser(session) {
  const user = userOf(session);
  if (!user) fail(401, '请先登录账号。');
  return user;
}

export function requireAdmin(session) {
  const user = requireUser(session);
  if (user.role !== 'admin') fail(403, '只有管理员可以操作。');
  return user;
}

export async function freshSession(user, name = '访客') {
  const list = offices();
  const office = list.find(item => item.id === user?.officeId) || list[0];
  const session = {
    id: randomUUID(),
    userId: user?.id,
    name,
    createdAt: Date.now(),
    seen: Date.now(),
    x: office?.x || 0,
    z: (office?.z || 0) + 2.5,
    rotation: 0,
    avatar: 'classic',
    color: '#a6b79a',
  };
  await createSession(session);
  return session;
}

export async function loginByPassword(username, password, session, remoteAddress = '') {
  const key = `${remoteAddress}:${username}`;
  const attempt = attempts.get(key);
  if (attempt && attempt.count >= 10 && Date.now() - attempt.at < 60000) {
    fail(429, '尝试次数过多，请一分钟后再试。');
  }
  const user = getState().users.find(item => item.username === username) || getState().users.find(item => item.credentialFormat !== 'werkzeug' && item.username === username.toLowerCase());
  if (!user || typeof password !== 'string' || !(await verifyPassword(password, user.passwordHash))) {
    attempts.set(key, { count: (attempt?.count || 0) + 1, at: Date.now() });
    fail(401, '账号或密码不正确。');
  }
  attempts.delete(key);
  if (!getState().users.some(item => item.id === user.id && item.passwordHash === user.passwordHash)) fail(401, '账号状态已更新，请重新登录。');
  if (session) sessions.delete(session.id);
  return user;
}

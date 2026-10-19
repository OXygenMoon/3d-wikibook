import { eq, gt, lt } from 'drizzle-orm';
import { sessions as sessionsTable } from './db/schema.mjs';
import { getDb } from './db.mjs';
import { config } from './config.mjs';
import { logger } from './logger.mjs';

export const sessions = new Map();

function toRow(session) {
  return {
    id: session.id,
    userId: session.userId || null,
    name: session.name || '访客',
    createdAt: session.createdAt,
    seen: session.seen,
    x: session.x,
    z: session.z,
    rotation: session.rotation || 0,
    avatar: session.avatar || 'classic',
    color: session.color || '#a6b79a',
    dancing: Boolean(session.dancing),
    lastMessage: session.lastMessage || null,
    lastSticker: session.lastSticker || null,
    fishingAt: session.fishingAt || null,
  };
}

function toSession(row) {
  return {
    id: row.id,
    userId: row.userId || undefined,
    name: row.name,
    createdAt: Number(row.createdAt),
    seen: Number(row.seen),
    x: Number(row.x),
    z: Number(row.z),
    rotation: Number(row.rotation) || 0,
    avatar: row.avatar,
    color: row.color,
    dancing: Boolean(row.dancing),
    lastMessage: row.lastMessage ? Number(row.lastMessage) : undefined,
    lastSticker: row.lastSticker ? Number(row.lastSticker) : undefined,
    fishingAt: row.fishingAt ? Number(row.fishingAt) : undefined,
  };
}

export async function loadSessions() {
  const cutoff = Date.now() - config.sessionTtlMs;
  const rows = await getDb()
    .select()
    .from(sessionsTable)
    .where(gt(sessionsTable.createdAt, cutoff));
  sessions.clear();
  for (const row of rows) sessions.set(row.id, toSession(row));
  logger.info({ count: sessions.size }, 'sessions loaded');
}

export async function createSession(session) {
  sessions.set(session.id, session);
  await getDb().insert(sessionsTable).values(toRow(session));
}

export async function persistSession(session) {
  sessions.set(session.id, session);
  await getDb()
    .insert(sessionsTable)
    .values(toRow(session))
    .onConflictDoUpdate({ target: sessionsTable.id, set: toRow(session) });
}

export async function deleteSession(id) {
  sessions.delete(id);
  await getDb().delete(sessionsTable).where(eq(sessionsTable.id, id));
}

export async function cleanupSessions() {
  const cutoff = Date.now() - config.sessionTtlMs;
  await getDb().delete(sessionsTable).where(lt(sessionsTable.createdAt, cutoff));
  for (const [id, session] of sessions) {
    if (session.createdAt < cutoff) sessions.delete(id);
  }
}

export function onlineUserIds() {
  const now = Date.now();
  return new Set(
    [...sessions.values()]
      .filter(session => now - session.seen < 12000 && session.userId)
      .map(session => session.userId),
  );
}

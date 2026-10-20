import { eq, gt, lt, getTableColumns, sql } from 'drizzle-orm';
import { sessions as sessionsTable } from './db/schema.mjs';
import { getDb } from './db.mjs';
import { config } from './config.mjs';
import { logger } from './logger.mjs';

export const sessions = new Map();
const dirty = new Set();
let writes = Promise.resolve();
let timer = null;
const metrics = { heartbeats: 0, batches: 0, rows: 0 };

function enqueue(operation) {
  writes = writes.catch(() => {}).then(operation);
  return writes;
}

async function upsertRows(rows) {
  const update = Object.fromEntries(Object.entries(getTableColumns(sessionsTable)).filter(([key]) => key !== 'id').map(([key,column]) => [key,sql.raw(`excluded."${column.name}"`)]));
  for (let offset = 0; offset < rows.length; offset += 250) await getDb().insert(sessionsTable).values(rows.slice(offset,offset+250)).onConflictDoUpdate({target:sessionsTable.id,set:update});
}

export function sessionPersistenceStats() {
  return { ...metrics, buffered: dirty.size, intervalMs: config.sessionPersistIntervalMs };
}

export async function flushSessions() {
  const rows = [...dirty].filter(id=>sessions.has(id)).map(id=>toRow(sessions.get(id)));
  dirty.clear();
  if (!rows.length) return writes;
  try {
    await enqueue(() => upsertRows(rows));
    metrics.batches += 1;
    metrics.rows += rows.length;
  } catch (error) {
    for (const row of rows) if (sessions.has(row.id)) dirty.add(row.id);
    throw error;
  }
}

export function startSessionPersistence() {
  if (timer || !config.sessionPersistIntervalMs) return;
  timer = setInterval(() => { flushSessions().catch(error => logger.error({err:error},'session flush failed')); }, Math.max(100,config.sessionPersistIntervalMs));
  timer.unref();
}

export async function stopSessionPersistence() {
  if (timer) clearInterval(timer);
  timer = null;
  await flushSessions();
  await writes;
}

export async function persistHeartbeat(session) {
  if (!sessions.has(session.id)) return;
  metrics.heartbeats += 1;
  if (!config.sessionPersistIntervalMs) return persistSession(session);
  sessions.set(session.id,session);
  dirty.add(session.id);
}

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
  const row = toRow(session);
  try { await enqueue(() => getDb().insert(sessionsTable).values(row)); }
  catch (error) { sessions.delete(session.id); throw error; }
}

export async function persistSession(session) {
  if (!sessions.has(session.id)) {
    const error = new Error('会话已退出，请重新进入社区。');
    error.status = 401;
    throw error;
  }
  sessions.set(session.id, session);
  dirty.delete(session.id);
  const row = toRow(session);
  await enqueue(() => upsertRows([row]));
}

export async function deleteSession(id) {
  sessions.delete(id);
  dirty.delete(id);
  await enqueue(() => getDb().delete(sessionsTable).where(eq(sessionsTable.id, id)));
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

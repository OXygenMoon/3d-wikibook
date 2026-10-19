import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { communityState } from './db/schema.mjs';
import { getDb } from './db.mjs';
import { config } from './config.mjs';
import { logger } from './logger.mjs';
import { hashPassword } from './password.mjs';
import { DEFAULT_ZONES, DEFAULT_SETTINGS, PUBLIC_AREAS, ITEMS } from '../community.js';
import { defaultBuildings } from '../grid.js';

let state = null;
let revision = 1;
let writeQueue = Promise.resolve();

const PUBLIC_TEMPLATES = structuredClone(PUBLIC_AREAS);

export function getState() {
  if (!state) throw new Error('community state has not been initialized');
  return state;
}

export function getRevision() {
  return revision;
}

export function bumpRevision() {
  revision += 1;
  return revision;
}

export function validateState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('社区数据必须是一个对象。');
  if (Number(value.version) !== 2) throw new Error('只支持版本 2 的社区数据。');
  for (const key of ['users', 'zones', 'stickers']) {
    if (!Array.isArray(value[key])) throw new Error(`社区数据缺少 ${key} 数组。`);
  }
  if (value.settings && typeof value.settings !== 'object') throw new Error('社区 settings 格式不正确。');
  return value;
}

function defaultUser() {
  return {
    id: randomUUID(),
    username: config.adminUsername,
    name: '社区管理员',
    passwordHash: null,
    role: 'admin',
    classId: 1,
    officeId: 1001,
    avatar: 'classic',
    color: '#a6b79a',
    inventory: Object.fromEntries(ITEMS.map(item => [item.id, item.limit])),
    score: 0,
    createdAt: Date.now(),
  };
}

export async function createDefaultState() {
  const admin = defaultUser();
  admin.passwordHash = await hashPassword(config.adminPassword);
  return {
    version: 2,
    visitors: 0,
    users: [admin],
    zones: structuredClone(DEFAULT_ZONES),
    settings: { ...DEFAULT_SETTINGS },
    officeStyles: {},
    stickers: [],
    buildings: defaultBuildings(PUBLIC_TEMPLATES),
    officePositions: {},
    modelAssets: [],
    layoutRevision: 1,
  };
}

async function backupBeforeGridMigration(raw) {
  try {
    await writeFile(path.join(config.dataDir, 'before-grid-migration.json'), JSON.stringify(raw, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
    logger.info({ file: 'before-grid-migration.json' }, 'saved pre-grid-migration backup');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

export async function normalizeState(value) {
  const next = value;
  next.version = 2;
  next.visitors ||= 0;
  next.users ||= [];
  next.zones ||= structuredClone(DEFAULT_ZONES);
  next.settings ||= { ...DEFAULT_SETTINGS };
  next.officeStyles ||= {};
  next.stickers ||= [];
  next.officePositions ||= {};
  next.modelAssets ||= [];
  next.layoutRevision ||= 1;

  if (!next.buildings) {
    await backupBeforeGridMigration(structuredClone(next));
    next.buildings = defaultBuildings(PUBLIC_TEMPLATES);
  }

  for (const zone of next.zones) {
    const spacing = Math.round(Number(zone.spacing) || 7);
    zone.spacing = spacing;
    const width = Math.ceil((zone.columns - 1) * spacing + 5);
    const depth = Math.ceil((zone.rows - 1) * spacing + 5);
    zone.x = Math.round(Number(zone.x) || 0);
    zone.z = Math.round(Number(zone.z) || 0);
    const gridX = Math.round(zone.x - width / 2);
    const gridZ = Math.round(zone.z - depth / 2);
    zone.x = gridX + width / 2;
    zone.z = gridZ + depth / 2;
  }

  for (const user of next.users) {
    user.inventory ||= Object.fromEntries(ITEMS.map(item => [item.id, item.limit]));
    user.score ||= 0;
    user.catches ||= [];
    user.completedTasks ||= [];
  }

  if (!next.users.length) {
    const admin = defaultUser();
    admin.passwordHash = await hashPassword(config.adminPassword);
    next.users.push(admin);
  }
  return next;
}

async function upsertState(nextState, nextRevision = revision) {
  const db = getDb();
  await db
    .insert(communityState)
    .values({
      id: 1,
      version: Number(nextState.version) || 2,
      revision: nextRevision,
      data: nextState,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: communityState.id,
      set: {
        version: Number(nextState.version) || 2,
        revision: nextRevision,
        data: nextState,
        updatedAt: new Date(),
      },
    });
}

export async function saveState() {
  const snapshot = state;
  const nextRevision = revision;
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      await upsertState(snapshot, nextRevision);
    });
  await writeQueue;
}

export async function dumpState() {
  if (state) return { version: Number(state.version) || 2, revision, data: structuredClone(state), exportedAt: new Date().toISOString() };
  const row = (await getDb().select().from(communityState).where(eq(communityState.id, 1)).limit(1))[0];
  if (!row) return null;
  return { version: Number(row.version) || 2, revision: Number(row.revision) || 1, data: structuredClone(row.data), exportedAt: new Date().toISOString() };
}

export async function writeBackup(reason = 'manual') {
  const dump = await dumpState();
  if (!dump) return null;
  await mkdir(config.backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(config.backupDir, `community-${stamp}-${reason}.json`);
  await writeFile(file, JSON.stringify(dump, null, 2), { mode: 0o600 });
  await pruneBackups();
  return file;
}

async function pruneBackups(keep = 30) {
  try {
    const files = (await readdir(config.backupDir))
      .filter(name => name.startsWith('community-') && name.endsWith('.json'))
      .sort();
    for (const name of files.slice(0, Math.max(0, files.length - keep))) {
      await unlink(path.join(config.backupDir, name));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') logger.warn({ err: error }, 'failed to prune old backups');
  }
}

export async function importStateFile(file, { force = false } = {}) {
  const text = await readFile(file, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`无法解析 ${file}: ${error.message}`);
  }
  const imported = parsed.data && parsed.version && parsed.revision ? parsed.data : parsed;
  validateState(imported);
  const existing = await getDb().select().from(communityState).where(eq(communityState.id, 1)).limit(1);
  if (existing.length && !force) {
    throw new Error('数据库中已有社区数据，请使用 --force 覆盖。');
  }
  let backup = null;
  if (existing.length) backup = await writeBackup('pre-import');
  await mkdir(config.backupDir, { recursive: true });
  const sourceBackup = path.join(
    config.backupDir,
    `source-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  await writeFile(sourceBackup, text, { mode: 0o600 });
  state = await normalizeState(structuredClone(imported));
  revision = Number(parsed.revision) || 1;
  await upsertState(state, revision);
  logger.info({ file, backup, sourceBackup, users: state.users.length }, 'community state imported');
  return { backup, sourceBackup, users: state.users.length, zones: state.zones.length };
}

export async function restoreStateFile(file) {
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  const restored = parsed.data && parsed.version && parsed.revision ? parsed.data : parsed;
  validateState(restored);
  const backup = await writeBackup('pre-restore');
  state = await normalizeState(structuredClone(restored));
  revision = Number(parsed.revision) || 1;
  await upsertState(state, revision);
  logger.warn({ file, backup }, 'community state restored');
  return { backup, users: state.users.length, zones: state.zones.length };
}

export async function initStore({ autoImport = config.autoImport, createIfMissing = true } = {}) {
  const db = getDb();
  let row = (await db.select().from(communityState).where(eq(communityState.id, 1)).limit(1))[0];

  if (!row) {
    if (autoImport) {
      try {
        const result = await importStateFile(config.importFile, { force: true });
        logger.info(result, 'auto-imported community.json on first boot');
        return;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (!createIfMissing) {
      state = null;
      revision = 1;
      return;
    }
    state = await createDefaultState();
    revision = 1;
    await upsertState(state, revision);
    logger.info({ users: state.users.length }, 'created a new community state');
    return;
  }

  revision = Number(row.revision) || 1;
  state = await normalizeState(structuredClone(row.data));
  await saveState();
  logger.info({ users: state.users.length, zones: state.zones.length, revision }, 'community state loaded');
}

export async function resetStoreForTests() {
  state = null;
  revision = 1;
  writeQueue = Promise.resolve();
}

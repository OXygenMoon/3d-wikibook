import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rename, rm, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { asc, sql, getTableName } from 'drizzle-orm';
import { getDb } from './db.mjs';
import { communityState, sessions, messages, auditLog } from './db/schema.mjs';
import { config } from './config.mjs';
import { validateState } from './store.mjs';
import { domains, inflateState, identityDomainNames } from './db/domains.mjs';

const tables = { communityState, sessions, messages, auditLog, ...Object.fromEntries(domains.map(domain=>[domain.name,domain.table])) };
const keys = { communityState: communityState.id, sessions: sessions.id, messages: messages.seq, auditLog: auditLog.id, ...Object.fromEntries(domains.map(domain=>[domain.name,domain.table.id])) };
const modelId = /^[a-f0-9-]{36}$/;
const digest = buffer => createHash('sha256').update(buffer).digest('hex');

export async function databaseSnapshot() {
  return getDb().transaction(async transaction => {
    const result = {};
    const existing = await transaction.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const names = new Set(existing.rows.map(row=>row.table_name));
    for (const [name, table] of Object.entries(tables)) {
      const sqlName = getTableName(table);
      if (!names.has(sqlName) && domains.some(domain=>domain.name===name)) { result[name]=[]; continue; }
      result[name] = await transaction.select().from(table).orderBy(asc(keys[name]));
    }
    return JSON.parse(JSON.stringify(result));
  }, { isolationLevel: 'repeatable read', readOnly: true });
}

function modelFiles(snapshot) {
  if (!Array.isArray(snapshot.communityState) || snapshot.communityState.length !== 1 || snapshot.communityState[0].id !== 1) {
    throw new Error('备份必须包含唯一的社区状态。');
  }
  const state = validateState(inflateState(snapshot.communityState[0].data, snapshot));
  const files = [];
  for (const asset of state.modelAssets || []) {
    if (!modelId.test(asset.id)) throw new Error('模型编号无效，无法安全备份。');
    files.push(`models/${asset.id}.glb`);
  }
  if (new Set(files).size !== files.length) throw new Error('模型编号重复。');
  return files.sort();
}

async function checkedRead(file) {
  const info = await lstat(file);
  if (!info.isFile()) throw new Error(`备份资源必须是普通文件：${file}`);
  return readFile(file);
}

export async function writeFullBackup(reason = 'manual') {
  if (!/^[a-z0-9-]{1,48}$/i.test(reason)) throw new Error('备份名称只能使用字母、数字与短横线。');
  const snapshot = await databaseSnapshot();
  const models = modelFiles(snapshot);
  await mkdir(config.backupDir, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(path.join(config.backupDir, '.pending-'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = path.join(config.backupDir, `community-${stamp}-${reason}-${randomUUID().slice(0, 8)}`);
  try {
    await mkdir(path.join(staging, 'models'), { mode: 0o700 });
    const snapshotBytes = Buffer.from(JSON.stringify({ format: 'cubicles-full-backup', version: 1, tables: snapshot }, null, 2));
    await writeFile(path.join(staging, 'snapshot.json'), snapshotBytes, { mode: 0o600 });
    const files = [{ path: 'snapshot.json', bytes: snapshotBytes.length, sha256: digest(snapshotBytes) }];
    for (const file of models) {
      const bytes = await checkedRead(path.join(config.modelsDir, path.basename(file)));
      await writeFile(path.join(staging, file), bytes, { mode: 0o600 });
      files.push({ path: file, bytes: bytes.length, sha256: digest(bytes) });
    }
    const manifest = { format: 'cubicles-full-backup', version: 1, createdAt: new Date().toISOString(), files };
    await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    await rename(staging, directory);
    return directory;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyFullBackup(directory) {
  const manifest = JSON.parse(await checkedRead(path.join(directory, 'manifest.json')));
  if (manifest.format !== 'cubicles-full-backup' || manifest.version !== 1 || !Array.isArray(manifest.files)) {
    throw new Error('不支持的完整备份格式。');
  }
  const names = new Set();
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || !(file.path === 'snapshot.json' || /^models\/[a-f0-9-]{36}\.glb$/.test(file.path)) || names.has(file.path)) {
      throw new Error('备份文件路径无效或重复。');
    }
    names.add(file.path);
    const bytes = await checkedRead(path.join(directory, file.path));
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error(`备份文件校验失败：${file.path}`);
  }
  if (!names.has('snapshot.json')) throw new Error('备份缺少数据库快照。');
  const snapshot = JSON.parse(await checkedRead(path.join(directory, 'snapshot.json')));
  if (snapshot.format !== 'cubicles-full-backup' || snapshot.version !== 1 || !snapshot.tables) throw new Error('数据库快照格式无效。');
  for (const name of Object.keys(tables)) {
    if (!(name in snapshot.tables) && identityDomainNames.includes(name) && !snapshot.tables.communityState?.[0]?.data?.domainStorageVersion) snapshot.tables[name] = [];
    if (!(name in snapshot.tables) && domains.some(domain=>domain.name===name) && snapshot.tables.communityState?.[0]?.data?.domainStorage !== 1) snapshot.tables[name] = [];
    if (!Array.isArray(snapshot.tables[name])) throw new Error(`备份缺少数据表：${name}`);
  }
  const expected = ['snapshot.json', ...modelFiles(snapshot.tables)].sort();
  if (JSON.stringify([...names].sort()) !== JSON.stringify(expected)) throw new Error('备份中的模型与数据库引用不一致。');
  return { manifest, tables: snapshot.tables };
}

export async function restoreFullBackup(directory, { backupCurrent = true } = {}) {
  const verified = await verifyFullBackup(directory);
  const current = await databaseSnapshot();
  const previous = backupCurrent && current.communityState.length ? await writeFullBackup('pre-restore') : null;
  await mkdir(config.modelsDir, { recursive: true, mode: 0o700 });
  const created = [];
  try {
    for (const file of verified.manifest.files.filter(file => file.path.startsWith('models/'))) {
      const destination = path.join(config.modelsDir, path.basename(file.path));
      const bytes = await checkedRead(path.join(directory, file.path));
      if (digest(bytes) !== file.sha256) throw new Error(`恢复期间备份文件发生变化：${file.path}`);
      try {
        await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
        created.push(destination);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (digest(await checkedRead(destination)) !== file.sha256) throw new Error(`现有模型与备份冲突：${file.path}`);
      }
    }
    await getDb().transaction(async transaction => {
      for (const table of Object.values(tables).reverse()) await transaction.delete(table);
      for (const [name, table] of Object.entries(tables)) {
        const rows = verified.tables[name].map(row => name === 'communityState' ? { ...row, updatedAt: new Date(row.updatedAt) } : row);
        for (let offset = 0; offset < rows.length; offset += 250) await transaction.insert(table).values(rows.slice(offset, offset + 250));
      }
      await transaction.execute(sql`SELECT setval(pg_get_serial_sequence('messages', 'seq'), COALESCE((SELECT MAX(seq) FROM messages), 1), EXISTS(SELECT 1 FROM messages))`);
    });
    return { previous, users: inflateState(verified.tables.communityState[0].data, verified.tables).users.length, models: modelFiles(verified.tables).length };
  } catch (error) {
    await Promise.all(created.map(file => rm(file, { force: true })));
    throw error;
  }
}

export async function pruneFullBackups(keep = 30) {
  const entries = await readdir(config.backupDir, { withFileTypes: true });
  const directories = entries.filter(entry => entry.isDirectory() && /^community-/.test(entry.name)).map(entry => entry.name).sort();
  for (const name of directories.slice(0, Math.max(0, directories.length - keep))) {
    await verifyFullBackup(path.join(config.backupDir, name));
    await rm(path.join(config.backupDir, name), { recursive: true });
  }
}

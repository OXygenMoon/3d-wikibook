import { readFile, lstat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { initDatabase, migrateDatabase, closeDatabase } from '../src/server/db.mjs';
import { databaseSnapshot, writeFullBackup } from '../src/server/backup.mjs';
import { inflateState } from '../src/server/db/domains.mjs';
import { initStore, getState, getRevision, commitImportedState } from '../src/server/store.mjs';
import { prepareWikibookImport } from '../src/server/wikibook-import.mjs';

function reject(message) {
  const error = new Error(message);
  error.safeImportError = true;
  throw error;
}

async function privateJson(file) {
  const resolved = path.resolve(file);
  const info = await lstat(resolved);
  if (!info.isFile() || (info.mode & 0o077) || info.size > 10 * 1024 * 1024) reject('输入必须是权限 600 的普通 JSON 文件，且不超过 10 MiB。');
  try { return JSON.parse(await readFile(resolved, 'utf8')); }
  catch { reject('无法解析输入 JSON，请检查文件格式。'); }
}

try {
  const { values } = parseArgs({ options: { roster: { type: 'string' }, credentials: { type: 'string' }, commit: { type: 'boolean', default: false }, confirm: { type: 'string' } } });
  if (!values.roster || !values.credentials) reject('用法：npm run wikibook:import -- --roster <名单.json> --credentials <凭据.json> [--commit --confirm <计划指纹>]');
  const roster = await privateJson(values.roster);
  const credentials = await privateJson(values.credentials);
  await initDatabase({ migrate: false, reset: false, access: values.commit ? 'writer' : 'reader' });
  const snapshot = await databaseSnapshot();
  if (snapshot.communityState.length !== 1) reject('目标尚未初始化，请先启动平台创建数据库。');
  const target = inflateState(snapshot.communityState[0].data, snapshot);
  const prepared = prepareWikibookImport(roster, credentials, target);
  const summary = { dryRun: !values.commit, canPlan: prepared.report.canPlan, changed: prepared.changed, fingerprint: prepared.fingerprint, existingCredentialsIgnored: prepared.report.existingCredentialsIgnored || 0, summary: prepared.report.summary, issues: prepared.report.issues };
  if (!prepared.report.canPlan) { console.log(JSON.stringify(summary, null, 2)); process.exitCode = 1; }
  else if (!values.commit) console.log(JSON.stringify(summary, null, 2));
  else {
    if (values.confirm !== prepared.fingerprint) reject('计划指纹不匹配，请重新预览并确认；未写入目标数据。');
    if (!prepared.changed) console.log(JSON.stringify({ ...summary, applied: false, reason: 'already-imported' }, null, 2));
    else {
      const backup = await writeFullBackup('before-wikibook-import');
      await migrateDatabase();
      await initStore({ autoImport: false, createIfMissing: false });
      const refreshed = prepareWikibookImport(roster, credentials, getState());
      if (refreshed.fingerprint !== prepared.fingerprint) reject('目标迁移后的状态发生变化，请重新预览；已保留导入前备份。');
      await commitImportedState(refreshed.next, getRevision());
      console.log(JSON.stringify({ ...summary, applied: true, backup, revision: getRevision() }, null, 2));
    }
  }
} catch (error) {
  console.error(`WikiBook import failed: ${error.status || error.safeImportError ? error.message : '读取、锁定或保存失败；未输出底层错误，以免泄露凭据。请确认文件、数据库和停服状态。'}`);
  process.exitCode = 1;
} finally { await closeDatabase(); }

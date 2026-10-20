import { open, readFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.mjs';

export async function acquireDatabaseLock(access = 'writer') {
  if (config.databaseUrl) {
    if (access === 'reader') return async () => {};
    const { Client } = await import('pg');
    const client = new Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 5000 });
    await client.connect();
    try {
      const result = await client.query('SELECT pg_try_advisory_lock(728346910) AS locked');
      if (!result.rows[0].locked) throw new Error('数据库已有应用或维护进程在写入，请先停止应用再恢复。');
      client.on('error', error => { console.error(`database writer lock lost: ${error.message}`); process.exit(1); });
      return async () => client.end();
    } catch (error) {
      await client.end();
      throw error;
    }
  }
  const file = `${config.pgliteDir}.lock`;
  await mkdir(path.dirname(file), { recursive: true });
  const owner = randomUUID();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let handle;
    try {
      handle = await open(file, 'wx', 0o600);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const current = JSON.parse(await readFile(file, 'utf8'));
      if (!Number.isSafeInteger(current.pid) || current.pid <= 0) throw new Error('数据库锁无效，请先确认应用已停止。');
      try {
        process.kill(current.pid, 0);
      } catch (probe) {
        if (probe.code !== 'ESRCH') throw probe;
        await unlink(file);
        continue;
      }
      throw new Error('PGlite 数据库正在使用，请先停止应用，再执行备份或恢复。');
    }
    await handle.writeFile(JSON.stringify({ pid: process.pid, owner }));
    await handle.close();
    return async () => {
      const current = JSON.parse(await readFile(file, 'utf8'));
      if (current.owner === owner) await unlink(file);
    };
  }
  throw new Error('无法取得数据库锁，请稍后重试。');
}

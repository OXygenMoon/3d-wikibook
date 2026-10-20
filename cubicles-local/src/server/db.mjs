import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import * as schema from './db/schema.mjs';
import { config } from './config.mjs';
import { logger } from './logger.mjs';
import { acquireDatabaseLock } from './database-lock.mjs';

let driver = null;
let pool = null;
let pglite = null;
let db = null;
let releaseLock = null;

export function getDb() {
  if (!db) throw new Error('database has not been initialized');
  return db;
}

export function getDriver() {
  return driver;
}

export async function migrateDatabase() {
  const migrationsFolder = path.join(config.root, 'drizzle');
  if (driver === 'postgres') await migratePostgres(getDb(), { migrationsFolder });
  else if (driver === 'pglite') await migratePglite(getDb(), { migrationsFolder });
  else throw new Error('database has not been initialized');
}

export async function rawQuery(text, params = []) {
  if (driver === 'postgres') {
    const result = await pool.query(text, params);
    return { rows: result.rows, rowCount: result.rowCount };
  }
  if (driver === 'pglite') {
    const result = await pglite.query(text, params);
    return { rows: result.rows, rowCount: result.rows.length };
  }
  throw new Error('database has not been initialized');
}

async function resetSchema() {
  logger.warn({ driver }, 'resetting database schema because CUBICLES_DB_RESET=1');
  await rawQuery('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await rawQuery('DROP SCHEMA IF EXISTS public CASCADE');
  await rawQuery('CREATE SCHEMA public');
}

export async function initDatabase({ migrate = true, reset = config.dbReset, access = 'writer' } = {}) {
  if (db) return db;
  releaseLock = await acquireDatabaseLock(access);

  try {
    if (config.databaseUrl) {
      const { Pool } = await import('pg');
      pool = new Pool({
        connectionString: config.databaseUrl,
        max: Number(process.env.PG_POOL_MAX || 10),
        connectionTimeoutMillis: 5000,
      });
      pool.on('error', error => logger.error({ err: error }, 'postgres pool error'));
      db = drizzle(pool, { schema });
      driver = 'postgres';
      if (reset) await resetSchema();
      if (migrate) await migrateDatabase();
    } else {
      const { PGlite } = await import('@electric-sql/pglite');
      pglite = new PGlite(config.pgliteDir);
      await pglite.waitReady;
      db = drizzlePglite(pglite, { schema });
      driver = 'pglite';
      if (reset) await resetSchema();
      if (migrate) await migrateDatabase();
    }

    logger.info({ driver, databaseUrl: config.databaseUrl ? 'configured' : 'embedded-pglite' }, 'database ready');
    return db;
  } catch (error) {
    await closeDatabase();
    throw error;
  }
}

export async function healthCheck() {
  try {
    await rawQuery('SELECT 1 AS ok');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'database health check failed');
    return false;
  }
}

export async function closeDatabase() {
  if (pool) await pool.end();
  if (pglite) await pglite.close();
  pool = null;
  pglite = null;
  db = null;
  driver = null;
  if (releaseLock) await releaseLock();
  releaseLock = null;
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const dataDir = path.resolve(ROOT, process.env.CUBICLES_DATA_DIR || '.local-data');

export const config = Object.freeze({
  root: ROOT,
  production,
  test: process.env.NODE_ENV === 'test',
  host: process.env.HOST || '127.0.0.1',
  port: num(process.env.PORT, 4173),
  dataDir,
  modelsDir: path.join(dataDir, 'models'),
  backupDir: path.resolve(ROOT, process.env.CUBICLES_BACKUP_DIR || 'backups'),
  databaseUrl: process.env.DATABASE_URL || '',
  pgliteDir: path.resolve(ROOT, process.env.PGLITE_DIR || path.join(dataDir, 'pglite')),
  dbReset: bool(process.env.CUBICLES_DB_RESET, false),
  autoImport: bool(process.env.AUTO_IMPORT, true),
  importFile: path.resolve(process.env.CUBICLES_IMPORT_FILE || path.join(dataDir, 'community.json')),
  sessionTtlMs: num(process.env.SESSION_TTL_DAYS, 7) * 86400000,
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
  bodyLimit: num(process.env.REQUEST_BODY_LIMIT, 500000),
  modelLimit: num(process.env.MODEL_UPLOAD_LIMIT, 20 * 1024 * 1024),
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  sentryDsn: process.env.SENTRY_DSN || '',
  sentryTracesSampleRate: num(process.env.SENTRY_TRACES_SAMPLE_RATE, 0),
  adminUsername: (process.env.DEFAULT_ADMIN_USERNAME || 'lzy').toLowerCase(),
  adminPassword: process.env.DEFAULT_ADMIN_PASSWORD || '123456',
  publicOrigin: process.env.PUBLIC_ORIGIN || '',
  staticDir: production ? path.join(ROOT, 'dist') : ROOT,
});

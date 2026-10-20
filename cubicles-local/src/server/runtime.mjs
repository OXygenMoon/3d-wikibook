import { mkdir } from 'node:fs/promises';
import { config } from './config.mjs';
import { initDatabase, closeDatabase } from './db.mjs';
import { initStore } from './store.mjs';
import { loadSessions, cleanupSessions, startSessionPersistence, stopSessionPersistence } from './session-store.mjs';
import { loadMessages } from './message-store.mjs';
import { initMonitoring } from './monitoring.mjs';

let initialized = false;

export async function initApp({ monitoring = true, autoImport, createIfMissing = true } = {}) {
  if (initialized) return;
  await mkdir(config.modelsDir, { recursive: true });
  await initDatabase();
  await initStore({ autoImport, createIfMissing });
  await loadSessions();
  await cleanupSessions();
  await loadMessages();
  startSessionPersistence();
  if (monitoring) await initMonitoring();
  initialized = true;
}

export async function shutdownApp() {
  try { await stopSessionPersistence(); }
  finally { await closeDatabase(); initialized = false; }
}

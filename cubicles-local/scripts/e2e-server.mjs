import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temp = path.join(root, '.tmp/e2e');
await rm(temp, { recursive: true, force: true });
await mkdir(path.join(temp, 'data'), { recursive: true });

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';
process.env.AUTO_IMPORT = 'false';
process.env.CUBICLES_DB_RESET = '1';
process.env.CUBICLES_DATA_DIR = path.join(temp, 'data');
process.env.PGLITE_DIR = path.join(temp, 'pglite');
process.env.DATABASE_URL = '';

const { server } = await import('../server.mjs');
const { shutdownApp } = await import('../src/server/runtime.mjs');

const port = Number(process.env.E2E_PORT || 4174);
server.listen(port, '127.0.0.1', () => {
  console.log(`E2E server listening on http://127.0.0.1:${port}`);
});

async function stop() {
  await new Promise(resolve => server.close(resolve));
  await shutdownApp();
  process.exit(0);
}

process.once('SIGTERM', stop);
process.once('SIGINT', stop);

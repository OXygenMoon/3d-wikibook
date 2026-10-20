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
if (process.env.E2E_PRODUCTION === '1') process.argv.push('--production');

const { server } = await import('../server.mjs');
const { shutdownApp } = await import('../src/server/runtime.mjs');
const { getState, getRevision, commitImportedState } = await import('../src/server/store.mjs');
const { prepareWikibookImport } = await import('../src/server/wikibook-import.mjs');
const importedFixture = prepareWikibookImport({ format: 'wikibook-roster', version: 1, namespace: 'e2e-fixture', classes: [{ id: 1, name: '测试源班级' }], groups: [], students: [{ id: 901, username: '迁移样本', name: '迁移样本', classId: 1, groupIds: [] }], classMappings: [{ sourceClassId: 1, targetZoneId: 1 }], bindings: [] }, { format: 'wikibook-credentials', version: 1, namespace: 'e2e-fixture', credentials: [{ sourceUserId: 901, passwordHash: 'scrypt:32768:8:1$FZuYitt1$52a01314827474b4318d8a39e18412d829539a5ae046d4acd48880ee963878626b2fbef668be0c88e60c3bbbecf2cb83b83917b06eddf681c7d05e3e8570d3d9' }] }, getState());
await commitImportedState(importedFixture.next, getRevision());

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

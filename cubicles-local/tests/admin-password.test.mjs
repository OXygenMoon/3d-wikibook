import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

const directory = await mkdtemp(path.join(tmpdir(), 'cubicles-admin-password-'));
Object.assign(process.env, { NODE_ENV: 'test', LOG_LEVEL: 'silent', CUBICLES_DATA_DIR: directory, CUBICLES_BACKUP_DIR: path.join(directory, 'backups'), PGLITE_DIR: path.join(directory, 'pglite'), DATABASE_URL: '', AUTO_IMPORT: 'false', CUBICLES_DB_RESET: '0' });
const { initDatabase, closeDatabase, getDb } = await import('../src/server/db.mjs');
const { initStore, getState } = await import('../src/server/store.mjs');
const { users, sessions, auditLog } = await import('../src/server/db/schema.mjs');
const { adminPasswordError, changeAdminPassword } = await import('../src/server/admin-password.mjs');
const { verifyPassword } = await import('../src/server/password.mjs');
const { verifyFullBackup } = await import('../src/server/backup.mjs');
after(async () => { await closeDatabase(); await rm(directory, { recursive: true, force: true }); });

test('administrator password policy rejects development passwords and accepts strong passphrases', () => {
  for (const password of ['123456', 'abcdefghijklmnop', 'A'.repeat(300)]) assert.ok(adminPasswordError(password));
  assert.equal(adminPasswordError('Test-New-Password-2026!'), '');
  assert.equal(adminPasswordError('correct horse battery staple'), '');
});

test('offline administrator rotation backs up, atomically revokes own sessions and preserves all profile data', async () => {
  await initDatabase();await initStore({ autoImport: false });
  const administrator = structuredClone(getState().users.find(user => user.role === 'admin'));
  const own = randomUUID();const guest = randomUUID();
  await getDb().insert(sessions).values([{ id: own, userId: administrator.id, name: '管理员', createdAt: Date.now(), seen: Date.now(), x: 0, z: 0 }, { id: guest, userId: null, name: '访客', createdAt: Date.now(), seen: Date.now(), x: 0, z: 0 }]);
  const result = await changeAdminPassword(administrator.username, 'Test-New-Password-2026!');
  const row = (await getDb().select().from(users).where(eq(users.id, administrator.id)))[0];
  assert.equal(await verifyPassword('Test-New-Password-2026!', row.data.passwordHash), true);
  assert.equal(await verifyPassword('123456', row.data.passwordHash), false);
  assert.deepEqual({ ...row.data, passwordHash: administrator.passwordHash }, administrator);
  assert.deepEqual((await getDb().select().from(sessions)).map(session => session.id), [guest]);
  assert.equal((await getDb().select().from(auditLog)).at(-1).action, 'admin.password_changed');
  const backup = await verifyFullBackup(result.backup);assert.ok(backup.tables.users.some(user => user.data.passwordHash === administrator.passwordHash));
  await assert.rejects(changeAdminPassword(administrator.username, '123456'), /16/);
  await assert.rejects(changeAdminPassword('missing-admin', 'Test-New-Password-2026!'), /不存在/);
  await assert.rejects(changeAdminPassword(administrator.username, 'Test-New-Password-2026!'), /不能与当前密码相同/);
});

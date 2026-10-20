import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { getDb } from './db.mjs';
import { users, sessions, communityState, auditLog } from './db/schema.mjs';
import { hashPassword, verifyPassword } from './password.mjs';
import { writeFullBackup } from './backup.mjs';

export function adminPasswordError(password) {
  if (typeof password !== 'string' || password.length < 16 || password.length > 256) return '密码须为 16–256 个字符。';
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/u].filter(pattern => pattern.test(password)).length;
  if (classes < 3 && !(password.length >= 24 && /\s/u.test(password) && classes >= 2)) return '请包含大小写、数字、符号中的至少三类，或使用至少 24 字符的多词短语。';
  return '';
}

export async function changeAdminPassword(username, password) {
  const error = adminPasswordError(password);
  if (error) throw new Error(error);
  const database = getDb();
  const row = (await database.select().from(users).where(eq(users.username, username)).limit(1))[0];
  if (!row || row.role !== 'admin') throw new Error('指定管理员账号不存在。');
  if (await verifyPassword(password, row.data.passwordHash)) throw new Error('新密码不能与当前密码相同。');
  const backup = await writeFullBackup('before-admin-password');
  const passwordHash = await hashPassword(password);
  await database.transaction(async transaction => {
    await transaction.update(users).set({ data: { ...row.data, passwordHash } }).where(eq(users.id, row.id));
    await transaction.delete(sessions).where(eq(sessions.userId, row.id));
    await transaction.update(communityState).set({ revision: sql`${communityState.revision} + 1`, updatedAt: new Date() }).where(eq(communityState.id, 1));
    await transaction.insert(auditLog).values({ id: randomUUID(), actorId: row.id, action: 'admin.password_changed', target: row.id, detail: { sessionsRevoked: true }, createdAt: Date.now() });
  });
  return { username, backup, sessionsRevoked: true };
}

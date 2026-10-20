import { randomUUID } from 'node:crypto';
import { getState } from './store.mjs';
import { fail, clean } from './http.mjs';
import { hashPassword } from './password.mjs';
import { ITEMS, generateOffices } from '../community.js';

export async function importMembers(rows, authorize) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 300) fail(400, '请导入 1–300 行用户。');
  const state = getState();
  const known = new Set(state.users.map(user => user.username));
  const occupied = new Set(state.users.map(user => user.officeId));
  const seats = generateOffices(state.zones, state.officePositions);
  const pending = [];
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail(400, `第 ${index + 1} 行名单格式不正确。`);
    const username = clean(row.username, 32).toLowerCase();
    const password = String(row.password || '');
    const name = clean(row.name, 24) || username;
    const zone = state.zones.find(candidate => candidate.id === Number(row.classId) || candidate.name === row.className);
    if (!/^[a-z0-9_.-]{2,32}$/.test(username)) fail(400, `第 ${index + 1} 行账号格式不正确。`);
    if (known.has(username)) fail(409, `第 ${index + 1} 行账号 ${username} 重复，整批未导入。`);
    if (password.length < 6 || password.length > 128) fail(400, `第 ${index + 1} 行密码需要 6–128 位。`);
    if (!zone) fail(400, `第 ${index + 1} 行班级不存在，请先创建区域。`);
    authorize(zone);
    const office = seats.find(candidate => candidate.zoneId === zone.id && !occupied.has(candidate.id));
    if (!office) fail(409, `${zone.name} 的工位不足，请先增加行列。`);
    known.add(username);
    occupied.add(office.id);
    pending.push({ id: randomUUID(), username, name, passwordHash: await hashPassword(password), role: 'user', teachingClassIds: [], classId: zone.id, officeId: office.id, avatar: 'classic', color: '#a6b79a', inventory: Object.fromEntries(ITEMS.map(item => [item.id, item.limit])), score: 0, createdAt: Date.now() });
  }
  const currentSeats = new Set(generateOffices(state.zones, state.officePositions).map(office => office.id));
  for (const user of pending) authorize(state.zones.find(zone => zone.id === user.classId));
  if (pending.some(user => state.users.some(existing => existing.username === user.username || existing.officeId === user.officeId) || !currentSeats.has(user.officeId))) fail(409, '处理期间名单或工位已变化，请重新提交本批名单。');
  state.users.push(...pending);
  return pending;
}

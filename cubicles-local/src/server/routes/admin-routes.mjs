import { randomUUID } from 'node:crypto';
import { GRID, centerOf } from '../../grid.js';
import { ITEMS, generateOffices } from '../../community.js';
import { clean, fail, readJson, sendJson } from '../http.mjs';
import { getState, saveState, bumpRevision } from '../store.mjs';
import { requireAdmin, publicUser } from '../auth.mjs';
import {
  offices,
  worldBuildings,
  worldData,
  positionsForZone,
  validateZone,
  validateWorldLayout,
} from '../domain.mjs';
import { hashPassword } from '../password.mjs';
import { writeAudit } from '../audit.mjs';
import { uploadModel } from '../resources.mjs';
import { importMembers } from '../members.mjs';

export async function handleAdminRoutes(req, res, url, session) {
  const path = url.pathname;

  if (path === '/api/admin/models' && req.method === 'POST') {
    const asset = await uploadModel(req, url, session, { admin: true });
    sendJson(res, 201, { asset });
    return true;
  }

  if (path === '/api/admin/layout' && req.method === 'PUT') {
    const admin = requireAdmin(session);
    const data = await readJson(req);
    const list = validateWorldLayout(data);
    const state = getState();
    const zones = state.zones.map(zone => {
      const building = list.find(item => item.id === `class-${zone.id}`);
      const center = centerOf(building);
      return { ...zone, x: center.x, z: center.z };
    });
    const positions = {};
    for (const building of list.filter(item => item.kind === 'office')) {
      positions[building.officeId] = { gridX: building.gridX, gridZ: building.gridZ };
    }
    state.zones = zones;
    state.officePositions = positions;
    state.buildings = list.filter(item => !['class', 'office'].includes(item.kind));
    state.layoutRevision += 1;
    bumpRevision();
    await saveState();
    await writeAudit({ actorId: admin.id, action: 'world.layout', target: String(state.layoutRevision), detail: { buildings: list.length } });
    sendJson(res, 200, worldData());
    return true;
  }

  if (path === '/api/admin' && req.method === 'GET') {
    requireAdmin(session);
    const state = getState();
    sendJson(res, 200, {
      users: state.users.map(publicUser),
      zones: state.zones,
      settings: state.settings,
      buildings: worldBuildings(),
      modelAssets: state.modelAssets,
      layoutRevision: state.layoutRevision,
      grid: GRID,
    });
    return true;
  }

  if (path === '/api/admin/import' && req.method === 'POST') {
    const admin = requireAdmin(session);
    const data = await readJson(req);
    const pending = await importMembers(data.users, () => requireAdmin(session));
    bumpRevision();
    await saveState();
    await writeAudit({ actorId: admin.id, action: 'users.import', target: String(pending.length), detail: { count: pending.length } });
    sendJson(res, 201, { created: pending.length, users: pending.map(publicUser) });
    return true;
  }

  if (path === '/api/admin/zones' && req.method === 'POST') {
    const admin = requireAdmin(session);
    const data = await readJson(req);
    const state = getState();
    const id = Math.max(0, ...state.zones.map(zone => zone.id)) + 1;
    const zone = validateZone(data, id);
    state.officePositions = positionsForZone(zone);
    state.zones.push(zone);
    state.layoutRevision += 1;
    bumpRevision();
    await saveState();
    await writeAudit({ actorId: admin.id, action: 'zone.create', target: String(id), detail: { name: zone.name } });
    sendJson(res, 201, worldData());
    return true;
  }

  if (/^\/api\/admin\/zones\/\d+$/.test(path) && req.method === 'PATCH') {
    const admin = requireAdmin(session);
    const id = Number(path.split('/').pop());
    const state = getState();
    const index = state.zones.findIndex(zone => zone.id === id);
    if (index < 0) fail(404, '班级区域不存在。');
    const zone = validateZone(await readJson(req), id);
    state.officePositions = positionsForZone(zone);
    state.zones[index] = zone;
    state.layoutRevision += 1;
    bumpRevision();
    await saveState();
    await writeAudit({ actorId: admin.id, action: 'zone.update', target: String(id), detail: { name: zone.name } });
    sendJson(res, 200, worldData());
    return true;
  }

  if (path === '/api/admin/assign' && req.method === 'POST') {
    const admin = requireAdmin(session);
    const data = await readJson(req);
    const state = getState();
    const user = state.users.find(item => item.id === data.userId);
    const office = offices().find(item => item.id === Number(data.officeId));
    if (!user || !office) fail(404, '用户或工位不存在。');
    if (office.ownerId && office.ownerId !== user.id) fail(409, '该工位已有主人。');
    const old = state.officeStyles[user.officeId];
    if (old && user.officeId !== office.id) {
      state.officeStyles[office.id] = old;
      delete state.officeStyles[user.officeId];
    }
    user.classId = office.zoneId;
    user.officeId = office.id;
    bumpRevision();
    await saveState();
    await writeAudit({ actorId: admin.id, action: 'user.assign', target: user.id, detail: { officeId: office.id } });
    sendJson(res, 200, { user: publicUser(user) });
    return true;
  }

  if (path === '/api/admin/settings' && req.method === 'PATCH') {
    const admin = requireAdmin(session);
    const data = await readJson(req);
    if (!['auto', 'manual'].includes(data.timeMode)) fail(400, '时间模式不正确。');
    if (!Number.isFinite(Number(data.hour)) || data.hour < 0 || data.hour > 23) fail(400, '小时范围为 0–23。');
    const state = getState();
    state.settings = { timeMode: data.timeMode, hour: Number(data.hour) };
    bumpRevision();
    await saveState();
    await writeAudit({ actorId: admin.id, action: 'settings.update', target: 'time', detail: state.settings });
    sendJson(res, 200, state.settings);
    return true;
  }

  return false;
}

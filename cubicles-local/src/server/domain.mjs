import {
  GRID,
  zoneRect,
  zoneBuilding,
  officeBuilding,
  defaultBuildings,
  areaForBuilding,
  footprint,
  centerOf,
  layoutErrors,
} from '../grid.js';
import {
  PUBLIC_AREAS,
  generateOffices,
  withinOffice,
  withinArea,
} from '../community.js';
import { getState, getRevision } from './store.mjs';
import { sessions, onlineUserIds } from './session-store.mjs';
import { fail } from './http.mjs';

export function findUser(id) {
  return getState().users.find(user => user.id === id);
}

export function userOf(session) {
  return session?.userId ? findUser(session.userId) : undefined;
}

export function offices() {
  const state = getState();
  const online = onlineUserIds();
  return generateOffices(state.zones, state.officePositions).map(office => {
    const owner = state.users.find(user => user.officeId === office.id);
    const style = state.officeStyles[office.id] || {};
    return {
      ...office,
      ...style,
      tagline: style.tagline || (owner ? '欢迎来到我的学习空间，一起成长。' : office.tagline),
      ownerId: owner?.id || null,
      owner: owner?.name || '待分配',
      online: owner ? online.has(owner.id) : false,
      name: style.name || (owner ? `${owner.name}的工位` : office.name),
      monogram: style.monogram || (owner ? owner.name[0] : '位'),
    };
  });
}

export function worldBuildings(zones = getState().zones, positions = getState().officePositions, buildings = getState().buildings) {
  const state = getState();
  const desks = generateOffices(zones, positions).map(office => ({
    ...office,
    name:
      state.officeStyles[office.id]?.name ||
      (state.users.find(user => user.officeId === office.id)
        ? `${state.users.find(user => user.officeId === office.id).name}的工位`
        : office.name),
  }));
  return [...zones.map(zoneBuilding), ...desks.map(officeBuilding), ...buildings];
}

export function areas() {
  const state = getState();
  return state.buildings
    .filter(building => building.enabled !== false && PUBLIC_AREAS.some(template => template.id === building.id))
    .map(building => areaForBuilding(building, PUBLIC_AREAS.find(template => template.id === building.id)));
}

export function worldData() {
  const state = getState();
  return {
    grid: GRID,
    buildings: worldBuildings(),
    modelAssets: state.modelAssets,
    layoutRevision: state.layoutRevision,
    offices: offices(),
    neighborhoods: state.zones,
    zones: state.zones,
    areas: areas(),
    settings: state.settings,
    visitors: state.visitors,
    revision: getRevision(),
    stickers: state.stickers,
    serverTime: Date.now(),
  };
}

export function players(exclude) {
  const now = Date.now();
  return [...sessions.values()]
    .filter(session => now - session.seen < 12000 && session.id !== exclude)
    .map(session => {
      const user = userOf(session);
      return {
        id: session.id,
        userId: user?.id,
        name: user?.name || session.name,
        x: session.x,
        z: session.z,
        rotation: session.rotation,
        avatar: user?.avatar || session.avatar,
        color: user?.color || session.color,
        dancing: session.dancing,
        reaction: now - (session.reactionAt || 0) < 5000 ? session.reaction : '',
      };
    });
}

export function nearbyArea(session, id) {
  const area = areas().find(item => item.id === id);
  if (!area) fail(404, '该公共区域尚未开放。');
  if (!withinArea(session, area)) fail(403, '请先走进对应的公共区域，再按 E 互动。');
  return area;
}

export function editPermission(session, id, user) {
  const office = offices().find(item => item.id === id);
  if (!office) fail(404, '没有找到工位。');
  if (office.ownerId !== user.id) fail(403, '只能布置自己的工位。');
  if (!withinOffice(session, office)) fail(403, '请先到达自己的工位入口，再打开编辑。');
  return office;
}

export function positionsForZone(zone) {
  const state = getState();
  const old = state.zones.find(item => item.id === zone.id);
  const positions = structuredClone(state.officePositions);
  for (const [id, position] of Object.entries(positions)) {
    if (Math.floor(Number(id) / 1000) !== zone.id) continue;
    if (!old || old.rows !== zone.rows || old.columns !== zone.columns || old.spacing !== zone.spacing) {
      delete positions[id];
    } else {
      const from = zoneRect(old);
      const to = zoneRect(zone);
      position.gridX += to.gridX - from.gridX;
      position.gridZ += to.gridZ - from.gridZ;
    }
  }
  return positions;
}

export function validateZone(data, id) {
  const state = getState();
  const number = (key, min, max) => {
    const value = Number(data[key]);
    if (!Number.isFinite(value) || value < min || value > max) {
      fail(400, `${({ x: '区域中心 X', z: '区域中心 Z', columns: '每行工位数', rows: '工位行数', spacing: '工位间距' })[key]} 超出范围。`);
    }
    return value;
  };
  const zone = {
    id,
    name: typeof data.name === 'string' ? data.name.trim().slice(0, 24) : '',
    x: number('x', -60, 60),
    z: number('z', -60, 60),
    columns: number('columns', 1, 8),
    rows: number('rows', 1, 8),
    spacing: number('spacing', 6, 10),
    color: /^#[\da-f]{6}$/i.test(data.color || '') ? data.color : '#91ad83',
  };
  if (!zone.name || !Number.isInteger(zone.columns) || !Number.isInteger(zone.rows) || !Number.isInteger(zone.spacing)) {
    fail(400, '请输入班级名称和整数行列、整数网格间距。');
  }
  if (state.zones.some(item => item.id !== id && item.name === zone.name)) fail(409, '班级名称已存在。');
  const rect = zoneRect(zone);
  zone.x = rect.gridX + rect.width / 2;
  zone.z = rect.gridZ + rect.depth / 2;
  if (
    state.zones
      .filter(item => item.id !== id)
      .reduce((count, item) => count + item.rows * item.columns, 0) +
      zone.rows * zone.columns >
    256
  ) {
    fail(400, '当前社区最多配置 256 个工位。');
  }
  if (state.users.some(user => user.classId === id && user.officeId > id * 1000 + zone.rows * zone.columns)) {
    fail(409, '缩减后的区域无法容纳现有工位，请先重新分配用户。');
  }
  const zones = [...state.zones.filter(item => item.id !== id), zone].sort((a, b) => a.id - b.id);
  const errors = layoutErrors(worldBuildings(zones, positionsForZone(zone)));
  if (errors.length) fail(409, errors[0]);
  return zone;
}

export function validateWorldLayout(data) {
  const state = getState();
  if (data.baseRevision !== state.layoutRevision) {
    fail(409, '世界布局已被其他窗口更新，请重新加载布局后再保存。');
  }
  if (!Array.isArray(data.buildings) || data.buildings.length > 400) {
    fail(400, '建筑列表格式不正确或数量过多。');
  }
  const current = worldBuildings();
  const known = new Map(current.map(building => [building.id, building]));
  const seen = new Set();
  const list = [];

  for (const raw of data.buildings) {
    if (typeof raw.id !== 'string' || seen.has(raw.id)) fail(400, '建筑编号无效或重复。');
    seen.add(raw.id);
    const old = known.get(raw.id);
    if (!old && !/^model-[a-z0-9-]{8,64}$/.test(raw.id)) fail(400, '新建筑编号无效。');
    const kind = old?.kind || 'custom';
    const building = {
      id: raw.id,
      kind,
      name: (typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '') || old?.name || '自定义建筑',
      gridX: raw.gridX,
      gridZ: raw.gridZ,
      width: raw.width,
      depth: raw.depth,
      rotation: raw.rotation,
      enabled: raw.enabled !== false,
      solid: Boolean(raw.solid),
      assetId: raw.assetId || null,
    };
    if (kind === 'class' || kind === 'office') {
      if (!old) fail(400, '班级或工位不存在。');
      if (raw.width !== old.width || raw.depth !== old.depth || raw.rotation !== 0 || !building.enabled) {
        fail(400, '班级与工位的大小请在班级区域设置中调整。');
      }
      Object.assign(building, {
        name: old.name,
        parentId: old.parentId,
        zoneId: old.zoneId,
        officeId: old.officeId,
        assetId: null,
        solid: false,
      });
    } else {
      if (
        !Number.isInteger(building.width) ||
        !Number.isInteger(building.depth) ||
        building.width < 1 ||
        building.depth < 1 ||
        building.width > 40 ||
        building.depth > 40
      ) {
        fail(400, '模型占地需要 1–40 格。');
      }
      if (building.assetId && !state.modelAssets.some(asset => asset.id === building.assetId)) {
        fail(400, '模型资源不存在，请先导入。');
      }
      if (kind === 'custom' && !building.assetId) fail(400, '自定义建筑必须选择一个已导入模型。');
      if (
        !building.assetId &&
        old &&
        (building.width !== 16 || building.depth !== (kind === 'wall' ? 12 : 16))
      ) {
        fail(400, '内置公共建筑尺寸固定，替换自定义模型后可调整占地。');
      }
    }
    list.push(building);
  }

  for (const old of current) {
    if (old.kind !== 'custom' && !seen.has(old.id)) {
      fail(400, '不能移除班级或工位；公共建筑可通过关闭显示来收起。');
    }
  }
  const errors = layoutErrors(list);
  if (errors.length) fail(409, errors[0]);
  return list;
}

export function publicBuildingTemplate(id) {
  return PUBLIC_AREAS.find(template => template.id === id);
}

export function defaultWorldBuildings() {
  return defaultBuildings(PUBLIC_AREAS);
}

export { footprint, centerOf, layoutErrors };

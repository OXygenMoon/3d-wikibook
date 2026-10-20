import { ITEMS } from './community.js';
import { isModelItem, modelAssetId, effectiveSize, canUseModel } from './model-meta.js';

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function validateFurniture(furniture, { assets = [], inventory = {}, userId, unlockedModelIds = [], admin = false } = {}) {
  if (!Array.isArray(furniture) || furniture.length > 16) fail(400, '家具最多放置 16 件。');
  const counts = {};
  const ids = new Set();
  let customCount = 0;
  const normalized = furniture.map(placed => {
    if (!placed || typeof placed.id !== 'string' || !placed.id || ids.has(placed.id.slice(0, 64))) fail(400, '家具记录无效。');
    ids.add(placed.id.slice(0, 64));
    if (!Number.isFinite(placed.x) || !Number.isFinite(placed.z) || Math.abs(placed.x) > 1.7 || Math.abs(placed.z) > 1.65 || !Number.isFinite(placed.rotation)) {
      fail(400, '家具必须摆在工位范围内。');
    }
    const rotation = ((placed.rotation % 360) + 360) % 360;
    let halfWidth;
    let halfDepth;
    if (isModelItem(placed.itemId)) {
      const asset = assets.find(candidate => candidate.id === modelAssetId(placed.itemId));
      if (!asset) fail(400, '模型不存在或已被删除。');
      if (asset.visibility === 'private' && asset.ownerId !== userId) fail(403, '不能摆放其他用户的私有模型。');
      if (!canUseModel(asset, { id: userId, unlockedModelIds, role: admin?'admin':'user' })) fail(403, '请先完成对应任务，解锁这个模型。');
      const size = effectiveSize(asset);
      if (Math.max(size.width, size.height, size.depth) > 3.4) fail(400, '这个模型对于工位来说太大了，请缩小后重试。');
      customCount += 1;
      if (customCount > 8) fail(400, '每个工位最多放置 8 个 3D 模型。');
      halfWidth = size.width / 2;
      halfDepth = size.depth / 2;
    } else {
      const definition = ITEMS.find(candidate => candidate.id === placed.itemId);
      if (!definition) fail(400, '家具记录无效。');
      counts[definition.id] = (counts[definition.id] || 0) + 1;
      if (counts[definition.id] > (inventory[definition.id] || 0)) fail(400, '摆放的家具数量超过背包持有数量。');
      if (definition.surface === 'floor') {
        halfWidth = definition.id === 'desk' ? 0.82 : definition.radius;
        halfDepth = definition.id === 'desk' ? 0.4 : definition.radius;
      }
    }
    if (halfWidth !== undefined) {
      const angle = isModelItem(placed.itemId) || placed.itemId === 'desk' ? rotation * Math.PI / 180 : 0;
      const extentX = Math.abs(Math.cos(angle)) * halfWidth + Math.abs(Math.sin(angle)) * halfDepth;
      const extentZ = Math.abs(Math.sin(angle)) * halfWidth + Math.abs(Math.cos(angle)) * halfDepth;
      if (Math.abs(placed.x) + extentX > 1.7 + 1e-9 || Math.abs(placed.z) + extentZ > 1.65 + 1e-9) fail(400, '物品超出工位边界，请向内移动一点。');
    }
    return { id: placed.id.slice(0, 64), itemId: placed.itemId, x: placed.x, z: placed.z, rotation };
  });
  const desk = normalized.find(placed => placed.itemId === 'desk');
  for (const placed of normalized) {
    const definition = ITEMS.find(candidate => candidate.id === placed.itemId);
    if (definition?.surface !== 'desk') continue;
    if (!desk) fail(400, '桌面物品需要先放置书桌。');
    const radians = -desk.rotation * Math.PI / 180;
    const deltaX = placed.x - desk.x;
    const deltaZ = placed.z - desk.z;
    if (Math.abs(deltaX * Math.cos(radians) + deltaZ * Math.sin(radians)) > 0.78 || Math.abs(-deltaX * Math.sin(radians) + deltaZ * Math.cos(radians)) > 0.48) fail(400, '请把桌面物品摆到书桌上。');
  }
  return normalized;
}

export function layoutError(furniture, options) {
  try {
    validateFurniture(furniture, options);
    return '';
  } catch (error) {
    return error.message;
  }
}

export class FurnitureHistory {
  constructor() { this.past = []; this.future = []; }
  remember(furniture) {
    const snapshot = structuredClone(furniture);
    if (JSON.stringify(snapshot) === JSON.stringify(this.past.at(-1))) return;
    this.past.push(snapshot);
    if (this.past.length > 50) this.past.shift();
    this.future = [];
  }
  undo(furniture) {
    if (!this.past.length) return furniture;
    this.future.push(structuredClone(furniture));
    return this.past.pop();
  }
  redo(furniture) {
    if (!this.future.length) return furniture;
    this.past.push(structuredClone(furniture));
    return this.future.pop();
  }
}

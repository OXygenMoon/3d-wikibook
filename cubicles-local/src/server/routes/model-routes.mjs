import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { clean, fail, readJson, sendJson } from '../http.mjs';
import { getState, saveState, bumpRevision } from '../store.mjs';
import { requireUser } from '../auth.mjs';
import { config } from '../config.mjs';
import { uploadModel } from '../resources.mjs';
import { writeAudit } from '../audit.mjs';
import { MODEL_ITEM_PREFIX, effectiveFootprint, canUseModel } from '../../model-meta.js';
import { validateFurniture } from '../../layout-validation.js';

function withUsage(asset) {
  const state = getState();
  return { ...asset, usage: {
    offices: Object.values(state.officeStyles).filter(style => style.furniture?.some(placed => placed.itemId === `${MODEL_ITEM_PREFIX}${asset.id}`)).length,
    world: state.buildings.filter(building => building.assetId === asset.id).length,
  } };
}

function visibleAssets(user) {
  const state = getState();
  if (user.role === 'admin') return state.modelAssets;
  return state.modelAssets.filter(asset => canUseModel(asset, user));
}

function assetInUse(id) {
  const state = getState();
  if (state.buildings.some(building => building.assetId === id)) return '世界布局';
  if (state.classTasks.some(task => task.reward?.modelIds?.includes(id))) return '班级任务奖励';
  for (const style of Object.values(state.officeStyles)) {
    if ((style.furniture || []).some(item => item.itemId === `${MODEL_ITEM_PREFIX}${id}`)) return '工位布置';
  }
  return null;
}

export async function handleModelRoutes(req, res, url, session) {
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/models')) return false;
  const user = requireUser(session);

  if (pathname === '/api/models' && req.method === 'GET') {
    sendJson(res, 200, { assets: visibleAssets(user).map(withUsage) });
    return true;
  }

  if (pathname === '/api/models' && req.method === 'POST') {
    const asset = await uploadModel(req, url, session, { admin: false });
    sendJson(res, 201, { asset });
    return true;
  }

  if (/^\/api\/models\/[a-f0-9-]{36}$/.test(pathname) && req.method === 'DELETE') {
    const id = pathname.split('/').pop();
    const state = getState();
    const asset = state.modelAssets.find(item => item.id === id);
    if (!asset) fail(404, '模型不存在。');
    if (user.role !== 'admin' && asset.ownerId !== user.id) fail(403, '只能删除自己的模型。');
    const used = assetInUse(id);
    if (used) fail(409, `模型正在被${used}使用，请先移除。`);
    state.modelAssets = state.modelAssets.filter(item => item.id !== id);
    bumpRevision();
    await saveState();
    await unlink(path.join(config.modelsDir, `${id}.glb`)).catch(() => {});
    await writeAudit({ actorId: user.id, action: 'model.delete', target: id, detail: { name: asset.name } });
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (/^\/api\/models\/[a-f0-9-]{36}$/.test(pathname) && req.method === 'PATCH') {
    const data = await readJson(req);
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, '模型修改格式无效。');
    const state = getState();
    const asset = state.modelAssets.find(candidate => candidate.id === pathname.split('/').pop());
    if (!asset) fail(404, '模型不存在。');
    if (user.role !== 'admin' && asset.ownerId !== user.id) fail(403, '只能修改自己的模型。');
    const next = { ...asset };
    if ('access' in data) {
      if (user.role !== 'admin' || asset.visibility !== 'shared') fail(403, '只有管理员可以设置共享模型的解锁范围。');
      if (!['all', 'reward'].includes(data.access)) fail(400, '模型解锁范围无效。');
      if (asset.access === 'reward' && data.access === 'all' && state.classTasks.some(task => task.reward?.modelIds?.includes(asset.id))) fail(409, '模型已作为任务奖励，不能取消任务解锁范围。');
      next.access = data.access;
    }
    if ('name' in data) {
      next.name = clean(data.name, 40);
      if (!next.name) fail(400, '请填写模型名称。');
    }
    if ('description' in data) next.description = clean(data.description, 160);
    if ('thumbnail' in data) {
      if (typeof data.thumbnail !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data.thumbnail)) fail(400, '模型缩略图必须是 PNG 图片。');
      const bytes = Buffer.from(data.thumbnail.split(',')[1], 'base64');
      if (bytes.length < 24 || bytes.length > 100 * 1024 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) < 1 || bytes.readUInt32BE(16) > 512 || bytes.readUInt32BE(20) < 1 || bytes.readUInt32BE(20) > 512) fail(400, '模型缩略图无效或超过 100 KiB / 512 像素。');
      next.thumbnail = data.thumbnail;
    }
    if ('scale' in data || 'access' in data) {
      if (!('scale' in data)) data.scale = asset.scale;
      next.scale = Number(data.scale);
      const max = asset.visibility === 'private' ? 3.5 : 32;
      if (!Number.isFinite(next.scale) || next.scale < 0.1 || next.scale > max) fail(400, `缩放倍率需要在 0.1–${max} 之间。`);
      const assets = state.modelAssets.map(candidate => candidate.id === asset.id ? next : candidate);
      for (const [officeId, style] of Object.entries(state.officeStyles)) {
        if (!style.furniture?.some(placed => placed.itemId === `${MODEL_ITEM_PREFIX}${asset.id}`)) continue;
        const owner = state.users.find(candidate => candidate.officeId === Number(officeId));
        try {
          validateFurniture(style.furniture, { assets, inventory: owner?.inventory, userId: owner?.id, unlockedModelIds: owner?.unlockedModelIds, admin: owner?.role === 'admin' });
        } catch (error) {
          fail(409, `缩放后不适合已有工位布置：${error.message}`);
        }
      }
      const size = effectiveFootprint(next);
      const buildings = state.buildings.filter(building => building.assetId === asset.id);
      if (buildings.some(building => building.width < size.width || building.depth < size.depth)) fail(409, '缩放后超出已有世界建筑占地，请先增大占地。');
      if (buildings.length && next.scale !== asset.scale) state.layoutRevision += 1;
    }
    Object.assign(asset, next);
    bumpRevision();
    await saveState();
    await writeAudit({ actorId: user.id, action: 'model.update', target: asset.id });
    sendJson(res, 200, { asset: withUsage(asset) });
    return true;
  }

  return false;
}


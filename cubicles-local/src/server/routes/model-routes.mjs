import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { fail, sendJson } from '../http.mjs';
import { getState, saveState, bumpRevision } from '../store.mjs';
import { requireUser } from '../auth.mjs';
import { config } from '../config.mjs';
import { uploadModel } from '../resources.mjs';
import { writeAudit } from '../audit.mjs';
import { MODEL_ITEM_PREFIX } from '../../model-meta.js';

function visibleAssets(user) {
  const state = getState();
  if (user.role === 'admin') return state.modelAssets;
  return state.modelAssets.filter(asset => asset.visibility === 'shared' || asset.ownerId === user.id);
}

function assetInUse(id) {
  const state = getState();
  if (state.buildings.some(building => building.assetId === id)) return '世界布局';
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
    sendJson(res, 200, { assets: visibleAssets(user) });
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

  return false;
}


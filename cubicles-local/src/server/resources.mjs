import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateGLB } from '../../lib/validate-glb.mjs';
import { config } from './config.mjs';
import { clean, fail, readBody } from './http.mjs';
import { getState, saveState, bumpRevision } from './store.mjs';
import { requireAdmin, requireUser, getSession } from './auth.mjs';
import { writeAudit } from './audit.mjs';

export async function uploadModel(req, url, session, { admin = false } = {}) {
  const user = admin ? requireAdmin(session) : requireUser(session);
  let buffer;
  try {
    buffer = await readBody(req, config.modelLimit);
  } catch (error) {
    if (error.status === 413) fail(413, '模型文件不能超过 20 MiB。');
    throw error;
  }
  const stats = validateGLB(buffer);
  const filename = clean(url.searchParams.get('filename'), 128);
  if (!filename.toLowerCase().endsWith('.glb')) fail(400, '请导出并上传 .glb 文件。');
  if (!admin && stats.bytes > 5 * 1024 * 1024) fail(413, '个人模型文件不能超过 5 MiB。');
  if (!admin && stats.triangleCount > 80_000) fail(413, '个人模型不能超过 8 万个三角形。');
  const state = getState();
  const owned = admin ? 0 : state.modelAssets.filter(asset => asset.ownerId === user.id).length;
  if (!admin && owned >= 20) fail(400, '每位用户最多保存 20 个 3D 模型。');
  if (state.modelAssets.length >= (admin ? 300 : 200)) fail(400, '本地模型库已满，请先删除不再使用的模型。');
  const rawScale = url.searchParams.get('scale');
  const scale = rawScale === null || rawScale === '' ? (admin ? 4 : 1) : Number(rawScale);
  const maxScale = admin ? 32 : 3.5;
  if (!Number.isFinite(scale) || scale < 0.1 || scale > maxScale) {
    fail(400, `缩放倍率需要在 0.1–${maxScale} 之间。`);
  }
  const native = stats.bounds && Math.max(stats.bounds.width, stats.bounds.height, stats.bounds.depth) > 0
    ? { width: stats.bounds.width, height: stats.bounds.height, depth: stats.bounds.depth }
    : {
        width: Math.max(0.01, Math.min(1000, Number(url.searchParams.get('width')) || 1)),
        height: Math.max(0.01, Math.min(1000, Number(url.searchParams.get('height')) || 1)),
        depth: Math.max(0.01, Math.min(1000, Number(url.searchParams.get('depth')) || 1)),
      };
  const id = randomUUID();
  const asset = {
    id,
    name: clean(url.searchParams.get('name'), 40) || filename.replace(/\.glb$/i, ''),
    description: clean(url.searchParams.get('description'), 160),
    filename,
    url: `/uploads/${id}.glb`,
    ...stats,
    ...native,
    scale,
    ownerId: user.id,
    visibility: admin ? 'shared' : 'private',
    createdAt: Date.now(),
  };
  await writeFile(path.join(config.modelsDir, `${id}.glb`), buffer, { flag: 'wx', mode: 0o600 });
  state.modelAssets.push(asset);
  bumpRevision();
  await saveState();
  await writeAudit({ actorId: user.id, action: admin ? 'model.upload.shared' : 'model.upload.private', target: id, detail: { name: asset.name, bytes: asset.bytes, scale } });
  return asset;
}

export async function serveUpload(req, res, pathname) {
  if (config.requireLogin) requireUser(getSession(req));
  if (!/^\/uploads\/[a-f0-9-]{36}\.glb$/.test(pathname)) fail(404, '模型不存在。');
  const id = pathname.split('/').pop().slice(0, -4);
  const asset = getState().modelAssets.find(item => item.id === id);
  if (!asset) fail(404, '模型不存在。');
  if (asset.visibility === 'private') {
    const session = getSession(req);
    const user = session?.userId ? getState().users.find(item => item.id === session.userId) : null;
    if (asset.ownerId !== user?.id && user?.role !== 'admin') fail(403, '该模型仅所有者可见。');
  }
  res.writeHead(200, {
    'Content-Type': 'model/gltf-binary',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': config.requireLogin || asset.visibility === 'private' ? 'private, no-store' : 'public,max-age=31536000,immutable',
  });
  res.end(await readFile(path.join(config.modelsDir, `${id}.glb`)));
}

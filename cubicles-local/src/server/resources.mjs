import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateGLB } from '../../lib/validate-glb.mjs';
import { config } from './config.mjs';
import { clean, fail, readBody } from './http.mjs';
import { getState, saveState, bumpRevision } from './store.mjs';
import { requireAdmin } from './auth.mjs';
import { writeAudit } from './audit.mjs';

export async function uploadModel(req, url, session) {
  const admin = requireAdmin(session);
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
  const state = getState();
  if (state.modelAssets.length >= 100) fail(400, '本地模型库最多保存 100 个资源。');
  const id = randomUUID();
  const asset = {
    id,
    name: clean(url.searchParams.get('name'), 40) || filename.replace(/\.glb$/i, ''),
    filename,
    url: `/uploads/${id}.glb`,
    ...stats,
    createdAt: Date.now(),
  };
  await writeFile(path.join(config.modelsDir, `${id}.glb`), buffer, { flag: 'wx', mode: 0o600 });
  state.modelAssets.push(asset);
  bumpRevision();
  await saveState();
  await writeAudit({ actorId: admin.id, action: 'model.upload', target: id, detail: { name: asset.name, bytes: asset.bytes } });
  return asset;
}

export async function serveUpload(res, pathname) {
  if (!/^\/uploads\/[a-f0-9-]{36}\.glb$/.test(pathname)) fail(404, '模型不存在。');
  const id = pathname.split('/').pop().slice(0, -4);
  if (!getState().modelAssets.some(asset => asset.id === id)) fail(404, '模型不存在。');
  res.writeHead(200, {
    'Content-Type': 'model/gltf-binary',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public,max-age=31536000,immutable',
  });
  res.end(await readFile(path.join(config.modelsDir, `${id}.glb`)));
}

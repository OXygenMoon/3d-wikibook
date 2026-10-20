import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config } from './src/server/config.mjs';
import { logger } from './src/server/logger.mjs';
import { captureError, monitoringStatus } from './src/server/monitoring.mjs';
import { getDriver, healthCheck } from './src/server/db.mjs';
import { getState, getRevision } from './src/server/store.mjs';
import { initApp, shutdownApp } from './src/server/runtime.mjs';
import { handleApi } from './src/server/api.mjs';
import { getSession, requireUser } from './src/server/auth.mjs';
import { sessionPersistenceStats } from './src/server/session-store.mjs';
import { serveUpload } from './src/server/resources.mjs';
import {
  fail,
  insideRoot,
  mimeFor,
  securityHeaders,
  sendJson,
} from './src/server/http.mjs';

await initApp();

function healthPayload() {
  return {
    ok: true,
    service: 'cubicles',
    driver: getDriver(),
    uptime: Number(process.uptime().toFixed(1)),
    monitoring: monitoringStatus(),
    sessionPersistence: sessionPersistenceStats(),
    revision: getRevision(),
    users: getState().users.length,
    zones: getState().zones.length,
    time: new Date().toISOString(),
  };
}

async function resolveStatic(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    fail(400, '请求地址格式不正确。');
  }
  if (decoded === '/') return { file: path.join(config.staticDir, 'index.html'), root: config.staticDir };

  if (!config.production && decoded.startsWith('/vendor/three/')) {
    const root = path.join(config.root, 'node_modules/three');
    return { file: path.join(root, decoded.slice('/vendor/three/'.length)), root };
  }

  if (!config.production) {
    const publicRoot = path.join(config.root, 'public');
    const candidate = path.join(publicRoot, decoded);
    if (insideRoot(candidate, publicRoot)) {
      try {
        if ((await stat(candidate)).isFile()) return { file: candidate, root: publicRoot };
      } catch {
        // Fall through to the source tree, then the normal 404 path.
      }
    }
  }

  return { file: path.join(config.staticDir, decoded), root: config.staticDir };
}

async function serveStatic(req, res, pathname) {
  const { file, root } = await resolveStatic(pathname);
  const index = path.join(config.staticDir, 'index.html');
  const allowed = config.production
    ? [config.staticDir]
    : [path.join(config.root, 'src'), path.join(config.root, 'public'), path.join(config.root, 'node_modules/three')];
  if (file !== index && !allowed.some(candidate => insideRoot(file, candidate))) {
    fail(403, '该文件不对外开放。');
  }
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) fail(404, '没有找到内容。');
  res.writeHead(200, {
    'Content-Type': mimeFor(file),
    'Cache-Control': config.requireLogin && file.endsWith('.glb') ? 'private, no-store' : config.production && pathname !== '/' ? 'public,max-age=3600' : 'no-cache',
  });
  res.end(await readFile(file));
}

async function handleRequest(req, res) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  const started = performance.now();
  const remoteAddress = req.socket?.remoteAddress;
  let pathname = '/';
  res.setHeader('X-Request-Id', requestId);
  securityHeaders(res);
  res.on('finish', () => {
    logger.info(
      {
        requestId,
        method: req.method,
        path: pathname,
        status: res.statusCode,
        ms: Math.round(performance.now() - started),
        ip: remoteAddress,
      },
      'http request',
    );
  });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = url.pathname;

    if ((pathname === '/healthz' || pathname === '/readyz') && req.method === 'GET') {
      const healthy = await healthCheck();
      if (!healthy) {
        sendJson(res, 503, { ok: false, service: 'cubicles', database: 'down' });
        return;
      }
      sendJson(res, 200, { ...healthPayload(), database: 'up' });
      return;
    }

    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, url, getSession(req));
      return;
    }

    if (pathname.startsWith('/uploads/')) {
      await serveUpload(req, res, pathname);
      return;
    }

    if (config.requireLogin && (pathname.startsWith('/models/') || pathname.startsWith('/examples/'))) requireUser(getSession(req));

    if (req.method !== 'GET' && req.method !== 'HEAD') fail(405, '只支持读取静态资源。');
    await serveStatic(req, res, pathname);
  } catch (error) {
    const status = error.status || (error.code === 'ENOENT' ? 404 : 500);
    if (status >= 500) captureError(error, { requestId, method: req.method, path: pathname });
    if (!res.headersSent) {
      sendJson(res, status, {
        error: error.status
          ? error.message
          : error.code === 'ENOENT'
            ? '没有找到内容。'
            : '暂时无法完成操作，请稍后重试。',
        requestId,
      });
    } else {
      res.end();
    }
  }
}

export const server = http.createServer(handleRequest);

export function getCommunityState() {
  return getState();
}

export { getRevision };

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  await new Promise(resolve => server.close(resolve));
  await shutdownApp();
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(config.port, config.host, () => {
    logger.info(
      { url: `http://${config.host}:${config.port}`, driver: getDriver(), production: config.production },
      '格子社区已启动',
    );
  });
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

import { extname, sep } from 'node:path';
import { config } from './config.mjs';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function fail(status, message) {
  throw new HttpError(status, message);
}

export const clean = (value, max = 240) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
}

export function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

export async function readBody(req, limit = config.bodyLimit) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) fail(413, `请求内容过大，单次最多 ${Math.floor(limit / 1024)} KiB。`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req, limit = config.bodyLimit) {
  const text = (await readBody(req, limit)).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    fail(400, '请求格式不正确。');
  }
}

export function setSessionCookie(res, token, maxAge = Math.floor(config.sessionTtlMs / 1000)) {
  const parts = [
    `community_session=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAge}`,
  ];
  if (config.cookieSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  setSessionCookie(res, '', 0);
}

export function mimeFor(file) {
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.glb': 'model/gltf-binary',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',
      '.txt': 'text/plain; charset=utf-8',
    }[extname(file).toLowerCase()] || 'application/octet-stream'
  );
}

export function insideRoot(file, root) {
  return file === root || file.startsWith(root + sep);
}

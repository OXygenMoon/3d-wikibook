import { config } from './config.mjs';
import { fail } from './http.mjs';
import { handleAuthRoutes } from './routes/auth-routes.mjs';
import { handleWorldRoutes } from './routes/world-routes.mjs';
import { handleSocialRoutes } from './routes/social-routes.mjs';
import { handleModelRoutes } from './routes/model-routes.mjs';
import { handleLearningRoutes } from './routes/learning-routes.mjs';
import { handleAdminRoutes } from './routes/admin-routes.mjs';

function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = new Set([`http://${req.headers.host}`, `https://${req.headers.host}`]);
  if (config.publicOrigin) allowed.add(config.publicOrigin);
  if (!allowed.has(origin)) fail(403, '不允许跨站写入。');
}

export async function handleApi(req, res, url, session) {
  checkOrigin(req);
  if (await handleAuthRoutes(req, res, url, session)) return;
  if (await handleWorldRoutes(req, res, url, session)) return;
  if (!session) fail(401, '会话已过期，请重新进入社区。');
  if (await handleSocialRoutes(req, res, url, session)) return;
  if (await handleModelRoutes(req, res, url, session)) return;
  if (await handleLearningRoutes(req, res, url, session)) return;
  if (await handleAdminRoutes(req, res, url, session)) return;
  fail(404, '没有找到这个页面。');
}

import { requireAdmin } from '../auth.mjs';
import { getState, getRevision } from '../store.mjs';
import { readJson, sendJson } from '../http.mjs';
import { planWikibookRoster } from '../wikibook-preflight.mjs';

export async function handleWikibookRoutes(req, res, url, session) {
  if (url.pathname !== '/api/admin/wikibook/preflight' || req.method !== 'POST') return false;
  requireAdmin(session);
  const payload = await readJson(req);
  const result = planWikibookRoster(payload, getState());
  sendJson(res, 200, { ...result, targetRevision: getRevision() });
  return true;
}

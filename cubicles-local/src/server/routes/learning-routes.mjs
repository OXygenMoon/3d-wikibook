import { fail, readJson, sendJson } from '../http.mjs';
import { getState, saveState, bumpRevision } from '../store.mjs';
import { persistSession } from '../session-store.mjs';
import { requireUser, publicUser } from '../auth.mjs';
import { nearbyArea } from '../domain.mjs';
import { writeAudit } from '../audit.mjs';
import { config } from '../config.mjs';

const TASKS = [
  { id: 'orientation', title: '社区探索入门', description: '阅读任务卡，了解自己的班级与工位。', reward: 5 },
  { id: 'design', title: '空间设计练习', description: '尝试修改家具位置，保存一版属于自己的空间。', reward: 5 },
];

export async function handleLearningRoutes(req, res, url, session) {
  const path = url.pathname;

  if (path === '/api/rankings' && req.method === 'GET') {
    if (!session) fail(401, '会话已过期，请重新进入社区。');
    nearbyArea(session, 'hall');
    const state = getState();
    sendJson(res, 200, {
      users: state.users
        .map(user => ({
          name: user.name,
          score: user.score,
          className: state.zones.find(zone => zone.id === user.classId)?.name || '',
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 20),
    });
    return true;
  }

  if (path === '/api/pond' && req.method === 'GET') {
    if (!session) fail(401, '会话已过期，请重新进入社区。');
    nearbyArea(session, 'pond');
    sendJson(res, 200, { fishing: { url: config.wikibookFishingUrl } });
    return true;
  }

  if (path === '/api/fishing/cast' && req.method === 'POST') {
    if (!session) fail(401, '会话已过期，请重新进入社区。');
    nearbyArea(session, 'pond');
    requireUser(session);
    session.fishingAt = Date.now();
    await persistSession(session);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (path === '/api/fishing/reel' && req.method === 'POST') {
    if (!session) fail(401, '会话已过期，请重新进入社区。');
    nearbyArea(session, 'pond');
    const user = requireUser(session);
    const elapsed = Date.now() - session.fishingAt;
    delete session.fishingAt;
    if (!Number.isFinite(elapsed) || elapsed < 200) fail(400, '请先抛竿。');
    const phase = (Math.sin(elapsed / 450 - Math.PI / 2) + 1) / 2;
    const caught = phase >= 0.58 && phase <= 0.82;
    const fish = caught
      ? { name: ['太阳鱼', '河鲈', '金鲤鱼'][Math.floor(Math.random() * 3)], weight: Number((0.5 + Math.random() * 6).toFixed(1)) }
      : null;
    if (caught) {
      user.score += 10;
      user.catches = [...(user.catches || []), { ...fish, time: Date.now() }].slice(-100);
      bumpRevision();
      await saveState();
      await writeAudit({ actorId: user.id, action: 'fishing.caught', target: fish.name, detail: { weight: fish.weight } });
    }
    await persistSession(session);
    sendJson(res, 200, { caught, fish, user: publicUser(user) });
    return true;
  }

  if (path === '/api/lab' && req.method === 'GET') {
    if (!session) fail(401, '会话已过期，请重新进入社区。');
    nearbyArea(session, 'lab');
    sendJson(res, 200, { tasks: TASKS, oj: { url: config.wikibookOjUrl } });
    return true;
  }

  if (path === '/api/lab/complete' && req.method === 'POST') {
    if (!session) fail(401, '会话已过期，请重新进入社区。');
    nearbyArea(session, 'lab');
    const user = requireUser(session);
    const data = await readJson(req);
    if (!['orientation', 'design'].includes(data.taskId)) fail(400, '任务不存在。');
    const state = getState();
    if (data.taskId === 'design' && !state.officeStyles[user.officeId]?.furniture) {
      fail(400, '请先到自己的工位保存一次家具布置。');
    }
    user.completedTasks ||= [];
    if (!user.completedTasks.includes(data.taskId)) {
      user.completedTasks.push(data.taskId);
      user.score += 5;
      bumpRevision();
      await saveState();
      await writeAudit({ actorId: user.id, action: 'lab.complete', target: data.taskId, detail: { reward: 5 } });
    }
    sendJson(res, 200, { user: publicUser(user) });
    return true;
  }

  return false;
}

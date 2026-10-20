import { randomUUID } from 'node:crypto';
import { getState, saveState, bumpRevision } from '../store.mjs';
import { clean, fail, readJson, sendJson } from '../http.mjs';
import { requireUser, requireAdmin, publicUser } from '../auth.mjs';
import { managedClassIds, visibleClassIds, requireClassManager } from '../roles.mjs';
import { importMembers } from '../members.mjs';
import { offices } from '../domain.mjs';
import { writeAudit } from '../audit.mjs';
import { validateReward, grantTaskReward } from '../rewards.mjs';
import { ITEMS } from '../../community.js';

async function persist(user, action, target) {
  bumpRevision();
  await saveState();
  await writeAudit({ actorId: user.id, action, target });
}

export async function handleClassroomRoutes(req, res, url, session) {
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/classroom') && !/^\/api\/admin\/users\/[^/]+\/role$/.test(pathname)) return false;
  const user = requireUser(session);
  const state = getState();
  if (pathname === '/api/classroom' && req.method === 'GET') {
    const managed = managedClassIds(user);
    const visible = visibleClassIds(user);
    sendJson(res, 200, {
      classes: state.zones.filter(zone => visible.includes(zone.id)), managedClassIds: managed,
      members: state.users.filter(member => managed.includes(member.classId)).map(member => ({ id: member.id, username: member.username, name: member.name, classId: member.classId, officeId: member.officeId, role: member.role })),
      offices: offices().filter(office => managed.includes(office.zoneId)).map(office => ({ id: office.id, zoneId: office.zoneId, ownerId: office.ownerId })),
      announcements: state.classAnnouncements.filter(announcement => visible.includes(announcement.classId)),
      tasks: state.classTasks.filter(task => visible.includes(task.classId)),
      submissions: state.classSubmissions.filter(submission => managed.includes(submission.classId) || submission.userId === user.id),
      rewardCatalog: { items: ITEMS.map(item=>({id:item.id,name:item.name})), models: state.modelAssets.filter(asset=>asset.visibility==='shared'&&asset.access==='reward').map(asset=>({id:asset.id,name:asset.name})) },
      records: state.rewardGrants.filter(grant=>grant.userId===user.id).map(grant=>({...grant,title:state.classTasks.find(task=>task.id===grant.taskId)?.title||'已完成任务'})),
      leaderboard: state.users.filter(member=>member.role==='user'&&visible.includes(member.classId)).map(member=>({userId:member.id,name:member.name,classId:member.classId,score:member.score,completed:state.classSubmissions.filter(submission=>submission.userId===member.id&&submission.status==='approved'&&submission.classId===member.classId).length})).sort((first,second)=>second.score-first.score),
      works: state.classSubmissions.filter(submission=>submission.status==='approved'&&submission.publish&&visible.includes(submission.classId)).map(submission=>({id:submission.id,classId:submission.classId,name:submission.userName,text:submission.text,link:submission.link,title:state.classTasks.find(task=>task.id===submission.taskId)?.title||'班级作品'})),
    });
    return true;
  }
  if (/^\/api\/admin\/users\/[^/]+\/role$/.test(pathname) && req.method === 'PATCH') {
    requireAdmin(session);
    const data = await readJson(req);
    const target = state.users.find(member => member.id === pathname.split('/')[4]);
    if (!target) fail(404, '账号不存在。');
    if (!['admin', 'teacher', 'user'].includes(data.role)) fail(400, '角色无效。');
    if (target.role === 'admin' && data.role !== 'admin' && state.users.filter(member => member.role === 'admin').length === 1) fail(409, '必须保留至少一个管理员。');
    const teachingClassIds = data.role === 'teacher' ? data.teachingClassIds : [];
    if (!Array.isArray(teachingClassIds) || (data.role === 'teacher' && !teachingClassIds.length) || teachingClassIds.some(id => !Number.isInteger(id) || !state.zones.some(zone => zone.id === id))) fail(400, '请为教师选择有效的负责班级。');
    target.role = data.role;
    target.teachingClassIds = [...new Set(teachingClassIds)];
    await persist(user, 'user.role', target.id);
    sendJson(res, 200, { user: publicUser(target) });
    return true;
  }
  const classMatch = pathname.match(/^\/api\/classroom\/classes\/(\d+)\/(announcements|tasks|members|assign)$/);
  if (classMatch && req.method === 'POST') {
    const classId = Number(classMatch[1]);
    const data = await readJson(req);
    const zone = requireClassManager(user, classId);
    if (classMatch[2] === 'members') {
      const members = await importMembers(data.users, candidate => {
        if (!candidate || candidate.id !== classId) fail(403, '名单只能包含当前班级。');
        requireClassManager(user, candidate.id);
      });
      await persist(user, 'class.members.import', String(classId));
      sendJson(res, 201, { created: members.length });
    } else if (classMatch[2] === 'assign') {
      const member = state.users.find(candidate => candidate.id === data.userId);
      const office = offices().find(candidate => candidate.id === Number(data.officeId));
      if (!member || !office) fail(404, '用户或工位不存在。');
      requireClassManager(user, member.classId);
      if (office.zoneId !== classId || (user.role !== 'admin' && member.role !== 'user')) fail(403, '只能分配本班学生的工位。');
      if (office.ownerId && office.ownerId !== member.id) fail(409, '该工位已有主人。');
      if (member.officeId !== office.id) {
        const style = state.officeStyles[member.officeId];
        if (style) { state.officeStyles[office.id] = style; delete state.officeStyles[member.officeId]; }
        member.officeId = office.id;
        member.classId = classId;
      }
      await persist(user, 'class.member.assign', member.id);
      sendJson(res, 200, { ok: true });
    } else if (classMatch[2] === 'announcements') {
      const text = clean(data.text, 500);
      if (!text) fail(400, '请填写公告内容。');
      const announcement = { id: randomUUID(), classId, text, authorId: user.id, authorName: user.name, createdAt: Date.now() };
      const old = state.classAnnouncements.filter(candidate => candidate.classId === classId);
      if (old.length >= 30) state.classAnnouncements = state.classAnnouncements.filter(candidate => candidate.id !== old[0].id);
      state.classAnnouncements.push(announcement);
      await persist(user, 'class.announcement', announcement.id);
      sendJson(res, 201, { announcement });
    } else {
      const title = clean(data.title, 80);
      const description = clean(data.description, 1000);
      if (!title || !description) fail(400, '请填写任务名称和要求。');
      const dueAt = data.dueAt ? Number(data.dueAt) : null;
      if (dueAt !== null && (!Number.isFinite(dueAt) || dueAt <= Date.now())) fail(400, '截止时间必须晚于当前时间。');
      const reward = validateReward(data.reward);
      const task = { id: randomUUID(), classId: zone.id, title, description, dueAt, reward, status: 'open', authorId: user.id, createdAt: Date.now() };
      state.classTasks.push(task);
      await persist(user, 'class.task.create', task.id);
      sendJson(res, 201, { task });
    }
    return true;
  }
  const taskMatch = pathname.match(/^\/api\/classroom\/tasks\/([a-f0-9-]{36})(\/submission)?$/);
  if (taskMatch) {
    const task = state.classTasks.find(candidate => candidate.id === taskMatch[1]);
    if (!task) fail(404, '任务不存在。');
    const data = await readJson(req);
    if (taskMatch[2] && req.method === 'PUT') {
      if (user.classId !== task.classId) fail(403, '只能提交自己班级的任务。');
      if (task.status !== 'open' || (task.dueAt && Date.now() > task.dueAt)) fail(409, '任务已关闭或超过截止时间。');
      const text = clean(data.text, 2000);
      const link = clean(data.link, 1000);
      if (!text && !link) fail(400, '请填写提交内容或作品链接。');
      if (link) {
        let parsed;
        try { parsed = new URL(link); } catch { fail(400, '作品链接格式不正确。'); }
        if (!['http:', 'https:'].includes(parsed.protocol)) fail(400, '作品链接仅支持 HTTP 或 HTTPS。');
      }
      let submission = state.classSubmissions.find(candidate => candidate.taskId === task.id && candidate.userId === user.id);
      if (submission?.status === 'approved') fail(409, '任务已确认完成，不能重新提交。');
      if (!submission) {
        submission = { id: randomUUID(), taskId: task.id, classId: task.classId, userId: user.id, userName: user.name, revision: 0 };
        state.classSubmissions.push(submission);
      }
      Object.assign(submission, { text, link, publish: data.publish === true, status: 'pending', feedback: '', revision: submission.revision + 1, submittedAt: Date.now() });
      await persist(user, 'class.task.submit', submission.id);
      sendJson(res, 200, { submission });
      return true;
    }
    if (!taskMatch[2] && req.method === 'PATCH') {
      requireClassManager(user, task.classId);
      if (!['open', 'closed'].includes(data.status)) fail(400, '任务状态无效。');
      task.status = data.status;
      await persist(user, 'class.task.status', task.id);
      sendJson(res, 200, { task });
      return true;
    }
  }
  const reviewMatch = pathname.match(/^\/api\/classroom\/submissions\/([a-f0-9-]{36})\/review$/);
  if (reviewMatch && req.method === 'POST') {
    const data = await readJson(req);
    const submission = state.classSubmissions.find(candidate => candidate.id === reviewMatch[1]);
    if (!submission) fail(404, '提交记录不存在。');
    requireClassManager(user, submission.classId);
    if (!['approved', 'revision'].includes(data.status)) fail(400, '请选择确认完成或退回修改。');
    if (submission.revision !== data.baseRevision) fail(409, '学生已更新提交内容，请刷新后再确认。');
    if (submission.status === 'approved' && data.status !== 'approved') fail(409, '已完成的任务不能退回。');
    if (submission.status !== 'approved') {
      if (data.status === 'approved') {
        const task = state.classTasks.find(candidate=>candidate.id===submission.taskId);
        if (!task) fail(409, '任务不存在，无法发放奖励。');
        grantTaskReward(task, submission, user);
      }
      Object.assign(submission, { status: data.status, feedback: clean(data.feedback, 500), reviewerId: user.id, reviewedAt: Date.now() });
      await persist(user, 'class.task.review', submission.id);
    }
    sendJson(res, 200, { submission });
    return true;
  }
  return false;
}

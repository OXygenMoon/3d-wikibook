import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';

const directory = await mkdtemp(path.join(tmpdir(), 'cubicles-classroom-'));
Object.assign(process.env, { CUBICLES_DATA_DIR: directory, PGLITE_DIR: path.join(directory, 'pglite'), DATABASE_URL: process.env.CLASSROOM_TEST_DATABASE_URL || '', AUTO_IMPORT: 'false', LOG_LEVEL: 'silent', NODE_ENV: 'test', CUBICLES_DB_RESET: '0' });
const { server } = await import('../server.mjs');
const { initApp, shutdownApp } = await import('../src/server/runtime.mjs');
const { getDb } = await import('../src/server/db.mjs');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(async () => { await new Promise(resolve => server.close(resolve)); await shutdownApp(); await rm(directory, { recursive: true, force: true }); });
async function call(url, token, data, method = data ? 'POST' : 'GET') {
  const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Session-Token': token } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  return { status: response.status, data: await response.json() };
}
async function login(username) { return (await call('/api/login', null, { username, password: '123456' })).data; }
let admin, teacher, otherTeacher, student, otherStudent, task, submission;

test('admin grants teacher roles while students cannot escalate or manage another class', async () => {
  admin = await login('lzy');
  const zone = await call('/api/admin/zones', admin.token, { name: '第二班', x: 100, z: -5, rows: 2, columns: 3, spacing: 7, color: '#abc123' });
  assert.equal(zone.status, 201);
  const imported = await call('/api/admin/import', admin.token, { users: [
    { username: 'teacher', password: '123456', classId: 1, name: '一班老师' },
    { username: 'otherteacher', password: '123456', classId: 2, name: '二班老师' },
    { username: 'student', password: '123456', classId: 1, name: '一班学生' },
    { username: 'otherstudent', password: '123456', classId: 2, name: '二班学生' },
  ] });
  assert.equal(imported.status, 201);
  teacher = await login('teacher'); otherTeacher = await login('otherteacher'); student = await login('student'); otherStudent = await login('otherstudent');
  const grant = (account, classId) => call(`/api/admin/users/${account.user.id}/role`, admin.token, { role: 'teacher', teachingClassIds: [classId] }, 'PATCH');
  assert.equal((await grant(teacher, 1)).status, 200);
  assert.equal((await grant(otherTeacher, 2)).status, 200);
  assert.equal((await call(`/api/admin/users/${student.user.id}/role`, student.token, { role: 'admin' }, 'PATCH')).status, 403);
  assert.equal((await call(`/api/admin/users/${admin.user.id}/role`, admin.token, { role: 'user' }, 'PATCH')).status, 409);
  assert.equal((await call('/api/classroom/classes/2/announcements', teacher.token, { text: '跨班操作' })).status, 403);
  assert.equal((await call('/api/classroom/classes/1/tasks', student.token, { title: '伪造任务', description: '禁止' })).status, 403);
  const classroom = (await call('/api/classroom', teacher.token)).data;
  assert.ok(classroom.members.every(member => member.classId === 1));
  assert.ok(classroom.members.every(member => !('passwordHash' in member)));
});

test('teachers publish announcements, import only their class, and assign only unoccupied in-class offices', async () => {
  assert.equal((await call('/api/classroom/classes/1/announcements', teacher.token, { text: '欢迎来到一班课堂' })).status, 201);
  assert.equal((await call('/api/classroom/classes/1/members', teacher.token, { users: [{ username: 'newstudent', name: '新同学', password: '123456', classId: 1 }] })).status, 201);
  assert.equal((await call('/api/classroom/classes/1/members', teacher.token, { users: [{ username: 'intruder', password: '123456', classId: 2 }] })).status, 403);
  const classroom = (await call('/api/classroom', teacher.token)).data;
  const empty = classroom.offices.find(office => !office.ownerId);
  assert.equal((await call('/api/classroom/classes/1/assign', teacher.token, { userId: student.user.id, officeId: empty.id })).status, 200);
  assert.equal((await call('/api/classroom/classes/1/assign', teacher.token, { userId: otherStudent.user.id, officeId: empty.id })).status, 403);
  assert.equal((await call('/api/classroom/classes/1/assign', teacher.token, { userId: student.user.id, officeId: admin.user.officeId })).status, 409);
  assert.equal((await call('/api/classroom', otherStudent.token)).data.announcements.length, 0);
});

test('class tasks enforce submission ownership, safe links, deadlines, review revisions and idempotent approval', async () => {
  assert.equal((await call('/api/classroom/classes/1/tasks', teacher.token, { title: '过期任务', description: '不能创建', dueAt: Date.now() - 1000 })).status, 400);
  const created = await call('/api/classroom/classes/1/tasks', teacher.token, { title: '设计我的工位', description: '提交设计说明和作品链接' });
  assert.equal(created.status, 201); task = created.data.task;
  assert.equal((await call(`/api/classroom/tasks/${task.id}/submission`, otherStudent.token, { text: '跨班' }, 'PUT')).status, 403);
  assert.equal((await call(`/api/classroom/tasks/${task.id}/submission`, student.token, { link: 'javascript:alert(1)' }, 'PUT')).status, 400);
  const first = await call(`/api/classroom/tasks/${task.id}/submission`, student.token, { text: '我的设计', link: 'https://example.com/work', status: 'approved' }, 'PUT');
  assert.equal(first.status, 200); assert.equal(first.data.submission.status, 'pending');
  submission = first.data.submission;
  assert.equal((await call(`/api/classroom/submissions/${submission.id}/review`, student.token, { baseRevision: 1, status: 'approved' })).status, 403);
  assert.equal((await call(`/api/classroom/submissions/${submission.id}/review`, otherTeacher.token, { baseRevision: 1, status: 'approved' })).status, 403);
  const second = await call(`/api/classroom/tasks/${task.id}/submission`, student.token, { text: '更新后的设计' }, 'PUT');
  assert.equal(second.data.submission.id, submission.id);
  assert.equal(second.data.submission.revision, 2);
  assert.equal((await call(`/api/classroom/submissions/${submission.id}/review`, teacher.token, { baseRevision: 1, status: 'approved' })).status, 409);
  const review = { baseRevision: 2, status: 'revision', feedback: '补充设计思路' };
  assert.equal((await call(`/api/classroom/submissions/${submission.id}/review`, teacher.token, review)).status, 200);
  const revised = await call(`/api/classroom/tasks/${task.id}/submission`, student.token, { text: '完整设计思路' }, 'PUT');
  assert.equal(revised.data.submission.revision, 3);
  const approval = { baseRevision: 3, status: 'approved', feedback: '完成' };
  const responses = await Promise.all([call(`/api/classroom/submissions/${submission.id}/review`, teacher.token, approval), call(`/api/classroom/submissions/${submission.id}/review`, teacher.token, approval)]);
  assert.ok(responses.every(response => response.status === 200));
  assert.equal((await call(`/api/classroom/tasks/${task.id}/submission`, student.token, { text: '覆盖已完成任务' }, 'PUT')).status, 409);
  assert.equal((await call(`/api/classroom/tasks/${task.id}`, student.token, { status: 'closed' }, 'PATCH')).status, 403);
  assert.equal((await call(`/api/classroom/tasks/${task.id}`, teacher.token, { status: 'closed' }, 'PATCH')).status, 200);
  const newcomer = await login('newstudent');
  const closed = await call(`/api/classroom/tasks/${task.id}/submission`, newcomer.token, { text: '已关闭的任务' }, 'PUT');
  assert.equal(closed.status, 409); assert.match(closed.data.error, /任务已关闭/);
  assert.ok(!(await call('/api/classroom', otherStudent.token)).data.tasks.some(candidate => candidate.id === task.id));
});

test('class tasks, submissions and teacher permissions persist through restart', async () => {
  await shutdownApp();
  await initApp({ monitoring: false });
  const classroom = await call('/api/classroom', teacher.token);
  assert.equal(classroom.status, 200);
  assert.deepEqual(classroom.data.managedClassIds, [1]);
  assert.equal(classroom.data.submissions.find(candidate => candidate.id === submission.id).status, 'approved');
  assert.equal(classroom.data.tasks.find(candidate => candidate.id === task.id).status, 'closed');
});

test('teacher-approved rewards unlock furniture and models exactly once and respect publication consent', async () => {
  const bytes = await readFile(new URL('../public/examples/grid-pavilion.glb', import.meta.url));
  const upload = await fetch(`${base}/api/admin/models?filename=reward.glb&name=课堂奖励模型&scale=1.2`, { method: 'POST', headers: { 'X-Session-Token': admin.token }, body: bytes });
  assert.equal(upload.status, 201);
  const asset = (await upload.json()).asset;
  assert.equal((await call(`/api/models/${asset.id}`, admin.token, { access: 'reward' }, 'PATCH')).status, 200);
  assert.equal((await call(`/api/models/${asset.id}`, teacher.token, { access: 'all' }, 'PATCH')).status, 403);
  assert.ok(!(await call('/api/models', student.token)).data.assets.some(candidate=>candidate.id===asset.id));
  const world = (await call('/api/world')).data;
  const office = world.offices.find(candidate=>candidate.ownerId===student.user.id);
  await call('/api/tick', student.token, { x: office.x, z: office.z + 1.5 });
  const furniture = [...office.furniture,{id:'reward-placement',itemId:`model:${asset.id}`,x:0,z:.5,rotation:0}];
  assert.equal((await call(`/api/offices/${office.id}`, student.token, { furniture }, 'PATCH')).status, 403);
  assert.equal((await call('/api/classroom/classes/1/tasks', teacher.token, { title: '无效奖励', description: '禁止', reward: { score: -10 } })).status, 400);
  assert.equal((await call('/api/classroom/classes/1/tasks', teacher.token, { title: '无效模型', description: '禁止', reward: { modelIds: ['missing'] } })).status, 400);
  const created = await call('/api/classroom/classes/1/tasks', teacher.token, { title: '奖励闭环', description: '完成设计', reward: { score: 25, items: { cactus: 1 }, modelIds: [asset.id] } });
  assert.equal(created.status, 201);
  const rewarded = created.data.task;
  const before = (await call('/api/me', student.token)).data.user;
  const submitted = (await call(`/api/classroom/tasks/${rewarded.id}/submission`, student.token, { text: '我的作品', publish: true, score: 100000, reward: { score: 100000 } }, 'PUT')).data.submission;
  assert.equal((await call('/api/me', student.token)).data.user.score, before.score);
  assert.equal((await call('/api/classroom', student.token)).data.works.length, 0);
  const approval = { baseRevision: submitted.revision, status: 'approved', reward: { score: 100000 } };
  const results = await Promise.all([call(`/api/classroom/submissions/${submitted.id}/review`, teacher.token, approval),call(`/api/classroom/submissions/${submitted.id}/review`, teacher.token, approval)]);
  assert.ok(results.every(result=>result.status===200));
  const after = (await call('/api/me', student.token)).data.user;
  assert.equal(after.score, before.score + 25);
  assert.equal(after.inventory.cactus, before.inventory.cactus + 1);
  assert.ok(after.unlockedModelIds.includes(asset.id));
  const classroom = (await call('/api/classroom', student.token)).data;
  assert.equal(classroom.records.filter(record=>record.taskId===rewarded.id).length, 1);
  assert.equal(classroom.works.length, 1);
  assert.equal((await call('/api/classroom', otherStudent.token)).data.works.length, 0);
  assert.ok((await call('/api/models', student.token)).data.assets.some(candidate=>candidate.id===asset.id));
  assert.equal((await call(`/api/offices/${office.id}`, student.token, { furniture }, 'PATCH')).status, 200);
  assert.equal((await call(`/api/models/${asset.id}`, admin.token, null, 'DELETE')).status, 409);
  await shutdownApp(); await initApp({ monitoring: false });
  await call(`/api/classroom/submissions/${submitted.id}/review`, teacher.token, approval);
  assert.equal((await call('/api/me', student.token)).data.user.score, before.score + 25);
  const hidden = (await call('/api/classroom/classes/1/tasks', teacher.token, { title: '不公开的作品', description: '保留个人记录' })).data.task;
  const privateSubmission = (await call(`/api/classroom/tasks/${hidden.id}/submission`, student.token, { text: '不公开', publish: false }, 'PUT')).data.submission;
  await call(`/api/classroom/submissions/${privateSubmission.id}/review`, teacher.token, { baseRevision: 1, status: 'approved' });
  assert.equal((await call('/api/classroom', student.token)).data.works.length, 1);
});

test('failed reward persistence restores the pending submission and can be safely retried',async()=>{
 const task=(await call('/api/classroom/classes/1/tasks',teacher.token,{title:'故障恢复任务',description:'验证失败恢复',reward:{score:7}})).data.task;
 const submission=(await call(`/api/classroom/tasks/${task.id}/submission`,student.token,{text:'等待确认'},'PUT')).data.submission;
 const before=(await call('/api/me',student.token)).data.user.score;
 await getDb().execute(sql.raw("CREATE FUNCTION reject_test_reward() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated reward write failure'; END; $$"));
 await getDb().execute(sql.raw('CREATE TRIGGER reject_test_reward BEFORE INSERT ON reward_grants FOR EACH ROW EXECUTE FUNCTION reject_test_reward()'));
 const approval={status:'approved',baseRevision:submission.revision};
 try{
  assert.equal((await call(`/api/classroom/submissions/${submission.id}/review`,teacher.token,approval)).status,500);
  assert.equal((await call('/api/me',student.token)).data.user.score,before);
  assert.equal((await call('/api/classroom',student.token)).data.submissions.find(candidate=>candidate.id===submission.id).status,'pending');
 }finally{
  await getDb().execute(sql.raw('DROP TRIGGER reject_test_reward ON reward_grants'));
  await getDb().execute(sql.raw('DROP FUNCTION reject_test_reward()'));
 }
 assert.equal((await call(`/api/classroom/submissions/${submission.id}/review`,teacher.token,approval)).status,200);
 assert.equal((await call('/api/me',student.token)).data.user.score,before+7);
 assert.equal((await call('/api/classroom',student.token)).data.records.filter(record=>record.taskId===task.id).length,1);
});

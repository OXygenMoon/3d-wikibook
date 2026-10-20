import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function login(page, username = 'lzy', name = '社区管理员') {
  await page.goto('/');
  await page.locator('#profile-name').waitFor({ state: 'visible' });
  if (await page.locator('.enter-button').count()) await page.locator('.enter-button').click({ timeout: 90_000 });
  await page.locator('.account [data-action="login"]').click();
  await page.locator('#login-form input[name="username"]').fill(username);
  await page.locator('#login-form input[name="password"]').fill('123456');
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('#profile-name')).toHaveText(name);
}
async function logout(page) {
  await page.keyboard.press('Escape');
  await page.locator('.account [data-action="account"]').click();
  await page.locator('.menu-list [data-action="logout"]').click();
  await expect(page.locator('#profile-name')).toHaveText('访客');
}
async function classroom(page) {
  await page.locator('.account [data-action="account"]').click();
  await page.locator('.menu-list [data-action="classroom"]').click();
  await expect(page.locator('.classroom-dialog')).toBeVisible();
}

test('teacher approval grants rewards once and the student places the unlocked model in their workstation', async ({ page }) => {
  await login(page);
  const upload = await page.request.post('/api/admin/models?filename=class-reward.glb&name=课堂专属模型&scale=1.2', { headers: { 'Content-Type': 'model/gltf-binary' }, data: await readFile(path.resolve('public/examples/grid-pavilion.glb')) });
  expect(upload.ok()).toBe(true);
  const asset = (await upload.json()).asset;
  expect((await page.request.patch(`/api/models/${asset.id}`, { data: { access: 'reward' } })).ok()).toBe(true);
  const created = await page.request.post('/api/admin/import', { data: { users: [
    { username: 'classroomteacher', password: '123456', name: '课堂教师', classId: 1 },
    { username: 'classroomstudent', password: '123456', name: '课堂学生', classId: 1 },
  ] } });
  expect(created.ok()).toBe(true);
  const teacher = (await created.json()).users.find(user=>user.username==='classroomteacher');
  await page.locator('.account [data-action="admin"]').click();
  await page.locator('[data-admin-tab="users"]').click();
  const role = page.locator(`.role-settings[data-user-id="${teacher.id}"]`);
  await role.locator('select[name="role"]').selectOption('teacher');
  await role.locator('select[name="teachingClassIds"]').selectOption(['1']);
  await role.locator('button[type="submit"]').click();
  await expect(page.locator('.toast').filter({ hasText: '已保存。' })).toBeVisible();
  await expect(role.locator('select[name="role"]')).toHaveValue('teacher');
  await logout(page);
  await login(page, 'classroomteacher', '课堂教师');
  await classroom(page);
  const announcement = page.locator('[data-classroom-form="announcement"]');
  await announcement.locator('textarea').fill('本周一起设计学习空间');
  await announcement.locator('button').click();
  await expect(page.locator('.classroom-announcement')).toContainText('本周一起设计学习空间');
  await page.locator('.classroom-create summary').click();
  const task = page.locator('[data-classroom-form="task"]');
  await task.locator('input[name="title"]').fill('班级空间作品');
  await task.locator('textarea[name="description"]').fill('提交你的设计说明与作品链接');
  await task.locator('input[name="rewardScore"]').fill('15');
  await task.locator('select[name="rewardItem"]').selectOption('cactus');
  await task.locator('input[name="rewardQuantity"]').fill('1');
  await task.locator('select[name="rewardModelIds"]').selectOption([asset.id]);
  await task.locator('button[type="submit"],button.primary').click();
  await expect(page.locator('.classroom-task')).toContainText('班级空间作品');
  await logout(page);
  await login(page, 'classroomstudent', '课堂学生');
  await classroom(page);
  await expect(page.locator('[data-classroom-form="task"]')).toHaveCount(0);
  const submission = page.locator('[data-classroom-form="submission"]');
  await submission.locator('textarea[name="text"]').fill('我设计了一个安静的阅读角落。');
  await submission.locator('input[name="link"]').fill('https://example.com/student-work');
  await submission.locator('input[name="publish"]').check();
  await submission.locator('button').click();
  await expect(page.locator('.submission-status')).toContainText('等待教师确认');
  await logout(page);
  await login(page, 'classroomteacher', '课堂教师');
  await classroom(page);
  const review = page.locator('[data-classroom-form="review"]');
  await review.locator('input[name="feedback"]').fill('设计思路清晰，已完成。');
  await review.locator('button[value="approved"]').click();
  await expect(page.locator('.classroom-review-list')).toContainText('课堂学生 · 已完成');
  await page.screenshot({ path: 'test-results/classroom-teacher-review.png' });
  await logout(page);
  await login(page, 'classroomstudent', '课堂学生');
  await classroom(page);
  await expect(page.locator('.submission-status')).toContainText('已完成');
  await expect(page.locator('.submission-status')).toContainText('设计思路清晰');
  await expect(page.locator('[data-classroom-form="submission"]')).toHaveCount(0);
  await expect(page.locator('.learning-records')).toContainText('+15 活力');
  await expect(page.locator('.classroom-works')).toContainText('我设计了一个安静的阅读角落。');
  await page.keyboard.press('Escape');
  await page.locator('.account [data-action="account"]').click();
  await page.locator('.menu-list [data-action="backpack"]').click();
  await expect(page.locator('.inventory-card').filter({ hasText: '仙人掌' })).toContainText('持有 3');
  await expect(page.locator('.model-card').filter({ hasText: '课堂专属模型' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const {community,world}=window.__cubicles;const office=community.ownOffice();world.teleport(office.x,office.z+1.5); });
  await page.waitForTimeout(1600);
  await page.keyboard.press('b');
  await page.locator(`[data-add-model="${asset.id}"]`).click();
  await expect(page.locator('#furniture-form button[type="submit"]')).toBeEnabled();
  await page.locator('#furniture-form button[type="submit"]').click();
  await expect(page.locator('#furniture-form')).toHaveCount(0);
  const world = await (await page.request.get('/api/world')).json();
  const me = await (await page.request.get('/api/me')).json();
  expect(me.user.score).toBe(15);
  expect(world.offices.find(office=>office.ownerId===me.user.id).furniture.some(placed=>placed.itemId===`model:${asset.id}`)).toBe(true);
  await page.waitForFunction(() => window.__cubicles.world.furnitureGroups.get(window.__cubicles.community.ownOffice().id).children.length > 5);
  await page.screenshot({ path: 'test-results/learning-reward-workstation.png' });
});

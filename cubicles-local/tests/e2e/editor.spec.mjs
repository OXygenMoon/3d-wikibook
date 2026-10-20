import path from 'node:path';
import { test, expect } from '@playwright/test';

async function login(page, username = 'lzy', password = '123456', name = '社区管理员') {
  await page.goto('/');
  await page.locator('#profile-name').waitFor({ state: 'visible' });
  if (await page.locator('.enter-button').count()) await page.locator('.enter-button').click({ timeout: 90_000 });
  await page.locator('.account [data-action="login"]').click();
  await page.locator('#login-form input[name="username"]').fill(username);
  await page.locator('#login-form input[name="password"]').fill(password);
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('#profile-name')).toHaveText(name);
}

test('editor snaps positions, supports undo/redo and copying, and cancel restores saved furniture', async ({ page }) => {
  await login(page);
  await page.evaluate(() => {
    const { world, community } = window.__cubicles;
    const office = community.ownOffice();
    world.teleport(office.x, office.z + 1.5);
  });
  await page.waitForTimeout(1600);
  await page.keyboard.press('b');
  const form = page.locator('#furniture-form');
  await expect(form).toBeVisible();
  await page.locator('[data-select-placed="base-lamp"]').click();
  const before = await page.evaluate(() => structuredClone(window.__cubicles.community.draft.furniture));
  const axis = page.locator('[data-layout-axis="x"]');
  await axis.evaluate(element => { element.value = '.65'; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(await page.evaluate(() => window.__cubicles.community.draft.furniture.find(placed => placed.id === 'base-lamp').x)).toBe(.75);
  await page.locator('[data-editor-action="undo"]').click();
  expect(await page.evaluate(() => window.__cubicles.community.draft.furniture)).toEqual(before);
  await page.locator('[data-editor-action="redo"]').click();
  await page.locator('[data-editor-action="duplicate"]').click();
  expect(await page.evaluate(() => window.__cubicles.community.draft.furniture.length)).toBe(before.length + 1);
  await page.locator('[data-editor-action="undo"]').click();
  await page.locator('[data-select-placed="base-desk"]').click();
  await page.locator('[data-layout-axis="x"]').evaluate(element => { element.value = '1.5'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#editor-error')).toContainText('边界');
  await expect(form.locator('button[type="submit"]')).toBeDisabled();
  await form.locator('[data-action="close"]').click();
  const saved = await (await page.request.get('/api/world')).json();
  const officeId = await page.evaluate(() => window.__cubicles.community.ownOffice().id);
  expect(saved.offices.find(office => office.id === officeId).furniture).toEqual(before);
  await page.reload();
  await expect(page.locator('#profile-name')).toHaveText('社区管理员');
});

test('import generates a thumbnail and existing model metadata can be edited without reupload', async ({ page }) => {
  await login(page);
  await page.locator('.account [data-action="account"]').click();
  await page.locator('.menu-list [data-action="backpack"]').click();
  await page.locator('.my-models [data-action="import-model"]').click();
  const overlay = page.locator('.model-import-overlay');
  await overlay.locator('#model-file').setInputFiles(path.resolve('public/examples/grid-pavilion.glb'));
  await expect(overlay.locator('#model-preview-empty')).toBeHidden();
  await overlay.locator('input[name="name"]').fill('第二阶段模型');
  await overlay.locator('button[type="submit"]').click();
  const card = page.locator('.model-card').filter({ hasText: '第二阶段模型' });
  await expect(card).toBeVisible();
  await expect(card.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  const original = await page.evaluate(() => window.__cubicles.state.myModels.find(asset => asset.name === '第二阶段模型'));
  await card.locator('[data-action="edit-model"]').click();
  await expect(overlay.locator('#model-file')).toHaveCount(0);
  await expect(overlay.locator('#model-preview-empty')).toBeHidden();
  await overlay.locator('input[name="name"]').fill('无需重传的模型');
  await overlay.locator('textarea[name="description"]').fill('修改信息与缩放');
  await overlay.locator('#model-scale').evaluate(element => { element.value = '1.5'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await overlay.locator('button[type="submit"]').click();
  await expect(page.locator('.model-card').filter({ hasText: '无需重传的模型' })).toBeVisible();
  const edited = await page.evaluate(() => window.__cubicles.state.myModels.find(asset => asset.name === '无需重传的模型'));
  expect(edited.id).toBe(original.id);
  expect(edited.url).toBe(original.url);
  expect(edited.scale).toBe(1.5);
  await page.screenshot({ path: 'test-results/editor-model-library.png' });
  await page.reload();
  const models = await (await page.request.get('/api/models')).json();
  expect(models.assets.find(asset => asset.id === original.id).name).toBe('无需重传的模型');
});

test('switching accounts removes private models even when their owner remains online elsewhere', async ({ page, browser }) => {
  await login(page);
  const created = await page.request.post('/api/admin/import', { data: { users: [
    { username: 'editorowner', password: '123456', name: '模型主人', className: '创想一班' },
    { username: 'editorother', password: '123456', name: '另一个账号', className: '创想一班' },
  ] } });
  expect(created.ok()).toBe(true);
  async function logout() {
    await page.locator('.account [data-action="account"]').click();
    await page.locator('.menu-list [data-action="logout"]').click();
    await expect(page.locator('#profile-name')).toHaveText('访客');
  }
  await logout();
  await login(page, 'editorowner', '123456', '模型主人');
  await page.locator('.account [data-action="account"]').click();
  await page.locator('.menu-list [data-action="backpack"]').click();
  await page.locator('.my-models [data-action="import-model"]').click();
  const overlay = page.locator('.model-import-overlay');
  await overlay.locator('#model-file').setInputFiles(path.resolve('public/examples/grid-pavilion.glb'));
  await expect(overlay.locator('#model-preview-empty')).toBeHidden();
  await overlay.locator('input[name="name"]').fill('账号隔离模型');
  await overlay.locator('button[type="submit"]').click();
  const card = page.locator('.model-card').filter({ hasText: '账号隔离模型' });
  await expect(card).toBeVisible();
  const asset = await page.evaluate(() => window.__cubicles.state.myModels.find(asset => asset.name === '账号隔离模型'));
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const { community, world } = window.__cubicles;const office=community.ownOffice();world.teleport(office.x,office.z+1.5); });
  await page.waitForTimeout(1600);
  await page.keyboard.press('b');
  await page.locator(`[data-add-model="${asset.id}"]`).click();
  await page.locator('#furniture-form button[type="submit"]').click();
  await expect(page.locator('#furniture-form')).toHaveCount(0);
  const ownerId = await page.evaluate(() => window.__cubicles.community.ownOffice().id);
  const keeper = await browser.newContext();
  try {
    const origin = new URL(page.url()).origin;
    await keeper.request.post(`${origin}/api/login`, { data: { username: 'editorowner', password: '123456' } });
    await logout();
    await page.waitForFunction(() => !window.__cubicles.world.modelAssets.some(asset => asset.visibility === 'private'));
    expect(await page.evaluate(officeId => window.__cubicles.world.furnitureGroups.get(officeId).children.length, ownerId)).toBe(5);
    await login(page, 'editorother', '123456', '另一个账号');
    await page.locator('.account [data-action="account"]').click();
    await page.locator('.menu-list [data-action="backpack"]').click();
    await expect(page.locator('.model-card').filter({ hasText: '账号隔离模型' })).toHaveCount(0);
  } finally { await keeper.close(); }
});

test('an upload in progress cannot be closed or replaced before its save completes',async({page})=>{
  await login(page);
  await page.locator('.account [data-action="account"]').click();
  await page.locator('.menu-list [data-action="backpack"]').click();
  await page.locator('.my-models [data-action="import-model"]').click();
  const overlay=page.locator('.model-import-overlay');
  await overlay.locator('#model-file').setInputFiles(path.resolve('public/examples/grid-pavilion.glb'));
  await expect(overlay.locator('#model-preview-empty')).toBeHidden();
  await overlay.locator('input[name="name"]').fill('上传状态验证模型');
  let release;
  const gate=new Promise(resolve=>release=resolve);
  await page.route(/\/api\/admin\/models\?/,async route=>{await gate;await route.continue();});
  try{
    await overlay.locator('button[type="submit"]').click();
    await expect(overlay.locator('button[type="submit"]')).toBeDisabled();
    await expect(overlay.locator('input[name="name"]')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('[data-model-import-close]').first()).toBeDisabled();
  }finally{release();}
  await expect(overlay).toHaveCount(0);
  await expect(page.locator('.model-card').filter({hasText:'上传状态验证模型'})).toBeVisible();
});

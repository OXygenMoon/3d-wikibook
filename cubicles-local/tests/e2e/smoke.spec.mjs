import path from 'node:path';
import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function enterWorld(page) {
  await page.goto('/', { waitUntil: 'commit' });
  const enter = page.locator('.enter-button');
  await expect(enter).toBeEnabled({ timeout: 90_000 });
  await enter.click();
  await expect(page.locator('.welcome-shade')).toHaveCount(0);
}

async function login(page, username = 'lzy', password = '123456', expectedName = '社区管理员', admin = true) {
  await enterWorld(page);
  await page.locator('.account [data-action="login"]').click();
  const form = page.locator('#login-form');
  await expect(form).toBeVisible();
  await form.locator('input[name="username"]').fill(username);
  await form.locator('input[name="password"]').fill(password);
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('#profile-name')).toHaveText(expectedName);
  if (admin) await expect(page.locator('.account [data-action="admin"]')).toBeVisible();
}

test('1. 管理员登录并写入 HttpOnly 会话', async ({ page, context }) => {
  await login(page);
  const session = (await context.cookies()).find(cookie => cookie.name === 'community_session');
  expect(session).toBeTruthy();
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe('Strict');
});

test('2. 进入三维世界并初始化 HUD', async ({ page }) => {
  await enterWorld(page);
  await expect(page.locator('#world')).toBeVisible();
  await expect(page.locator('#minimap')).toBeVisible();
  await expect(page.locator('#community-clock')).toContainText('网格');
  const inspect = await page.evaluate(() => window.__cubicles.inspect());
  expect(inspect.ready).toBe(true);
  expect(inspect.entered).toBe(true);
  expect(inspect.officeCount).toBeGreaterThanOrEqual(24);
});

test('3. 编辑并保存自己的家具，刷新后仍保留', async ({ page }) => {
  await login(page);
  const office = await page.evaluate(() => {
    const own = window.__cubicles.community.ownOffice();
    window.__cubicles.world.teleport(own.x, own.z + 1.5);
    return { id: own.id };
  });
  await page.waitForTimeout(1600);
  await page.keyboard.press('b');
  await expect(page.locator('#furniture-form')).toBeVisible();
  await page.locator('[data-add-item="flowers"]').click();
  await page.locator('#furniture-form button[type="submit"]').click();
  await expect(page.locator('.toast').filter({ hasText: '你的家具布置已保存' })).toBeVisible({ timeout: 20_000 });

  const world = await (await page.request.get('/api/world')).json();
  const saved = world.offices.find(item => item.id === office.id);
  expect(saved.furniture.filter(item => item.itemId === 'flowers').length).toBe(1);

  await page.reload();
  await expect(page.locator('#profile-name')).toHaveText('社区管理员', { timeout: 30_000 });
  const afterReload = await (await page.request.get('/api/world')).json();
  const persisted = afterReload.offices.find(item => item.id === office.id);
  expect(persisted.furniture.filter(item => item.itemId === 'flowers').length).toBe(1);
});

test('4. 抵达贴纸墙并留下贴纸', async ({ page }) => {
  await login(page);
  await page.locator('.public-nav [data-area-visit="wall"]').first().click();
  await expect(page.locator('.toast').filter({ hasText: '已抵达共创贴纸墙' })).toBeVisible();
  const interact = page.locator('#nearby-prompt button[data-action="area-interact"]');
  await expect(interact).toBeVisible({ timeout: 15_000 });
  await interact.click();
  const form = page.locator('#sticker-form');
  await expect(form).toBeVisible();
  const text = `自动化验收贴纸 ${Date.now()}`;
  await form.locator('textarea[name="text"]').fill(text);
  await form.locator('button.primary').click();
  await expect(page.locator('.toast').filter({ hasText: '贴纸已留在共创墙上' })).toBeVisible();
  await expect(page.locator('.sticker-grid')).toContainText(text);

  const world = await (await page.request.get('/api/world')).json();
  expect(world.stickers.at(-1).text).toBe(text);
});

test('5. 管理员在世界编辑器中移动班级并保存', async ({ page }) => {
  await login(page);
  const before = await (await page.request.get('/api/world')).json();
  await page.locator('.account [data-action="admin"]').click();
  await page.locator('[data-admin-tab="world"]').click();
  await page.locator('[data-action="world-editor"]').click();
  await page.locator('[data-world-action="preview"]').click();
  await expect(page.locator('#world-layout-map')).toBeVisible({ timeout: 20_000 });

  await page.locator('[data-world-rect="class-1"]').click();
  const input = page.locator('#building-transform-form input[name="gridX"]');
  await expect(input).toBeVisible();
  const oldX = Number(await input.inputValue());
  await input.fill(String(oldX + 1));
  await input.press('Tab');
  await expect(input).toHaveValue(String(oldX + 1));
  await expect(page.locator('[data-world-action="undo"]')).toBeEnabled();
  await expect(page.locator('#layout-validation')).toContainText('有效');

  const savedRequest = page.waitForRequest(request => request.url().endsWith('/api/admin/layout') && request.method() === 'PUT');
  await page.locator('[data-world-action="save"]').click();
  expect((await savedRequest).postDataJSON().buildings.find(item => item.id === 'class-1').gridX).toBe(oldX + 1);
  await expect(page.locator('.toast').filter({ hasText: '世界布局已保存' })).toBeVisible({ timeout: 20_000 });

  const after = await (await page.request.get('/api/world')).json();
  expect(after.layoutRevision).toBeGreaterThan(before.layoutRevision);
  expect(after.buildings.find(item => item.id === 'class-1').gridX).toBe(oldX + 1);
});
test('6. 导入 3D 模型并放入自己的工位', async ({ page }) => {
  await login(page);
  await page.locator('.account [data-action="account"]').click();
  await page.locator('.menu-list [data-action="backpack"]').click();
  await expect(page.locator('.my-models')).toBeVisible();
  await page.locator('.my-models [data-action="import-model"]').click();

  const overlay = page.locator('.model-import-overlay');
  await expect(overlay).toBeVisible();
  await overlay.locator('#model-file').setInputFiles(path.resolve('public/examples/grid-pavilion.glb'));
  await expect(overlay.locator('#model-preview-empty')).toBeHidden({ timeout: 20_000 });
  await overlay.locator('input[name="name"]').fill('自动化凉亭');
  await overlay.locator('textarea[name="description"]').fill('用于自动化验证模型导入、预览和工位摆放。');
  await overlay.locator('#model-scale').evaluate(element => {
    element.value = '1.2';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(overlay.locator('#model-scale-output')).toHaveText('1.20×');
  await overlay.locator('button[type="submit"]').click();
  await expect(page.locator('.toast').filter({ hasText: '模型已保存' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.model-card').filter({ hasText: '自动化凉亭' })).toBeVisible();

  const assetId = await page.evaluate(() => window.__cubicles.state.myModels.find(asset => asset.name === '自动化凉亭').id);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const own = window.__cubicles.community.ownOffice();
    window.__cubicles.world.teleport(own.x, own.z + 1.5);
  });
  await page.waitForTimeout(1600);
  await page.keyboard.press('b');
  await expect(page.locator('#furniture-form')).toBeVisible();
  await page.locator(`[data-add-model="${assetId}"]`).click();
  await page.locator('#furniture-form button[type="submit"]').click();
  await expect(page.locator('.toast').filter({ hasText: '你的家具布置已保存' })).toBeVisible({ timeout: 20_000 });

  const world = await (await page.request.get('/api/world')).json();
  const ownOffice = world.offices.find(item => item.ownerId);
  expect(ownOffice.furniture.some(item => item.itemId === `model:${assetId}`)).toBe(true);
});

test('7. 管理员把导入的模型放入世界布局', async ({ page }) => {
  await login(page);
  const assets = await (await page.request.get('/api/models')).json();
  const asset = assets.assets.find(item => item.name === '自动化凉亭');
  expect(asset).toBeTruthy();

  await page.locator('.account [data-action="admin"]').click();
  await page.locator('[data-admin-tab="world"]').click();
  await page.locator('[data-action="world-editor"]').click();
  await page.locator('[data-world-action="preview"]').click();
  await expect(page.locator('#world-layout-map')).toBeVisible({ timeout: 20_000 });
  await page.locator(`[data-add-world-model="${asset.id}"]`).click();
  await expect(page.locator('#building-transform-form')).toBeVisible();
  await page.locator('[data-world-action="save"]').click();
  await expect(page.locator('.toast').filter({ hasText: '世界布局已保存' })).toBeVisible({ timeout: 20_000 });

  const world = await (await page.request.get('/api/world')).json();
  const placed = world.buildings.find(item => item.assetId === asset.id);
  expect(placed).toBeTruthy();
  expect(placed.width).toBeGreaterThanOrEqual(Math.ceil(asset.scale));
});
test('8. 普通用户导入私有模型并在工位中渲染', async ({ page, context }) => {
  await login(page);
  const token = await page.evaluate(() => sessionStorage.getItem('cubicles.token'));
  const created = await page.request.post('/api/admin/import', {
    headers: { 'X-Session-Token': token },
    data: { users: [{ username: 'e2euser', password: '123456', name: 'E2E用户', className: '创想一班' }] },
  });
  expect(created.ok()).toBeTruthy();

  await context.clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('/', { waitUntil: 'commit' });
  await login(page, 'e2euser', '123456', 'E2E用户', false);

  await page.locator('.account [data-action="account"]').click();
  await page.locator('.menu-list [data-action="backpack"]').click();
  await page.locator('.my-models [data-action="import-model"]').click();
  const overlay = page.locator('.model-import-overlay');
  await overlay.locator('#model-file').setInputFiles(path.resolve('public/examples/grid-pavilion.glb'));
  await expect(overlay.locator('#model-preview-empty')).toBeHidden({ timeout: 20_000 });
  await overlay.locator('input[name="name"]').fill('用户私有模型');
  await overlay.locator('button[type="submit"]').click();
  await expect(page.locator('.toast').filter({ hasText: '模型已保存' })).toBeVisible({ timeout: 30_000 });

  const asset = await page.evaluate(() => window.__cubicles.state.myModels.find(item => item.name === '用户私有模型'));
  expect(asset.visibility).toBe('private');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const own = window.__cubicles.community.ownOffice();
    window.__cubicles.world.teleport(own.x, own.z + 1.5);
  });
  await page.waitForTimeout(1600);
  await page.keyboard.press('b');
  await page.locator(`[data-add-model="${asset.id}"]`).click();
  await page.locator('#furniture-form button[type="submit"]').click();
  await expect(page.locator('.toast').filter({ hasText: '你的家具布置已保存' })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1200);

  const rendered = await page.evaluate(() => {
    const own = window.__cubicles.community.ownOffice();
    const group = window.__cubicles.world.furnitureGroups.get(own.id);
    return { children: group ? group.children.length : 0, assetErrors: window.__cubicles.world.lastAssetError || '' };
  });
  expect(rendered.children).toBeGreaterThan(5);
});

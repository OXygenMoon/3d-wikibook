import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function enterWorld(page) {
  await page.goto('/', { waitUntil: 'commit' });
  const enter = page.locator('.enter-button');
  await expect(enter).toBeEnabled({ timeout: 90_000 });
  await enter.click();
  await expect(page.locator('.welcome-shade')).toHaveCount(0);
}

async function login(page, username = 'lzy', password = '123456') {
  await enterWorld(page);
  await page.locator('.account [data-action="login"]').click();
  const form = page.locator('#login-form');
  await expect(form).toBeVisible();
  await form.locator('input[name="username"]').fill(username);
  await form.locator('input[name="password"]').fill(password);
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('#profile-name')).toHaveText('社区管理员');
  await expect(page.locator('.account [data-action="admin"]')).toBeVisible();
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
  await expect(page.locator('#world-layout-map')).toBeVisible({ timeout: 20_000 });

  await page.locator('[data-world-rect="class-1"]').click();
  const input = page.locator('#building-transform-form input[name="gridX"]');
  await expect(input).toBeVisible();
  const oldX = Number(await input.inputValue());
  await input.fill(String(oldX + 1));
  await input.press('Tab');
  await expect(page.locator('#layout-validation')).toContainText('有效');

  await page.locator('[data-world-action="save"]').click();
  await expect(page.locator('.toast').filter({ hasText: '世界布局已保存' })).toBeVisible({ timeout: 20_000 });

  const after = await (await page.request.get('/api/world')).json();
  expect(after.layoutRevision).toBeGreaterThan(before.layoutRevision);
  expect(after.buildings.find(item => item.id === 'class-1').gridX).toBe(oldX + 1);
});

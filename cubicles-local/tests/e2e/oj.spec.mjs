import { test, expect } from '@playwright/test';

async function enter(page, url = 'http://oj.test/oj/problems') {
  await page.route('**/api/lab', async route => {
    const response = await route.fetch();
    const data = await response.json();
    if (response.ok()) data.oj = { url };
    await route.fulfill({ response, json: data });
  });
  await page.route('http://oj.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="zh"><meta charset="utf-8"><title>测试 OJ</title><h1>OJ 题库</h1><label>代码<textarea aria-label="代码"></textarea></label><a href="/oj/problem/1">进入题目</a></html>' }));
  await page.goto('/');
  await page.locator('.enter-button').click({ timeout: 90000 });
  await page.waitForFunction(() => window.__cubicles?.world.ready);
}

async function openLab(page) {
  await page.locator('.public-nav [data-area-visit="lab"]').click();
  await expect(page.locator('.toast').filter({ hasText: '已抵达云端机房' })).toBeVisible();
  await expect(page.locator('#nearby-prompt')).toContainText('WikiBook OJ');
  await page.locator('#world').focus();
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog', { name: 'WikiBook OJ 机房' })).toBeVisible();
}

test('机房 E 打开 OJ，沉浸不重载代码，返回世界后保持位置和 OJ 编辑状态', async ({ page }) => {
  await enter(page);
  expect((await page.request.get('/api/lab')).status()).toBe(403);
  await page.evaluate(() => window.__cubicles.community.show('lab'));
  await expect(page.getByRole('dialog', { name: 'WikiBook OJ 机房' })).toHaveCount(0);
  await openLab(page);
  const frame = page.frameLocator('.oj-frame');
  await expect(frame.getByRole('heading')).toHaveText('OJ 题库');
  await expect(page.locator('.oj-frame')).toHaveAttribute('src', 'http://oj.test/oj/problems?embed=community-oj');
  await expect(page.getByRole('link', { name: '独立标签页打开' })).toHaveAttribute('href', 'http://oj.test/oj/problems');
  const before = await page.evaluate(() => { const {world}=window.__cubicles;return {x:world.position.x,z:world.position.z,yaw:world.yaw,zoom:world.zoomLevel}; });
  await frame.getByRole('textbox', { name: '代码' }).fill('print("保留代码")');
  await frame.getByRole('textbox', { name: '代码' }).press('w');
  await expect.poll(() => page.evaluate(() => window.__cubicles.world.paused)).toBe(true);
  await page.locator('[data-oj="immersive"]').focus();
  await page.keyboard.press('F8');
  await expect(page.locator('#oj-workspace')).toHaveClass(/immersive/);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('oj-workspace');
  await expect(page.locator('[data-oj="return"]')).toBeInViewport();
  await expect(frame.getByRole('textbox', { name: '代码' })).toHaveValue('print("保留代码")w');
  await page.locator('[data-oj="immersive"]').click();
  await expect(page.locator('#oj-workspace')).not.toHaveClass(/immersive/);
  await page.locator('[data-oj="return"]').click();
  await expect(page.locator('#oj-workspace')).toBeHidden();
  expect(await page.evaluate(() => {const {world}=window.__cubicles;return {x:world.position.x,z:world.position.z,yaw:world.yaw,zoom:world.zoomLevel};})).toEqual(before);
  expect(await page.evaluate(() => window.__cubicles.world.paused)).toBe(false);
  await page.keyboard.press('e');
  await expect(page.locator('#oj-workspace')).toBeVisible();
  await expect(frame.getByRole('textbox', { name: '代码' })).toHaveValue('print("保留代码")w');
  await page.locator('[data-oj="return"]').focus();
  await page.keyboard.press('F7');
  await expect(page.locator('#oj-workspace')).toBeHidden();
  await page.keyboard.down('s');
  await expect.poll(() => page.evaluate(() => window.__cubicles.world.position.z)).toBeGreaterThan(before.z + .3);
  await page.keyboard.up('s');
});

test('移动端全屏拒绝时窗口沉浸仍可退出，并保留原社区任务入口', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await openLab(page);
  await page.evaluate(() => {document.querySelector('#oj-workspace').requestFullscreen = () => Promise.reject(new Error('NotAllowed'));});
  await page.locator('[data-oj="immersive"]').click();
  await expect(page.locator('#oj-status')).toContainText('窗口内沉浸');
  await expect(page.locator('[data-oj="return"]')).toBeInViewport();
  const size = await page.locator('.oj-shell').boundingBox();
  expect(size.width).toBe(390);expect(size.height).toBe(844);
  await page.screenshot({ path: 'test-results/oj-mobile-immersive.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#oj-workspace')).not.toHaveClass(/immersive/);
  await expect(page.locator('#oj-workspace')).toBeVisible();
  await page.locator('[data-oj="tasks"]').click();
  await expect(page.locator('.task-list')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#world').focus();await page.keyboard.press('e');
  await expect(page.locator('#oj-workspace')).toBeVisible();
  await page.locator('[data-oj="return"]').click();
  await expect(page.locator('#oj-workspace')).toBeHidden();
});

test('未配置 OJ 和 iframe 连接失败都有明确退路', async ({ page }) => {
  await enter(page, '');
  await openLab(page);
  await expect(page.locator('#oj-status')).toContainText('尚未配置');
  await expect(page.locator('.oj-frame')).toHaveCount(0);
  await page.locator('[data-oj="return"]').click();
  await page.unroute('**/api/lab');
  await page.route('**/api/lab', async route => {
    const response = await route.fetch();const data = await response.json();data.oj={url:'http://offline.test/oj/problems'};
    await route.fulfill({response,json:data});
  });
  await page.route('http://offline.test/**', route => route.abort('connectionrefused'));
  await page.locator('#world').focus();await page.keyboard.press('e');
  await expect(page.getByRole('link',{name:'独立标签页打开'})).toHaveAttribute('href','http://offline.test/oj/problems');
  await expect(page.locator('#oj-help')).toContainText('连接失败');
  await page.screenshot({path:'test-results/oj-connection-fallback.png'});
  await page.locator('[data-oj="return"]').click();
  await expect(page.locator('#oj-workspace')).toBeHidden();
});

import { test, expect } from '@playwright/test';

test('登录门禁不加载世界，不能关闭或用旧缓存绕过，登录后进入且退出后重新上锁', async ({ page }) => {
  let worldReads = 0;
  await page.route('**/api/session', async route => {
    const response = await route.fetch(), data = await response.json();
    await route.fulfill({ response, json: { ...data, loginRequired: true, ...(data.user ? {} : { token: '' }) } });
  });
  page.on('request', request => { if(new URL(request.url()).pathname === '/api/world')worldReads++; });
  await page.addInitScript(() => {localStorage.setItem('cubicles.entered','true');sessionStorage.setItem('cubicles.token','expired-token');});
  await page.goto('/');
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/login-locked/);
  await expect(page.locator('#world')).toBeHidden();
  await expect(page.getByText('社区仅对已登录成员开放', { exact: false })).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__cubicles));
  expect(worldReads).toBe(0);
  expect(await page.evaluate(() => Boolean(window.__cubicles.world.ready))).toBe(false);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {window.__cubicles.closePanel();window.__cubicles.openPanel('map');});
  await expect(page.locator('#login-form')).toBeVisible();
  await page.getByRole('textbox', { name: '账号', exact: true }).fill('lzy');
  await page.getByLabel('密码', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: '登录社区', exact: true }).click();
  await expect(page.locator('#login-error')).toContainText('账号或密码不正确');
  await expect(page.locator('#world')).toBeHidden();
  await page.getByLabel('密码', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '登录社区', exact: true }).click();
  await expect(page.locator('#login-form')).toHaveCount(0, { timeout: 90000 });
  await expect(page.locator('#world')).toBeVisible();
  expect(worldReads).toBeGreaterThan(0);
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('button', { name: '退出账号', exact: true }).click();
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.locator('#world')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#login-form')).toBeVisible();
});

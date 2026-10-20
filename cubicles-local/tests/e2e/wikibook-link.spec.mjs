import { test, expect } from '@playwright/test';

async function enterLoggedIn(page) {
  const response = await page.request.post('/api/login', { data: { username: 'lzy', password: '123456' } });
  expect(response.ok()).toBe(true);
  await page.goto('/');
  await page.locator('.enter-button').click({ timeout: 90000 });
  await page.waitForFunction(() => window.__cubicles?.world.ready);
  await expect(page.getByRole('button', { name: '我的账号', exact: true })).toBeVisible();
}

test('账号面板展示关联身份，解除需确认并重新读取关联状态', async ({ page }) => {
  let linked = true, deletions = 0;
  await page.route('**/api/wikibook/account', async route => {
    if(route.request().method() === 'DELETE'){ linked = false; deletions++; }
    await route.fulfill({ json: { enabled: true, linked, username: linked ? 'wiki-student' : null } });
  });
  await enterLoggedIn(page);
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await expect(page.getByText('已关联：wiki-student。', { exact: false })).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '解除关联', exact: true }).click();
  expect(deletions).toBe(0);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '解除关联', exact: true }).click();
  await expect(page.getByRole('button', { name: '关联 WikiBook 账号', exact: true })).toBeVisible();
  expect(deletions).toBe(1);
});

test('已关联工作台和独立标签页均使用服务端免登录入口，返回不重复签发', async ({ page, context }) => {
  const launches = [];
  await page.route('**/api/wikibook/account', route => route.fulfill({ json: { enabled: true, linked: true, username: 'wiki-student' } }));
  await page.route('**/api/pond', async route => {
    const response = await route.fetch(), data = await response.json();
    await route.fulfill({ response, json: { ...data, wikibookSsoEnabled: true, fishing: { url: 'http://sso.test/fishing' } } });
  });
  await page.route('**/api/wikibook/launch', async route => {
    const data = route.request().postDataJSON();
    launches.push(data);
    await route.fulfill({ json: { url: `http://sso.test/community-sso/prepare?mode=${data.embedded ? 'frame' : 'standalone'}` } });
  });
  await context.route('http://sso.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><h1>已自动登录 wiki-student</h1><input aria-label="钓鱼备注">' }));
  await enterLoggedIn(page);
  await page.locator('.public-nav [data-area-visit="pond"]').click();
  await expect(page.locator('#nearby-prompt')).toContainText('WikiBook 钓鱼');
  await page.locator('#world').focus();await page.keyboard.press('e');
  await expect(page.frameLocator('.fishing-frame').getByRole('heading')).toHaveText('已自动登录 wiki-student');
  await expect(page.locator('#wikibook-fishing-help')).toContainText('免登录进入');
  await page.frameLocator('.fishing-frame').getByRole('textbox').fill('保留钓鱼进度');
  await page.getByRole('button', { name: '返回 3D 世界', exact: true }).click();
  await page.locator('#world').focus();await page.keyboard.press('e');
  await expect(page.frameLocator('.fishing-frame').getByRole('textbox')).toHaveValue('保留钓鱼进度');
  expect(launches).toEqual([{ module: 'fishing', embedded: true }]);
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('link', { name: '独立标签页打开' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL('http://sso.test/community-sso/prepare?mode=standalone');
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  expect(launches.at(-1)).toEqual({ module: 'fishing', embedded: false });
  await popup.close();
});

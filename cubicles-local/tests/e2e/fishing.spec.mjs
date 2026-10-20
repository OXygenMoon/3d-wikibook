import { test, expect } from '@playwright/test';

async function enter(page, url = 'http://fishing.test/fishing') {
  await page.route('**/api/pond', async route => {
    const response = await route.fetch();const data = await response.json();
    if (response.ok()) data.fishing = { url };
    await route.fulfill({ response, json: data });
  });
  await page.context().route('http://fishing.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><h1>WikiBook 钓鱼</h1><nav><a href="/fishing/shop">钓具商店</a><a href="/fishing/collection">鱼类图鉴</a><a href="/fishing/bait">每日鱼饵</a></nav><label>钓鱼备注<input aria-label="钓鱼备注"></label>' }));
  await page.goto('/');await page.locator('.enter-button').click({ timeout: 90000 });
  await page.waitForFunction(() => window.__cubicles?.world.ready);
}

async function openPond(page) {
  await page.locator('.public-nav [data-area-visit="pond"]').click();
  await expect(page.locator('.toast').filter({ hasText: '已抵达荷风池塘' })).toBeVisible();
  await expect(page.locator('#nearby-prompt')).toContainText('打开 WikiBook 钓鱼');
  await page.locator('#world').focus();await page.keyboard.press('e');
  await expect(page.getByRole('dialog', { name: 'WikiBook 钓鱼 池塘' })).toBeVisible();
}

test('池塘按 E 打开 WikiBook 钓鱼，保留游戏页面和角色位置且不领取本地钓鱼奖励', async ({ page, context }) => {
  const localRewards=[];
  page.on('request', request => {if (/\/api\/fishing\/(cast|reel)/.test(request.url())) localRewards.push(request.url());});
  await enter(page);
  expect((await page.request.get('/api/pond')).status()).toBe(403);
  await page.evaluate(() => window.__cubicles.community.show('pond'));
  await expect(page.locator('#wikibook-fishing-workspace')).toBeHidden();
  await openPond(page);
  const root=page.locator('#wikibook-fishing-workspace');const frame=page.frameLocator('.fishing-frame');
  await expect(root.locator('iframe')).toHaveAttribute('src', 'http://fishing.test/fishing?embed=community-fishing');
  await expect(frame.getByRole('heading')).toHaveText('WikiBook 钓鱼');
  await frame.getByRole('textbox').fill('正在等待鱼汛');
  const before=await page.evaluate(()=>{const {world,state}=window.__cubicles;return {x:world.position.x,z:world.position.z,yaw:world.yaw,zoom:world.zoomLevel,aura:state.aura};});
  await frame.getByRole('textbox').press('w');
  await expect(root.locator('footer')).toContainText('不会暂停钓鱼计时');
  await root.locator('[data-wikibook-fishing="immersive"]').focus();await page.keyboard.press('F8');
  await expect(root).toHaveClass(/immersive/);
  await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.id)).toBe('wikibook-fishing-workspace');
  await root.locator('[data-wikibook-fishing="return"]').click();await expect(root).toBeHidden();
  expect(await page.evaluate(()=>{const {world,state}=window.__cubicles;return {x:world.position.x,z:world.position.z,yaw:world.yaw,zoom:world.zoomLevel,aura:state.aura};})).toEqual(before);
  expect(await page.evaluate(()=>window.__cubicles.world.paused)).toBe(false);
  await page.locator('#world').focus();await page.keyboard.press('e');await expect(root).toBeVisible();
  await expect(frame.getByRole('textbox')).toHaveValue('正在等待鱼汛w');
  await expect(root.locator('.wikibook-login-note')).toContainText('跨站嵌入可能无法保持登录');
  const popupPromise=context.waitForEvent('page');
  await root.getByRole('link',{name:'独立标签页打开'}).click();const popup=await popupPromise;
  await expect(popup).toHaveURL('http://fishing.test/fishing');
  expect(await popup.evaluate(()=>window.opener===null)).toBe(true);await popup.close();
  await root.locator('[data-wikibook-fishing="return"]').focus();await page.keyboard.press('F7');
  await expect(root).toBeHidden();expect(localRewards).toEqual([]);
});

test('钓鱼和 OJ 各自缓存页面，切换场景不会串用地址和状态', async ({ page }) => {
  await enter(page);
  await page.route('**/api/lab', async route => {const response=await route.fetch();const data=await response.json();if(response.ok())data.oj={url:'http://oj.test/oj/problems'};await route.fulfill({response,json:data});});
  await page.context().route('http://oj.test/**', route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><h1>OJ</h1><input aria-label="代码">'}));
  await openPond(page);await page.frameLocator('.fishing-frame').getByRole('textbox').fill('保留钓鱼状态');
  await page.locator('[data-wikibook-fishing="return"]').click();
  await page.locator('.public-nav [data-area-visit="lab"]').click();
  await expect(page.locator('.toast').filter({hasText:'已抵达云端机房'})).toBeVisible();
  await page.locator('#world').focus();await page.keyboard.press('e');
  await expect(page.locator('#oj-workspace')).toBeVisible();
  await expect(page.locator('#wikibook-fishing-workspace')).toBeHidden();
  await page.frameLocator('.oj-frame').getByRole('textbox').fill('保留 OJ 代码');
  await page.locator('[data-oj="return"]').click();await openPond(page);
  await expect(page.frameLocator('.fishing-frame').getByRole('textbox')).toHaveValue('保留钓鱼状态');
  await expect(page.locator('#oj-workspace')).toBeHidden();
  await page.locator('[data-wikibook-fishing="return"]').click();
});

test('窄屏保留钓鱼返回入口，未配置时明确提示而不是回到本地小游戏', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});await enter(page);await openPond(page);
  const root=page.locator('#wikibook-fishing-workspace');
  await expect(root.locator('[data-wikibook-fishing="return"]')).toBeInViewport();
  await expect(root.locator('iframe')).toBeVisible();
  await expect(root.locator('footer span').first()).toBeVisible();
  await page.screenshot({path:'test-results/wikibook-fishing-mobile.png'});
  await root.locator('[data-wikibook-fishing="return"]').click();
  await page.unroute('**/api/pond');
  await page.route('**/api/pond',async route=>{const response=await route.fetch();const data=await response.json();if(response.ok())data.fishing={url:''};await route.fulfill({response,json:data});});
  await page.locator('#world').focus();await page.keyboard.press('e');
  await expect(root.locator('[role="status"]')).toContainText('WIKIBOOK_FISHING_URL');
  await expect(root.locator('iframe')).toHaveCount(0);await expect(page.locator('#fishing-status')).toHaveCount(0);
  await root.locator('[data-wikibook-fishing="return"]').click();await expect(root).toBeHidden();
});

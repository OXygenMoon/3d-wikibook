import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createStressGLB } from '../../lib/stress-model.mjs';

async function login(page) {
  await page.goto('/');
  await page.locator('.enter-button').click({ timeout:90_000 });
  await page.locator('.account [data-action="login"]').click();
  await page.locator('#login-form input[name="username"]').fill('lzy');
  await page.locator('#login-form input[name="password"]').fill('123456');
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('#profile-name')).toHaveText('社区管理员');
}

test('network interruption recovers the existing account and revoked sessions reconnect as guests', async ({page,context})=>{
  await login(page);
  const before=(await context.cookies()).find(cookie=>cookie.name==='community_session').value;
  await context.setOffline(true);
  await expect(page.locator('#connection-status')).toContainText('连接暂时中断');
  await expect(page.locator('#connection-status')).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator('#connection-status')).toBeHidden();
  await expect(page.locator('#profile-name')).toHaveText('社区管理员');
  expect((await context.cookies()).find(cookie=>cookie.name==='community_session').value).toBe(before);
  await page.request.post('/api/logout');
  await expect(page.locator('#profile-name')).toHaveText('访客');
  await expect(page.locator('#connection-status')).toBeHidden();
  expect((await context.cookies()).find(cookie=>cookie.name==='community_session').value).not.toBe(before);
});

test('mobile viewport supports model and classroom dialogs without horizontal overflow', async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await login(page);
  await expect(page.locator('#touch-controls')).toBeVisible();
  await page.locator('.account [data-action="account"]').click();
  await page.locator('.menu-list [data-action="backpack"]').click();
  await expect(page.locator('.backpack-dialog')).toBeVisible();
  await page.locator('.my-models [data-action="import-model"]').click();
  await expect(page.locator('.model-import-dialog')).toBeVisible();
  const bounds=await page.locator('.model-import-dialog').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(391);
  await page.locator('.model-import-overlay [data-model-import-close]').first().click();
  await page.keyboard.press('Escape');
  await page.locator('.account [data-action="account"]').click();
  await page.locator('.menu-list [data-action="classroom"]').click();
  await expect(page.locator('.classroom-dialog')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  const classroom=await page.locator('.classroom-dialog').boundingBox();
  expect(classroom.x).toBeGreaterThanOrEqual(0);expect(classroom.x+classroom.width).toBeLessThanOrEqual(391);
  await page.screenshot({path:'test-results/mobile-classroom.png'});
});

test('scene records a rendering profile under simulated CPU throttling', async ({page,context})=>{
  const login=await page.request.post('/api/login',{data:{username:'lzy',password:'123456'}});
  const admin=(await login.json()).token;
  const snapshot=await(await page.request.get('/api/world')).json();
  expect((await page.request.patch('/api/admin/zones/1',{headers:{'X-Session-Token':admin},data:{...snapshot.zones[0],rows:7,columns:8}})).ok()).toBe(true);
  const rows=Array.from({length:30},(_,index)=>({username:`render${index}`,password:'123456',name:`渲染测试${index}`,classId:1}));
  expect((await page.request.post('/api/admin/import',{headers:{'X-Session-Token':admin},data:{users:rows}})).ok()).toBe(true);
  const uploaded=await page.request.post('/api/admin/models?filename=stress.glb&name=六万三角形压力模型&scale=1',{headers:{'X-Session-Token':admin,'Content-Type':'model/gltf-binary'},data:createStressGLB()});
  expect(uploaded.ok()).toBe(true);const asset=(await uploaded.json()).asset;
  expect(asset.triangleCount).toBe(60_000);
  const models=await Promise.all(rows.map(async(_,index)=>{
    if(index===0)return asset;
    const response=await page.request.post(`/api/admin/models?filename=stress-${index}.glb&name=压力模型${index}&scale=1`,{headers:{'X-Session-Token':admin,'Content-Type':'model/gltf-binary'},data:createStressGLB()});
    expect(response.ok()).toBe(true);return (await response.json()).asset;
  }));
  const world=await(await page.request.get('/api/world')).json();
  await Promise.all(rows.map(async(row,index)=>{
    const response=await page.request.post('/api/login',{headers:{'X-Session-Token':'fixture-login'},data:{username:row.username,password:row.password}});
    const actor=await response.json();const office=world.offices.find(office=>office.ownerId===actor.user.id);
    const saved=await page.request.patch(`/api/offices/${office.id}`,{headers:{'X-Session-Token':actor.token},data:{furniture:[...office.furniture,{id:'stress-placement',itemId:`model:${models[index].id}`,x:0,z:.5,rotation:0}]}});
    expect(saved.ok()).toBe(true);
  }));
  await page.request.post('/api/login',{headers:{'X-Session-Token':'fixture-login'},data:{username:'lzy',password:'123456'}});
  await page.goto('/');await page.locator('.enter-button').click({timeout:90_000});
  await page.waitForFunction(()=>[...window.__cubicles.world.furnitureGroups.values()].every(group=>!group.visible||(group.userData.models||[]).every(model=>model.loaded)),null,{timeout:30_000});
  const session=await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate',{rate:4});
  try {
    const result=await page.evaluate(async()=>{
      const timings=[];let previous=performance.now();
      await new Promise(resolve=>{const frame=()=>{const current=performance.now();timings.push(current-previous);previous=current;if(timings.length>=90)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);});
      const sorted=timings.sort((first,second)=>first-second);
      const {world}=window.__cubicles;
      const context=world.renderer.getContext(),extension=context.getExtension('WEBGL_debug_renderer_info');
      return {viewport:{width:innerWidth,height:innerHeight},cpuThrottle:4,samples:timings.length,medianFrameMs:sorted[45],p95FrameMs:sorted[85],inspect:window.__cubicles.inspect(),visibleFurnitureGroups:[...world.furnitureGroups.values()].filter(group=>group.visible).length,gpu:extension?context.getParameter(extension.UNMASKED_RENDERER_WEBGL):'unavailable',physicalMobileDevice:false,workload:{placedModels:30,uniqueModelAssets:30,trianglesPerModel:60000}};
    });
    expect(result.inspect.ready).toBe(true);expect(result.inspect.drawCalls).toBeGreaterThan(0);
    expect(result.p95FrameMs).toBeLessThan(250);
    await mkdir(path.resolve('.tmp/acceptance'),{recursive:true});
    await writeFile(path.resolve('.tmp/acceptance/browser-profile.json'),JSON.stringify(result,null,2));
  } finally {await session.send('Emulation.setCPUThrottlingRate',{rate:1});}
});

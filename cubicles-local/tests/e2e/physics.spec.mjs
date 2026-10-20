import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function enter(page){
  expect((await page.request.post('/api/login',{data:{username:'lzy',password:'123456'}})).ok()).toBe(true);
  await page.goto('/');
  if(await page.locator('.enter-button').count())await page.locator('.enter-button').click({timeout:90000});
  await page.waitForFunction(()=>window.__cubicles?.world.ready);
}

test('actual pavilion geometry allows walking inside, blocks columns and has a real ceiling',async({page})=>{
  await enter(page);
  const uploaded=await page.request.post('/api/admin/models?filename=physics-pavilion.glb&name=碰撞验收凉亭&scale=4',{headers:{'Content-Type':'model/gltf-binary'},data:await readFile(new URL('../../public/examples/grid-pavilion.glb',import.meta.url))});
  expect(uploaded.ok()).toBe(true);const asset=(await uploaded.json()).asset;
  const snapshot=await(await page.request.get('/api/world')).json();
  const building={id:'model-physics-pavilion',kind:'custom',name:'碰撞验收凉亭',assetId:asset.id,gridX:80,gridZ:70,width:4,depth:4,rotation:0,enabled:true,solid:true};
  const saved=await page.request.put('/api/admin/layout',{data:{baseRevision:snapshot.layoutRevision,buildings:[...snapshot.buildings,building]}});
  expect(saved.ok()).toBe(true);expect((await saved.json()).buildings.find(item=>item.id===building.id).collisionMode).toBe('mesh');
  await page.reload();await page.waitForFunction(()=>window.__cubicles?.world.buildingObjects.get('model-physics-pavilion')?.children.some(child=>child.type==='Group'));
  await page.evaluate(()=>{const {world}=window.__cubicles;world.teleport(82,75);world.yaw=0;world.zoomLevel=4;});
  await page.locator('#world').focus();await page.keyboard.down('w');
  await page.waitForFunction(()=>window.__cubicles.world.position.z<72.3);await page.keyboard.up('w');
  await page.waitForFunction(()=>window.__cubicles.world.grounded);
  expect(await page.evaluate(()=>window.__cubicles.world.position.y)).toBeCloseTo(.3,2);
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.__cubicles.world.position.y>.6);
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.__cubicles.world.grounded);
  expect(await page.evaluate(()=>window.__cubicles.world.position.y)).toBeCloseTo(.3,2);
  const column=await page.evaluate(()=>{const {world}=window.__cubicles;world.teleport(83.5,75);return {x:world.position.x};});
  await page.keyboard.down('w');await page.waitForTimeout(800);await page.keyboard.up('w');
  const blocked=await page.evaluate(()=>window.__cubicles.world.inspect());
  expect(blocked.position.z).toBeGreaterThan(73.8);expect(blocked.position.x).toBeCloseTo(column.x,1);
  await page.evaluate(()=>window.__cubicles.world.teleport(82,72));await page.waitForFunction(()=>window.__cubicles.world.grounded);
  await page.screenshot({path:'test-results/physics-inside-pavilion.png',animations:'disabled'});
});

test('keyboard jumps can land on a workstation desk, show height to peers and fall when walking off',async({page,browser})=>{
  await enter(page);
  const setup=await page.evaluate(()=>{
    const {world,community}=window.__cubicles;const office=community.ownOffice();
    world.teleport(office.x,office.z+1.5);world.yaw=0;world.zoomLevel=4;
    const furniture=[{id:'physics-desk',itemId:'desk',x:0,z:0,rotation:0}];world.setFurniture(office,furniture);
    return {officeId:office.id,x:office.x,z:office.z};
  });
  await page.locator('#world').focus();await page.waitForFunction(()=>window.__cubicles.world.grounded);
  await page.keyboard.press('Space');await page.keyboard.down('w');
  await page.waitForFunction(({z})=>window.__cubicles.world.position.z<z+.1,setup);await page.keyboard.up('w');
  await page.waitForFunction(()=>window.__cubicles.world.grounded);
  const height=await page.evaluate(()=>window.__cubicles.world.position.y);expect(height).toBeGreaterThan(.7);expect(height).toBeLessThan(1);
  const observer=await browser.newContext();
  try{
    const origin=new URL(page.url()).origin;
    await observer.request.post(origin+'/api/session',{data:{}});
    await page.waitForTimeout(1100);
    const presence=await(await observer.request.post(origin+'/api/tick',{data:{x:0,z:0}})).json();
    expect(presence.players.some(player=>Math.abs(player.x-setup.x)<.3&&player.y>.7)).toBe(true);
  }finally{await observer.close();}
  await page.screenshot({path:'test-results/physics-standing-on-desk.png',animations:'disabled'});
  await page.keyboard.down('s');await page.waitForFunction(({z})=>window.__cubicles.world.position.z>z+1.1,setup);await page.keyboard.up('s');
  await page.waitForFunction(()=>window.__cubicles.world.grounded);
  expect(await page.evaluate(()=>window.__cubicles.world.position.y)).toBeLessThan(.1);
});

import { test, expect } from '@playwright/test';

async function login(page){
  await page.goto('/');
  await page.locator('#profile-name').waitFor({state:'attached'});
  if(await page.locator('.enter-button').count())await page.locator('.enter-button').click({timeout:90000});
  await page.locator('.account [data-action="login"]').click();
  await page.locator('#login-form [name="username"]').fill('lzy');
  await page.locator('#login-form [name="password"]').fill('123456');
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('#profile-name')).toHaveText('社区管理员');
}

async function openOffice(page){
  await page.evaluate(()=>{const {world,community}=window.__cubicles;const office=community.ownOffice();world.teleport(office.x,office.z+1.5);});
  await page.waitForTimeout(1200);await page.keyboard.press('b');
  await expect(page.locator('#furniture-form')).toBeVisible();
  await page.waitForTimeout(800);
}

async function points(page,id,deltaX,deltaZ,office=false){
  return page.evaluate(({id,deltaX,deltaZ,office})=>{
    const {world,community}=window.__cubicles;
    const box=world.placementBox(id,office?community.ownOffice().id:undefined);
    const point=box.getCenter(world.position.clone());
    const destination=point.clone();destination.x+=deltaX;destination.z+=deltaZ;
    const rect=world.canvas.getBoundingClientRect();
    const project=vector=>{vector.project(world.camera);return {x:rect.left+(vector.x+1)/2*rect.width,y:rect.top+(1-vector.y)/2*rect.height};};
    return {start:project(point),end:project(destination)};
  },{id,deltaX,deltaZ,office});
}

async function drag(page,coordinates){
  await page.mouse.move(coordinates.start.x,coordinates.start.y);await page.mouse.down();
  await page.mouse.move(coordinates.end.x,coordinates.end.y,{steps:8});await page.mouse.up();
}

test('3D furniture can be picked, dragged, rotated, recovered and saved without a virtual board',async({page})=>{
  await login(page);await openOffice(page);
  await expect(page.locator('#furniture-floor')).toHaveCount(0);
  const original=await page.evaluate(()=>structuredClone(window.__cubicles.community.draft.furniture));
  await drag(page,await points(page,'base-lamp',-.5,0,true));
  expect(await page.evaluate(()=>window.__cubicles.community.selectedItem)).toBe('base-lamp');
  expect(await page.evaluate(()=>window.__cubicles.community.draft.furniture.find(item=>item.id==='base-lamp').x)).toBe(.75);
  await page.keyboard.press('r');
  expect(await page.evaluate(()=>window.__cubicles.community.draft.furniture.find(item=>item.id==='base-lamp').rotation)).toBe(15);
  await page.locator('[data-editor-action="undo"]').click();
  await page.locator('[data-editor-action="undo"]').click();
  expect(await page.evaluate(()=>window.__cubicles.community.draft.furniture)).toEqual(original);
  await drag(page,await points(page,'base-lamp',-3,0,true));
  expect(await page.evaluate(()=>window.__cubicles.community.draft.furniture)).toEqual(original);
  await expect(page.locator('.toast').filter({hasText:'已恢复拖动前的位置'})).toBeVisible();
  expect(await page.evaluate(()=>window.__cubicles.community.history.future.length)).toBe(2);
  const pick=await points(page,'base-lamp',0,0,true);await page.mouse.click(pick.start.x,pick.start.y);await page.keyboard.press('Delete');
  expect(await page.evaluate(()=>window.__cubicles.community.draft.furniture.some(item=>item.id==='base-lamp'))).toBe(false);
  await page.locator('[data-editor-action="undo"]').click();
  await drag(page,await points(page,'base-lamp',-.5,0,true));
  await page.locator('#furniture-form button[type="submit"]').click();
  await expect(page.locator('#furniture-form')).toHaveCount(0);
  await page.reload();await expect(page.locator('#profile-name')).toHaveText('社区管理员');
  const saved=await (await page.request.get('/api/world')).json();
  const userId=await page.evaluate(()=>window.__cubicles.state.user.id);
  expect(saved.offices.find(office=>office.ownerId===userId).furniture.find(item=>item.id==='base-lamp').x).toBe(.75);
  await openOffice(page);await page.screenshot({path:'test-results/direct-office-placement.png'});
  await page.keyboard.press('Escape');
});

test('world scenery is directly editable and collected legacy objects stay removed after reload',async({page})=>{
  await login(page);
  await page.locator('.account [data-action="admin"]').click();await page.locator('[data-admin-tab="world"]').click();await page.locator('[data-action="world-editor"]').click();
  await expect(page.locator('.world-layout-overlay')).toHaveClass(/is-preview/);
  await page.locator('[data-world-building="prop-legacy-0"]').click();await page.waitForTimeout(1000);
  const before=await page.evaluate(()=>structuredClone(window.__cubicles.layoutEditor.selected()));
  await drag(page,await points(page,before.id,2,0));
  expect(await page.evaluate(()=>window.__cubicles.layoutEditor.selected().gridX)).toBe(before.gridX+2);
  await page.keyboard.press('r');
  expect(await page.evaluate(()=>window.__cubicles.layoutEditor.selected().rotation)).toBe(90);
  await page.locator('[data-world-action="undo"]').click();
  await page.locator('[data-add-world-prop="streetlight"]').click();
  const propId=await page.evaluate(()=>window.__cubicles.layoutEditor.selectedId);
  const x=page.locator('#building-transform-form [name="gridX"]'),z=page.locator('#building-transform-form [name="gridZ"]');
  await x.fill('110');await x.press('Tab');await z.fill('90');await z.press('Tab');
  await expect(page.locator('[data-world-action="save"]')).toBeEnabled();
  await page.waitForFunction(()=>{const {world,layoutEditor}=window.__cubicles;const selected=layoutEditor.selected();return Math.abs(world.focus.x-selected.gridX-selected.width/2)<.1&&Math.abs(world.focus.z-selected.gridZ-selected.depth/2+1.6)<.1;});
  await page.screenshot({path:'test-results/direct-world-placement.png'});
  await page.locator('[data-world-action="save"]').click();await expect(page.locator('.world-layout-overlay')).toHaveCount(0);
  let saved=await (await page.request.get('/api/world')).json();expect(saved.grid.size).toBe(280);expect(saved.buildings.find(building=>building.id===propId).gridX).toBe(110);
  await page.locator('.account [data-action="admin"]').click();await page.locator('[data-action="world-editor"]').click();
  await page.locator(`[data-world-building="${before.id}"]`).click();await page.locator('[data-world-action="remove"]').click();
  await page.locator('[data-world-action="save"]').click();await expect(page.locator('.world-layout-overlay')).toHaveCount(0);
  await page.reload();await expect(page.locator('#profile-name')).toHaveText('社区管理员');
  saved=await (await page.request.get('/api/world')).json();expect(saved.buildings.some(building=>building.id===before.id)).toBe(false);
});

test.describe('touch viewport',()=>{
 test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 test('mobile editing leaves the 3D canvas available above the compact dock',async({page})=>{
  await login(page);await openOffice(page);
  const dock=await page.locator('.editor-dock').boundingBox();expect(dock.y).toBeGreaterThan(420);expect(dock.width).toBeLessThanOrEqual(390);
  const pick=await points(page,'base-lamp',-.5,0,true);expect(pick.start.y).toBeLessThan(dock.y);
  const originalX=await page.evaluate(()=>window.__cubicles.community.draft.furniture.find(item=>item.id==='base-lamp').x);
  const touch=await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pick.start]});
  for(let step=1;step<=8;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pick.start.x+(pick.end.x-pick.start.x)*step/8,y:pick.start.y+(pick.end.y-pick.start.y)*step/8}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();
  expect(await page.evaluate(()=>window.__cubicles.community.selectedItem)).toBe('base-lamp');
  expect(await page.evaluate(()=>window.__cubicles.community.draft.furniture.find(item=>item.id==='base-lamp').x)).toBeLessThan(originalX);
  await expect(page.locator('[data-remove-item]')).toBeInViewport();
  await page.screenshot({path:'test-results/direct-placement-mobile.png'});
  await page.keyboard.press('Escape');expect(await page.evaluate(()=>Boolean(window.__cubicles.world.placement))).toBe(false);
 });
});

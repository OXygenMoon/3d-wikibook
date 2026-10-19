import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'cubicles-community-'));process.env.CUBICLES_DATA_DIR=directory;process.env.PGLITE_DIR=join(directory,'pglite');process.env.CUBICLES_DB_RESET='1';process.env.AUTO_IMPORT='false';process.env.NODE_ENV='test';
const {server,getCommunityState}=await import('../server.mjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
after(async()=>{await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});});
async function call(path,data,token,method=data?'POST':'GET'){const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{'X-Session-Token':token}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')};}
const move=(token,x,z)=>call('/api/tick',{x,z},token);
let admin,user,world;
test('password login, httpOnly cookie, no credential disclosure and admin authorization',async()=>{
 assert.equal((await call('/api/login',{username:'lzy',password:'wrong'})).status,401);
 const login=await call('/api/login',{username:'lzy',password:'123456'});assert.equal(login.status,200);admin=login.data.token;assert.match(login.cookie,/HttpOnly/);assert.equal(login.data.user.role,'admin');assert.equal(login.data.user.passwordHash,undefined);
 const guest=(await call('/api/session',{})).data.token;assert.equal((await call('/api/admin',null,guest)).status,401);assert.equal((await call('/api/admin')).status,401);
 const cookieMe=await fetch(base+'/api/me',{headers:{Cookie:login.cookie.split(';')[0]}});assert.equal((await cookieMe.json()).user.username,'lzy');
 world=(await call('/api/world')).data;assert.equal(world.offices.length,24);assert.equal(world.zones[0].spacing,7);const health=await (await fetch(base+'/healthz')).json();assert.equal(health.database,'up');assert.equal(health.service,'cubicles');
});
test('atomic CSV-style batch registration allocates desks and rejects duplicates/capacity issues',async()=>{
 const imported=await call('/api/admin/import',{users:[{username:'student01',password:'abcdef',name:'小林',className:'创想一班'},{username:'student02',password:'123456',name:'小雨',className:'创想一班'}]},admin);assert.equal(imported.status,201);assert.equal(imported.data.created,2);assert.notEqual(imported.data.users[0].officeId,imported.data.users[1].officeId);
 const bad=await call('/api/admin/import',{users:[{username:'newuser',password:'123456',name:'新用户',className:'创想一班'},{username:'student01',password:'123456',name:'重复',className:'创想一班'}]},admin);assert.equal(bad.status,409);assert.equal((await call('/api/admin',null,admin)).data.users.length,3);
 user=(await call('/api/login',{username:'student01',password:'abcdef'})).data;assert.equal((await call('/api/admin',null,user.token)).status,403);
});
test('zone creation, spacing changes, overlap guards and reassignment preserve ownership',async()=>{
 const created=await call('/api/admin/zones',{name:'创想二班',x:40,z:-5,rows:2,columns:2,spacing:7,color:'#abc123'},admin);assert.equal(created.status,201);assert.equal(created.data.offices.length,28);
 const z=created.data.zones[0];const adjusted=await call('/api/admin/zones/1',{...z,spacing:8},admin,'PATCH');assert.equal(adjusted.status,200);assert.equal(adjusted.data.offices[0].ownerId,world.offices[0].ownerId);assert.equal(adjusted.data.offices[0].x,-19.5);
 assert.equal((await call('/api/admin/zones',{name:'重叠',x:0,z:0,rows:2,columns:2,spacing:7},admin)).status,409);
 assert.equal((await call('/api/admin/zones',{name:'池塘冲突',x:-34,z:35,rows:2,columns:2,spacing:7},admin)).status,409);
 assert.equal((await call('/api/admin/assign',{userId:user.user.id,officeId:1001},admin)).status,409);
 const moved=await call('/api/admin/assign',{userId:user.user.id,officeId:2001},admin);assert.equal(moved.status,200);assert.equal(moved.data.user.classId,2);user.user=moved.data.user;
});
test('owner-only on-site furniture edits validate inventory and survive disk persistence',async()=>{
 world=(await call('/api/world')).data;const own=world.offices.find(o=>o.id===2001),other=world.offices.find(o=>o.id===1001);
 assert.equal((await call('/api/offices/1001',{name:'盗改'},user.token,'PATCH')).status,403);
 await move(user.token,0,24);assert.equal((await call('/api/offices/2001',{name:'远程修改'},user.token,'PATCH')).status,403);
 await move(user.token,own.x,own.z+2.5);
 const furniture=structuredClone(own.furniture);furniture.find(f=>f.itemId==='plant').rotation=45;
 assert.equal((await call('/api/offices/2001',{name:'小林的创作间',furniture},user.token,'PATCH')).status,200);
 const over=[...furniture,{id:'extra-monitor',itemId:'monitor',x:0,z:-.65,rotation:0}];assert.equal((await call('/api/offices/2001',{furniture:over},user.token,'PATCH')).status,400);
 furniture[0].x=20;assert.equal((await call('/api/offices/2001',{furniture},user.token,'PATCH')).status,400);
 const persisted=getCommunityState();assert.equal(persisted.officeStyles[2001].name,'小林的创作间');assert.equal(persisted.users.find(u=>u.username==='lzy').passwordHash.includes('123456'),false);
 assert.equal((await call('/api/admin/assign',{userId:user.user.id,officeId:2002},admin)).status,200);const saved=(await call('/api/world')).data.offices.find(o=>o.id===2002);assert.equal(saved.name,'小林的创作间');assert.equal(saved.furniture.find(f=>f.itemId==='plant').rotation,45);
});
test('public areas require arrival, stickers persist, rankings and tasks use server scores',async()=>{
 await move(user.token,0,24);for(const path of ['/api/stickers','/api/rankings','/api/lab'])assert.equal((await call(path,null,user.token)).status,403);
 await move(user.token,0,39);assert.equal((await call('/api/stickers',{text:'一起成长',color:'#b7cfaa'},user.token)).status,201);assert.equal((await call('/api/stickers',null,user.token)).data.stickers[0].text,'一起成长');
 await move(user.token,0,-28);assert.equal((await call('/api/lab',null,user.token)).data.tasks.length,2);assert.equal((await call('/api/lab/complete',{taskId:'orientation'},user.token)).data.user.score,5);assert.equal((await call('/api/lab/complete',{taskId:'orientation'},user.token)).data.user.score,5);
 await move(user.token,30,40);assert.equal((await call('/api/rankings',null,user.token)).data.users[0].score,5);
 await move(user.token,-34,42);assert.equal((await call('/api/fishing/reel',{},user.token)).status,400);assert.equal((await call('/api/fishing/cast',{},user.token)).status,200);
});
test('night settings, online/offline heartbeat and chat, logout revokes session',async()=>{
 assert.equal((await call('/api/admin/settings',{timeMode:'manual',hour:22},admin,'PATCH')).status,200);await move(user.token,10,20);const presence=(await move(admin,1,2)).data;assert.equal(presence.settings.hour,22);assert.ok(presence.onlineUserIds.includes(user.user.id));
 assert.equal((await call('/api/messages',{text:'你好，伙伴'},user.token)).status,201);assert.equal((await move(admin,1,2)).data.messages.at(-1).text,'你好，伙伴');
 assert.equal((await call('/api/logout',{},user.token)).status,200);assert.equal((await call('/api/me',null,user.token)).status,401);assert.ok(!(await move(admin,1,2)).data.onlineUserIds.includes(user.user.id));
 for(const path of ['/server.mjs','/.local-data/community.json'])assert.equal((await fetch(base+path)).status,403);assert.equal((await fetch(base+'/')).status,200);
});

test('concurrent imports cannot duplicate a username or allocate the same desk',async()=>{
 const payload={users:[{username:'concurrent',password:'123456',name:'并发测试',className:'创想一班'}]};
 const result=await Promise.all([call('/api/admin/import',payload,admin),call('/api/admin/import',payload,admin)]);
 assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);
 const users=(await call('/api/admin',null,admin)).data.users;assert.equal(users.filter(u=>u.username==='concurrent').length,1);
 assert.equal(new Set(users.map(u=>u.officeId)).size,users.length);
});

test('grid layout moves a class and its desks, rotates public buildings and moves their interaction entry',async()=>{
 const snapshot=(await call('/api/world')).data;const b=structuredClone(snapshot.buildings),zone=b.find(b=>b.id==='class-1');zone.gridZ+=4;for(const child of b.filter(b=>b.parentId===zone.id))child.gridZ+=4;
 const hall=b.find(b=>b.id==='hall');hall.gridX=44;hall.rotation=90;
 const saved=await call('/api/admin/layout',{baseRevision:snapshot.layoutRevision,buildings:b},admin,'PUT');assert.equal(saved.status,200);assert.equal(saved.data.offices[0].z,snapshot.offices[0].z+4);assert.equal(saved.data.offices[0].ownerId,snapshot.offices[0].ownerId);
 const area=saved.data.areas.find(a=>a.id==='hall');assert.deepEqual([area.x,area.z,area.rotation,area.entry.x,area.entry.z],[52,35,90,57,35]);
 await move(admin,30,40);assert.equal((await call('/api/rankings',null,admin)).status,403);await move(admin,area.entry.x,area.entry.z);assert.equal((await call('/api/rankings',null,admin)).status,200);
 assert.equal((await call('/api/admin/layout',{baseRevision:snapshot.layoutRevision,buildings:b},admin,'PUT')).status,409);
});

test('model upload is admin-only, durable and can be placed, validated, removed and reused',async()=>{
 const model=await readFile(new URL('../public/examples/grid-pavilion.glb',import.meta.url));const upload=async(buffer,token)=>{const res=await fetch(base+'/api/admin/models?filename=pavilion.glb&name='+encodeURIComponent('自制凉亭'),{method:'POST',headers:{'Content-Type':'model/gltf-binary',...(token?{'X-Session-Token':token}:{})},body:buffer});return {status:res.status,data:await res.json()};};
 assert.equal((await upload(model)).status,401);const student=(await call('/api/login',{username:'student01',password:'abcdef'})).data;assert.equal((await upload(model,student.token)).status,403);assert.equal((await upload(Buffer.from('not a glb'),admin)).status,400);
 const imported=await upload(model,admin);assert.equal(imported.status,201);assert.equal(imported.data.asset.name,'自制凉亭');const asset=imported.data.asset;assert.ok(asset.triangleCount>0);assert.deepEqual(Buffer.from(await (await fetch(base+asset.url)).arrayBuffer()),model);
 const snapshot=(await call('/api/world')).data;const custom={id:'model-test-pavilion',kind:'custom',name:'网格凉亭',gridX:-45,gridZ:-30,width:4,depth:6,rotation:90,assetId:asset.id,solid:true,enabled:true};
 assert.equal((await call('/api/admin/layout',{baseRevision:snapshot.layoutRevision,buildings:[...snapshot.buildings,custom]},student.token,'PUT')).status,403);
 const saved=await call('/api/admin/layout',{baseRevision:snapshot.layoutRevision,buildings:[...snapshot.buildings,custom]},admin,'PUT');assert.equal(saved.status,200);assert.equal(saved.data.buildings.find(b=>b.id===custom.id).rotation,90);assert.equal(saved.data.modelAssets[0].id,asset.id);
 const blocked=structuredClone(saved.data.buildings),candidate=blocked.find(b=>b.id===custom.id),region=blocked.find(b=>b.kind==='class');candidate.gridX=region.gridX;candidate.gridZ=region.gridZ;assert.equal((await call('/api/admin/layout',{baseRevision:saved.data.layoutRevision,buildings:blocked},admin,'PUT')).status,409);
 candidate.gridX=-45.5;candidate.gridZ=-30;assert.equal((await call('/api/admin/layout',{baseRevision:saved.data.layoutRevision,buildings:blocked},admin,'PUT')).status,409);
 const persisted=getCommunityState();assert.ok(persisted.buildings.some(b=>b.id===custom.id));assert.deepEqual(await readFile(join(directory,'models',asset.id+'.glb')),model);
 const without=saved.data.buildings.filter(b=>b.id!==custom.id);const removed=await call('/api/admin/layout',{baseRevision:saved.data.layoutRevision,buildings:without},admin,'PUT');assert.equal(removed.status,200);assert.equal((await fetch(base+asset.url)).status,200);
 const wall=removed.data.buildings.find(b=>b.id==='wall');wall.enabled=false;const closed=await call('/api/admin/layout',{baseRevision:removed.data.layoutRevision,buildings:removed.data.buildings},admin,'PUT');assert.equal(closed.status,200);assert.ok(!closed.data.areas.some(a=>a.id==='wall'));await move(admin,0,39);assert.equal((await call('/api/stickers',null,admin)).status,404);
});

test('personal models stay private, are listed only for their owner, and can be placed on the owner workstation',async()=>{
 const model=await readFile(new URL('../public/examples/grid-pavilion.glb',import.meta.url));
 const login=await call('/api/login',{username:'student01',password:'abcdef'});const token=login.data.token,uid=login.data.user.id;
 const upload=await fetch(base+'/api/models?filename=desk-toy.glb&name='+encodeURIComponent('工位小模型')+'&description=test&scale=1.2',{method:'POST',headers:{'Content-Type':'model/gltf-binary','X-Session-Token':token},body:model});
 assert.equal(upload.status,201);const asset=(await upload.json()).asset;assert.equal(asset.visibility,'private');assert.equal(asset.ownerId,uid);assert.ok(asset.width>0);
 const world=(await call('/api/world')).data;assert.ok(!world.modelAssets.some(item=>item.id===asset.id));
 const mine=await call('/api/models',null,token);assert.ok(mine.data.assets.some(item=>item.id===asset.id));
 assert.equal((await fetch(base+asset.url)).status,403);assert.equal((await fetch(base+asset.url,{headers:{Cookie:login.cookie.split(';')[0]}})).status,200);
 const office=world.offices.find(item=>item.ownerId===uid);await move(token,office.x,office.z+2.5);
 const furniture=[...office.furniture,{id:'personal-model-1',itemId:`model:${asset.id}`,x:0,z:0.5,rotation:0}];
 const saved=await call(`/api/offices/${office.id}`,{furniture},token,'PATCH');assert.equal(saved.status,200);
 const after=(await call('/api/world')).data;assert.ok(after.offices.find(item=>item.id===office.id).furniture.some(item=>item.itemId===`model:${asset.id}`));
 const snapshot=(await call('/api/world')).data;const custom={id:'model-private-test',kind:'custom',name:'私有模型',gridX:-45,gridZ:-30,width:4,depth:4,rotation:0,assetId:asset.id,solid:true,enabled:true};
 const denied=await call('/api/admin/layout',{baseRevision:snapshot.layoutRevision,buildings:[...snapshot.buildings,custom]},admin,'PUT');assert.equal(denied.status,400);
});
test('a public building can use a smaller imported appearance and return to its built-in footprint',async()=>{
 const snapshot=(await call('/api/world')).data,buildings=structuredClone(snapshot.buildings),pond=buildings.find(b=>b.id==='pond');pond.assetId=snapshot.modelAssets[0].id;pond.width=4;pond.depth=4;
 const replaced=await call('/api/admin/layout',{baseRevision:snapshot.layoutRevision,buildings},admin,'PUT');assert.equal(replaced.status,200);const area=replaced.data.areas.find(a=>a.id==='pond');await move(admin,area.entry.x,area.entry.z);assert.equal((await call('/api/fishing/cast',{},admin)).status,200);
 pond.assetId=null;pond.width=16;pond.depth=16;const restored=await call('/api/admin/layout',{baseRevision:replaced.data.layoutRevision,buildings},admin,'PUT');assert.equal(restored.status,200);assert.equal(restored.data.areas.find(a=>a.id==='pond').assetId,null);
});

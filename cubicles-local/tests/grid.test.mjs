import {test} from 'node:test';import assert from 'node:assert/strict';
import {GRID,footprint,layoutErrors,areaForBuilding,zoneBuilding,officeBuilding,defaultBuildings,defaultWorldProps,firstFree} from '../src/grid.js';
import {generateOffices,DEFAULT_ZONES,BASE_PUBLIC_AREAS} from '../src/community.js';
test('grid occupancy rotates rectangles, permits shared edges and rejects overlaps and non-grid positions',()=>{const a={id:'a',name:'A',gridX:0,gridZ:0,width:4,depth:6,rotation:90};assert.deepEqual(footprint(a),{x:0,z:0,w:6,d:4});const b={...a,id:'b',name:'B',gridX:6};assert.equal(layoutErrors([a,b]).length,0);b.gridX=5;assert.match(layoutErrors([a,b])[0],/重叠/);b.gridX=6.5;assert.match(layoutErrors([a,b])[0],/不正确/);});
test('class footprints own their desk cells and all generated desks occupy exact integer cells',()=>{const zone=zoneBuilding(DEFAULT_ZONES[0]),desks=generateOffices(DEFAULT_ZONES).map(officeBuilding);assert.equal(layoutErrors([zone,...desks]).length,0);assert.ok(desks.every(d=>Number.isInteger(d.gridX)&&Number.isInteger(d.gridZ)));desks[0].gridX-=1;assert.match(layoutErrors([zone,...desks])[0],/班级区域内/);});
test('public entry points rotate and translate with the building',()=>{const a=areaForBuilding({id:'wall',name:'墙',kind:'wall',gridX:10,gridZ:20,width:16,depth:12,rotation:90},BASE_PUBLIC_AREAS.find(a=>a.id==='wall'));assert.deepEqual([a.x,a.z,a.entry.x,a.entry.z],[16,28,20,28]);});

test('a resized public model keeps its arrival point inside the interaction area',()=>{const a=areaForBuilding({id:'pond',name:'小池塘',kind:'pond',gridX:10,gridZ:20,width:2,depth:2,rotation:270},BASE_PUBLIC_AREAS.find(a=>a.id==='pond'));assert.ok(Math.hypot(a.entry.x-a.x,a.entry.z-a.z)<a.radius);});

test('expanded world shares placement bounds and legacy scenery has stable, nonoverlapping footprints',()=>{
 const buildings=[...DEFAULT_ZONES.map(zoneBuilding),...generateOffices(DEFAULT_ZONES).map(officeBuilding),...defaultBuildings(BASE_PUBLIC_AREAS),...defaultWorldProps()];
 assert.equal(GRID.size,280);assert.deepEqual(layoutErrors(buildings),[]);
 assert.deepEqual(defaultWorldProps(),defaultWorldProps());assert.equal(defaultWorldProps().length,72);
 const candidate={id:'expanded',name:'扩展地块',kind:'tree',gridX:120,gridZ:-130,width:3,depth:3,rotation:0};
 assert.deepEqual(layoutErrors([...buildings,candidate]),[]);
 candidate.gridX=139;assert.match(layoutErrors([candidate])[0],/边界/);
 const occupied=[{id:'center',gridX:-70,gridZ:-70,width:140,depth:140,rotation:0}];
 const free=firstFree(occupied,3,3);assert.ok(free);assert.ok(Math.abs(free.gridX)>=70||Math.abs(free.gridZ)>=70);
});

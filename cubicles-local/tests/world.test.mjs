import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OfficeWorld } from '../src/world.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { CollisionWorld } from '../src/collision-world.js';

async function renderBuilding(scale) {
  const geometry = new THREE.BoxGeometry(4, 3, 2);
  const material = new THREE.MeshBasicMaterial();
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(geometry, material));
  const asset = { id: 'test-model', width: 4, height: 3, depth: 2, scale };
  const environment = new THREE.Group();
  const world = {
    assetObject: OfficeWorld.prototype.assetObject,
    environment,
    modelAssets: [asset],
    importedCache: new Map([[asset.id, Promise.resolve({ scene })]]),
    emit: (type, detail) => assert.fail(`${type}: ${detail.message}`),
  };
  try {
    await OfficeWorld.prototype.addImportedBuilding.call(world, {
      name: 'Test building', assetId: asset.id, gridX: 0, gridZ: 0,
      width: 8, depth: 6, rotation: 0, solid: false,
    });
    return new THREE.Box3().setFromObject(environment).getSize(new THREE.Vector3());
  } finally {
    geometry.dispose();
    material.dispose();
  }
}

test('legacy buildings fit their footprint with missing or invalid model scales', async () => {
  for (const scale of [undefined, null, 0, -1, '', NaN, Infinity]) {
    const size = await renderBuilding(scale);
    assert.ok(Math.abs(size.x - 7.84) < 1e-6, `unexpected width for scale ${scale}: ${size.x}`);
    assert.ok(Math.abs(size.y - 5.88) < 1e-6);
    assert.ok(Math.abs(size.z - 3.92) < 1e-6);
  }
});

test('a failed imported model request is retried instead of remaining in the cache', async () => {
  const load = GLTFLoader.prototype.loadAsync;
  let attempts=0;
  const scene=new THREE.Group();
  GLTFLoader.prototype.loadAsync=async()=>{attempts+=1;if(attempts===1)throw new Error('temporary network failure');return {scene};};
  const world={importedCache:new Map()};
  try{
    await assert.rejects(OfficeWorld.prototype.assetObject.call(world,{id:'retry',url:'/uploads/retry.glb'}));
    assert.equal(world.importedCache.has('retry'),false);
    assert.equal(await OfficeWorld.prototype.assetObject.call(world,{id:'retry',url:'/uploads/retry.glb'}),scene);
    assert.equal(attempts,2);
  }finally{GLTFLoader.prototype.loadAsync=load;}
});

test('new buildings preserve the selected model scale', async () => {
  const size = await renderBuilding(1.2);
  assert.ok(Math.abs(size.x - 1.2) < 1e-6);
  assert.ok(Math.abs(size.y - 0.9) < 1e-6);
  assert.ok(Math.abs(size.z - 0.6) < 1e-6);
});

test('distant workstation models load only when approached and retain their colliders', async () => {
  const group = new THREE.Group();
  group.position.set(60,0,0);
  group.userData.models=[{placed:{id:'distant'},asset:{id:'distant-asset'},started:false,retryAt:0}];
  let loaded=0;
  const world={position:new THREE.Vector3(),furnitureGroups:new Map([[1,group]]),furnitureColliders:new Map([[1,[{x:60,z:0,w:.5,d:.5}]]]),addCustomFurniture:async()=>{loaded+=1;return true;}};
  OfficeWorld.prototype.updateFurnitureDetails.call(world);
  assert.equal(group.visible,false);
  assert.equal(loaded,0);
  assert.equal(world.furnitureColliders.get(1).length,1);
  world.position.x=55;
  OfficeWorld.prototype.updateFurnitureDetails.call(world);
  await Promise.resolve();
  assert.equal(group.visible,true);
  assert.equal(loaded,1);
  OfficeWorld.prototype.updateFurnitureDetails.call(world);
  assert.equal(loaded,1);
});

test('picking bounds update fresh furniture parent transforms before the next render frame',()=>{
 const office=new THREE.Group();office.position.set(100,0,-100);
 const object=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());object.position.set(1,0,1);object.userData.placementId='new-furniture';office.add(object);
 try{
  const world={furnitureGroups:new Map([[1001,office]])};
  const bounds=OfficeWorld.prototype.placementBox.call(world,'new-furniture',1001);
  assert.deepEqual(bounds.getCenter(new THREE.Vector3()).toArray(),[101,0,-99]);
 }finally{object.geometry.dispose();object.material.dispose();}
});

test('world building collision modes use actual transformed geometry even for legacy solid flags',async()=>{
 const bytes=await readFile(new URL('../public/examples/grid-pavilion.glb',import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 for(const collisionMode of [undefined,'mesh','solid','none']){
  const world={environment:new THREE.Group(),physics:new CollisionWorld(),buildingObjects:new Map(),modelAssets:[{id:'pavilion',width:4,height:3.225,depth:4,scale:4}],assetObject:async()=>gltf.scene,emit:()=>assert.fail('model failed')};
  await OfficeWorld.prototype.addImportedBuilding.call(world,{id:'pavilion',assetId:'pavilion',name:'凉亭',gridX:10,gridZ:-10,width:4,depth:4,rotation:90,solid:true,collisionMode});
  assert.equal(world.physics.clearAt(new THREE.Vector3(12,.301,-8)),collisionMode!=='solid',String(collisionMode));
  assert.equal(world.physics.clearAt(new THREE.Vector3(13.5,.301,-6.5)),collisionMode==='none',String(collisionMode));
 }
});

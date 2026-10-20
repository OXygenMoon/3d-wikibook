import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CollisionWorld, CHARACTER, jumpCharacter, stepCharacter } from '../src/collision-world.js';

function actor(position=new THREE.Vector3()) {return {position,velocityY:0,jumpCount:0,grounded:false};}
function simulate(physics,person,seconds,velocity=new THREE.Vector3()){
  for(let frame=0;frame<Math.ceil(seconds*120);frame++)stepCharacter(physics,person,velocity,1/120);
}
function box(width,height,depth,position){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),new THREE.MeshBasicMaterial());mesh.position.copy(position);return mesh;
}

test('a hollow pavilion can be entered, its pillars block, and its floor is a small walkable step',()=>{
  const physics=new CollisionWorld(),pavilion=new THREE.Group();
  pavilion.add(box(4,.15,4,new THREE.Vector3(0,.075,0)),box(4,.25,4,new THREE.Vector3(0,3.1,0)));
  for(const positionX of [-1.7,1.7])for(const positionZ of [-1.7,1.7])pavilion.add(box(.25,3,.25,new THREE.Vector3(positionX,1.5,positionZ)));
  physics.setObject('pavilion',pavilion);
  const person=actor(new THREE.Vector3(0,0,3));simulate(physics,person,1,new THREE.Vector3(0,0,-3));
  assert.ok(Math.abs(person.position.z)<.05,JSON.stringify(person.position));assert.ok(Math.abs(person.position.y-.15)<.002);assert.equal(person.grounded,true);
  assert.equal(physics.canWalk(new THREE.Vector3(0,0,0)),true);
  assert.equal(physics.clearAt(new THREE.Vector3(1.7,.15,1.7)),false);
  const blocked=actor(new THREE.Vector3(1.7,0,3));simulate(physics,blocked,1,new THREE.Vector3(0,0,-3));
  assert.ok(blocked.position.z>2,JSON.stringify(blocked.position));
});

test('the actual exported pavilion retains its entrance and blocks its columns',async()=>{
  const bytes=await readFile(new URL('../public/examples/grid-pavilion.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const physics=new CollisionWorld();physics.setObject('actual-pavilion',gltf.scene);
  const person=actor(new THREE.Vector3(0,0,3));simulate(physics,person,1,new THREE.Vector3(0,0,-3));
  assert.ok(Math.abs(person.position.z)<.1,JSON.stringify(person.position));assert.ok(Math.abs(person.position.y-.3)<.002);
  assert.equal(physics.clearAt(new THREE.Vector3(1.5,.3,1.5)),false);
});

test('jumping onto a desk lands on its actual surface, walking off falls, and landing resets jumps',()=>{
  const physics=new CollisionWorld();physics.setObject('desk',box(1.64,.78,.8,new THREE.Vector3(0,.39,0)));
  const person=actor(new THREE.Vector3(0,0,1.2));simulate(physics,person,.05);
  assert.equal(jumpCharacter(person,physics),true);
  simulate(physics,person,.35,new THREE.Vector3(0,0,-3));simulate(physics,person,.8);
  assert.ok(Math.abs(person.position.y-.78)<.002,JSON.stringify(person));assert.equal(person.grounded,true);assert.equal(person.jumpCount,0);
  simulate(physics,person,.6,new THREE.Vector3(3,0,0));simulate(physics,person,.8);
  assert.ok(person.position.x>1.5);assert.ok(person.position.y<.002);assert.equal(person.jumpCount,0);
});

test('a second jump works away from the apex, never permits a third, and works again after landing',()=>{
  const physics=new CollisionWorld(),person=actor();simulate(physics,person,.05);
  assert.equal(jumpCharacter(person,physics),true);simulate(physics,person,.08);
  assert.ok(person.velocityY>2);assert.equal(jumpCharacter(person,physics),true);assert.equal(person.jumpCount,2);
  assert.equal(jumpCharacter(person,physics),false);simulate(physics,person,2);
  assert.equal(person.jumpCount,0);assert.equal(jumpCharacter(person,physics),true);
});

test('a second jump reaches and lands on a surface above the first-jump apex',()=>{
  const physics=new CollisionWorld();physics.setObject('high-platform',box(3,2.1,2,new THREE.Vector3(0,1.05,0)));
  const person=actor(new THREE.Vector3(0,0,2));simulate(physics,person,.05);jumpCharacter(person,physics);simulate(physics,person,.3);
  assert.equal(jumpCharacter(person,physics),true);simulate(physics,person,.35,new THREE.Vector3(0,0,-3));simulate(physics,person,1);
  assert.ok(Math.abs(person.position.y-2.1)<.002,JSON.stringify(person));assert.equal(person.grounded,true);assert.equal(person.jumpCount,0);
});

test('roofs stop upward motion and cannot be jumped through',()=>{
  const physics=new CollisionWorld();physics.setObject('ceiling',box(5,.2,5,new THREE.Vector3(0,2.25,0)));
  const person=actor();simulate(physics,person,.05);jumpCharacter(person,physics);
  let maximum=0;
  for(let frame=0;frame<180;frame++){stepCharacter(physics,person,new THREE.Vector3(),1/120);maximum=Math.max(maximum,person.position.y);}
  assert.ok(maximum+CHARACTER.height<=2.151,maximum);assert.equal(person.grounded,true);
});

test('thin rotated surfaces stop running even at a long frame interval and allow wall sliding',()=>{
  const physics=new CollisionWorld();const wall=box(.025,3,60,new THREE.Vector3());wall.position.y=1.5;wall.rotation.y=Math.PI/4;physics.setObject('wall',wall);
  const person=actor(new THREE.Vector3(2,0,0));simulate(physics,person,.03);
  for(let frame=0;frame<40;frame++)stepCharacter(physics,person,new THREE.Vector3(-7,0,0),.045);
  assert.ok(person.position.x-person.position.z>.3,JSON.stringify(person.position));assert.ok(Math.abs(person.position.z)>1);
});

test('nonuniform model transforms preserve thin columns, elevated clearances and reusable indices',()=>{
  const physics=new CollisionWorld(),geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshBasicMaterial();
  const column=new THREE.Mesh(geometry,material);column.scale.set(.2,3,.2);column.position.set(10,1.5,5);column.rotation.y=Math.PI/4;
  physics.setObject('column',column);
  assert.equal(physics.clearAt(new THREE.Vector3(10,0,5)),false);assert.equal(physics.clearAt(new THREE.Vector3(10.6,0,5)),true);
  const indices=physics.indices.size;const second=column.clone();second.position.x=20;physics.setObject('second',second);
  assert.equal(physics.clearAt(new THREE.Vector3(20,0,5)),false);assert.equal(physics.indices.size,indices);
  physics.remove('column');assert.equal(physics.clearAt(new THREE.Vector3(10,0,5)),true);
});

test('removing a supporting model immediately releases the actor instead of leaving an invisible platform',()=>{
  const physics=new CollisionWorld();physics.setBoxes('platform',[{x:0,z:0,w:2,d:2,top:1}]);
  const person=actor(new THREE.Vector3(0,1,0));simulate(physics,person,.05);assert.equal(person.grounded,true);
  physics.remove('platform');simulate(physics,person,1);assert.ok(person.position.y<.002);
});

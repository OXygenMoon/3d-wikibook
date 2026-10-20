import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ScenePlacement } from '../src/scene-placement.js';

function fixture() {
  const camera=new THREE.PerspectiveCamera(45,1,.1,100);
  camera.position.set(0,8,8);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const root=new THREE.Group();root.userData.placementId='editable';
  const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshBasicMaterial();
  root.add(new THREE.Mesh(geometry,material));root.updateMatrixWorld(true);
  const calls=[];
  let captured=false;
  const world={camera,raycaster:new THREE.Raycaster(),scene:new THREE.Scene(),canvas:{getBoundingClientRect:()=>({left:20,top:30,width:600,height:600}),setPointerCapture:()=>{captured=true;},hasPointerCapture:()=>captured,releasePointerCapture:()=>{captured=false;}}};
  const placement=new ScenePlacement(world,{targets:()=>[root],select:id=>calls.push(['select',id]),begin:id=>calls.push(['begin',id]),move:(id,deltaX,deltaZ)=>calls.push(['move',id,deltaX,deltaZ]),end:id=>calls.push(['end',id]),cancel:id=>calls.push(['cancel',id]),box:()=>new THREE.Box3().setFromObject(root)});
  const event={button:0,pointerId:1,clientX:320,clientY:330,preventDefault:()=>{}};
  return {placement,calls,event,world,dispose:()=>{placement.dispose();geometry.dispose();material.dispose();}};
}

test('scene placement raycasts nested meshes, preserves grab offset and records a single gesture',()=>{
  const context=fixture();
  try{
    const {placement,calls,event}=context;
    assert.equal(placement.down(event),true);
    assert.deepEqual(calls,[['select','editable']]);
    assert.equal(placement.selection.visible,true);
    placement.move({...event,clientX:322});
    assert.equal(calls.length,1);
    placement.move({...event,clientX:350});
    placement.move({...event,clientX:380});
    placement.up(event);
    assert.equal(calls.filter(call=>call[0]==='begin').length,1);
    const moves=calls.filter(call=>call[0]==='move');
    assert.ok(moves[0][2]>0);
    assert.ok(Math.abs(moves[1][2]-moves[0][2]*2)<1e-9);
    assert.ok(Math.abs(moves[0][3])<1e-9);
    assert.deepEqual(calls.at(-1),['end','editable']);
    assert.equal(placement.drag,null);
  }finally{context.dispose();}
});

test('canceled and locked scene gestures cannot commit changes or select foreign objects',()=>{
  const context=fixture();
  try{
    const {placement,calls,event}=context;
    placement.down(event);placement.move({...event,clientX:350});placement.up(event,true);
    assert.deepEqual(calls.at(-1),['cancel','editable']);
    assert.equal(calls.some(call=>call[0]==='end'),false);
    placement.options.locked=()=>true;
    assert.equal(placement.down(event),false);
    placement.options.locked=()=>false;placement.options.targets=()=>[];
    assert.equal(placement.down(event),false);
    assert.equal(placement.down({...event,button:2}),false);
  }finally{context.dispose();}
});

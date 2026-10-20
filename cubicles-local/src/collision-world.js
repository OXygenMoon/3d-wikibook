import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { Octree } from 'three/addons/math/Octree.js';
import { GRID } from './grid.js';

export const CHARACTER={radius:.22,height:1.85,stepHeight:.35,gravity:18,jumpSpeed:7.6,secondJumpSpeed:6};
const skin=.0001;
const narrowPhase=new Octree();
const unitBox=new THREE.BoxGeometry(1,1,1);

function capsuleAt(position){
  return new Capsule(new THREE.Vector3(position.x,position.y+CHARACTER.radius,position.z),new THREE.Vector3(position.x,position.y+CHARACTER.height-CHARACTER.radius,position.z),CHARACTER.radius);
}

function capsuleBounds(capsule){
  return new THREE.Box3().setFromPoints([capsule.start,capsule.end]).expandByScalar(capsule.radius);
}

function buildTree(triangles){
  const bounds=new THREE.Box3();
  for(const triangle of triangles)bounds.union(triangle.bounds);
  if(triangles.length<=16)return {bounds,triangles};
  const extent=bounds.getSize(new THREE.Vector3());
  const axis=extent.x>=extent.y&&extent.x>=extent.z?'x':extent.y>=extent.z?'y':'z';
  triangles.sort((left,right)=>left.center[axis]-right.center[axis]);
  const middle=Math.floor(triangles.length/2);
  return {bounds,left:buildTree(triangles.slice(0,middle)),right:buildTree(triangles.slice(middle))};
}

function createIndex(geometry,matrix){
  const positions=geometry.getAttribute('position'),indices=geometry.index,triangles=[];
  const count=indices?indices.count:positions.count;
  const reversed=matrix.determinant()<0;
  for(let offset=0;offset+2<count;offset+=3){
    const vertices=[0,1,2].map(index=>new THREE.Vector3().fromBufferAttribute(positions,indices?indices.getX(offset+index):offset+index).applyMatrix4(matrix));
    if(reversed)[vertices[1],vertices[2]]=[vertices[2],vertices[1]];
    const triangle=new THREE.Triangle(...vertices);
    if(triangle.getArea()<1e-12)continue;
    triangles.push({triangle,bounds:new THREE.Box3().setFromPoints(vertices),center:triangle.getMidpoint(new THREE.Vector3())});
  }
  return {root:triangles.length?buildTree(triangles):null,count:triangles.length};
}

function visitTree(node,bounds,callback){
  if(!node||!node.bounds.intersectsBox(bounds))return;
  if(node.triangles){for(const item of node.triangles)if(item.bounds.intersectsBox(bounds))callback(item.triangle);}
  else{visitTree(node.left,bounds,callback);visitTree(node.right,bounds,callback);}
}

export class CollisionWorld {
  constructor(){this.owners=new Map();this.cells=new Map();this.indices=new Map();this.indexTriangles=0;}
  remove(owner){
    for(const entry of this.owners.get(owner)||[])for(const key of entry.cells){const cell=this.cells.get(key);cell?.delete(entry);if(!cell?.size)this.cells.delete(key);}
    this.owners.delete(owner);
  }
  keys(bounds){
    const result=[];
    for(let cellX=Math.floor(bounds.min.x/4);cellX<=Math.floor(bounds.max.x/4);cellX++)for(let cellZ=Math.floor(bounds.min.z/4);cellZ<=Math.floor(bounds.max.z/4);cellZ++)result.push(`${cellX},${cellZ}`);
    return result;
  }
  add(owner,geometry,matrix){
    if(!geometry?.getAttribute('position'))return;
    if(!geometry.boundingBox)geometry.computeBoundingBox();
    const bounds=geometry.boundingBox.clone().applyMatrix4(matrix);
    if(bounds.isEmpty())return;
    const linear=matrix.clone();linear.setPosition(0,0,0);
    const entry={geometry,linear,translation:new THREE.Vector3().setFromMatrixPosition(matrix),bounds,cells:this.keys(bounds),signature:linear.elements.map(value=>Number(value.toFixed(9))).join(',')};
    if(!this.owners.has(owner))this.owners.set(owner,[]);
    this.owners.get(owner).push(entry);
    for(const key of entry.cells){if(!this.cells.has(key))this.cells.set(key,new Set());this.cells.get(key).add(entry);}
    return entry;
  }
  setObject(owner,object){
    this.remove(owner);object.updateWorldMatrix(true,true);
    const instanceMatrix=new THREE.Matrix4();
    object.traverse(mesh=>{
      if(!mesh.isMesh)return;
      if(mesh.isInstancedMesh){for(let index=0;index<mesh.count;index++){mesh.getMatrixAt(index,instanceMatrix);this.add(owner,mesh.geometry,new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld,instanceMatrix));}}
      else this.add(owner,mesh.geometry,mesh.matrixWorld);
    });
  }
  setBoxes(owner,boxes){
    this.remove(owner);
    for(const box of boxes){
      const bottom=box.bottom??0,top=box.top??2;
      if(top<=bottom)continue;
      const matrix=new THREE.Matrix4().makeRotationY((box.rotation||0)*Math.PI/180);
      matrix.scale(new THREE.Vector3(box.w*2,top-bottom,box.d*2));matrix.setPosition(box.x,(top+bottom)/2,box.z);
      const entry=this.add(owner,unitBox,matrix);entry.volume={inverse:matrix.clone().invert(),scale:new THREE.Vector3().setFromMatrixScale(matrix)};
    }
  }
  candidates(bounds){
    const result=new Set();
    for(const key of this.keys(bounds))for(const entry of this.cells.get(key)||[])if(entry.bounds.intersectsBox(bounds))result.add(entry);
    return result;
  }
  index(entry){
    const key=entry.geometry.uuid+':'+entry.signature;
    let index=this.indices.get(key);
    if(index)this.indices.delete(key);
    else{index=createIndex(entry.geometry,entry.linear);this.indexTriangles+=index.count;}
    this.indices.set(key,index);
    while(this.indices.size>128||this.indexTriangles>400000&&this.indices.size>1){const oldest=this.indices.keys().next().value;this.indexTriangles-=this.indices.get(oldest).count;this.indices.delete(oldest);}
    return index;
  }
  contacts(capsule,callback){
    const bounds=capsuleBounds(capsule);
    for(const entry of this.candidates(bounds)){
      if(entry.volume){
        const start=capsule.start.clone().applyMatrix4(entry.volume.inverse),end=capsule.end.clone().applyMatrix4(entry.volume.inverse);
        if(Math.abs(start.x)<.5&&Math.abs(start.z)<.5&&end.y>-.5&&start.y<.5){
          const distanceX=(.5-Math.abs(start.x))*entry.volume.scale.x+capsule.radius;
          const distanceZ=(.5-Math.abs(start.z))*entry.volume.scale.z+capsule.radius;
          const normal=distanceX<distanceZ?new THREE.Vector3(start.x>=0?1:-1,0,0):new THREE.Vector3(0,0,start.z>=0?1:-1);
          callback({normal:normal.transformDirection(entry.linear),depth:Math.min(distanceX,distanceZ)});continue;
        }
      }
      const local=capsule.clone().translate(entry.translation.clone().negate());
      visitTree(this.index(entry).root,capsuleBounds(local),triangle=>{
        const center=local.getCenter(new THREE.Vector3()),normal=triangle.getNormal(new THREE.Vector3());
        const facing=normal.dot(center.sub(triangle.a))<0?new THREE.Triangle(triangle.c,triangle.b,triangle.a):triangle;
        const contact=narrowPhase.triangleCapsuleIntersect(local,facing);
        if(contact&&contact.depth>skin&&Number.isFinite(contact.depth)){callback(contact);local.translate(contact.normal.clone().multiplyScalar(contact.depth+skin));}
      });
    }
  }
  clearAt(position){
    if(position.x<GRID.min+1||position.x>GRID.max-1||position.z<GRID.min+1||position.z>GRID.max-1)return false;
    let clear=true;
    this.contacts(capsuleAt(position),()=>{clear=false;});
    return clear;
  }
  resolve(capsule){
    const normals=[];
    for(let pass=0;pass<4;pass++){
      let moved=false;
      this.contacts(capsule,contact=>{capsule.translate(contact.normal.clone().multiplyScalar(contact.depth+skin));normals.push(contact.normal);moved=true;});
      if(!moved)break;
    }
    const bottom=capsule.start.y-capsule.radius;
    if(bottom<0){capsule.translate(new THREE.Vector3(0,-bottom,0));normals.push(new THREE.Vector3(0,1,0));}
    return normals;
  }
  supportHeight(position,maxDrop=.08){
    const bounds=new THREE.Box3(new THREE.Vector3(position.x-CHARACTER.radius,position.y-maxDrop,position.z-CHARACTER.radius),new THREE.Vector3(position.x+CHARACTER.radius,position.y+.002,position.z+CHARACTER.radius));
    let height=position.y>=-skin&&position.y<=maxDrop?0:null;
    for(const entry of this.candidates(bounds)){
      const index=this.index(entry);
      for(const [offsetX,offsetZ] of [[0,0],[.21,0],[-.21,0],[0,.21],[0,-.21]]){
        const ray=new THREE.Ray(new THREE.Vector3(position.x+offsetX,position.y+.002,position.z+offsetZ).sub(entry.translation),new THREE.Vector3(0,-1,0));
        const visit=node=>{
          if(!node||!ray.intersectsBox(node.bounds))return;
          if(node.triangles)for(const item of node.triangles){
            if(item.triangle.getNormal(new THREE.Vector3()).y<.6)continue;
            const point=ray.intersectTriangle(item.triangle.a,item.triangle.b,item.triangle.c,true,new THREE.Vector3());
            if(point){const candidate=point.y+entry.translation.y;if(candidate>=position.y-maxDrop-skin&&candidate<=position.y+.002&&(height===null||candidate>height))height=candidate;}
          }
          else{visit(node.left);visit(node.right);}
        };
        visit(index.root);
      }
    }
    return height;
  }
  canWalk(position){
    const probe=position.clone();probe.y=CHARACTER.stepHeight;
    const height=this.supportHeight(probe,CHARACTER.stepHeight+.01);
    probe.y=height??0;
    return this.clearAt(probe);
  }
}

export function jumpCharacter(actor,physics){
  const support=physics.supportHeight(actor.position,.035);
  const grounded=actor.grounded||support!==null&&Math.abs(actor.position.y-support)<.035&&actor.velocityY<=0;
  if(grounded){actor.velocityY=CHARACTER.jumpSpeed;actor.jumpCount=1;actor.grounded=false;return true;}
  if(actor.jumpCount===1){actor.velocityY=CHARACTER.secondJumpSpeed;actor.jumpCount=2;actor.grounded=false;return true;}
  return false;
}

export function stepCharacter(physics,actor,velocity,dt){
  const duration=Math.max(0,Math.min(dt,.05));
  const distance=Math.max(Math.abs(velocity.x),Math.abs(velocity.z),Math.abs(actor.velocityY||0)+CHARACTER.gravity*duration)*duration;
  const steps=Math.max(1,Math.ceil(distance/.07)),stepTime=duration/steps;
  for(let step=0;step<steps;step++){
    const previous=actor.position.clone(),wasGrounded=actor.grounded;
    actor.velocityY=(actor.velocityY||0)-CHARACTER.gravity*stepTime;
    const delta=new THREE.Vector3(velocity.x*stepTime,actor.velocityY*stepTime,velocity.z*stepTime);
    const capsule=capsuleAt(previous).translate(delta),normals=physics.resolve(capsule);
    const position=capsule.start.clone().add(new THREE.Vector3(0,-CHARACTER.radius,0));
    const desired=previous.clone().add(delta);
    const blocked=Math.hypot(position.x-desired.x,position.z-desired.z)>.001;
    if(blocked&&wasGrounded&&actor.velocityY<=0){
      const raised=previous.clone().add(new THREE.Vector3(delta.x,CHARACTER.stepHeight,delta.z));
      const support=physics.supportHeight(raised,CHARACTER.stepHeight+.01);
      if(support!==null&&support>previous.y+skin){raised.y=support+skin;if(physics.clearAt(raised)){position.copy(raised);normals.push(new THREE.Vector3(0,1,0));}}
    }
    position.x=THREE.MathUtils.clamp(position.x,GRID.min+1,GRID.max-1);position.z=THREE.MathUtils.clamp(position.z,GRID.min+1,GRID.max-1);
    actor.position.copy(position);
    actor.grounded=normals.some(normal=>normal.y>.6)&&actor.velocityY<=0;
    if(normals.some(normal=>normal.y<-.6)&&actor.velocityY>0)actor.velocityY=0;
    if(actor.grounded){actor.velocityY=0;actor.jumpCount=0;}
    else if(actor.jumpCount===0)actor.jumpCount=1;
  }
}

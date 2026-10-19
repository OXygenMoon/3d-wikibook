import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { offices, neighborhoods, spawn, worldBounds } from './data.js';
import { PUBLIC_AREAS, BASE_PUBLIC_AREAS, ITEMS, sceneHour, withinArea } from './community.js';
import {GRID,footprint,centerOf,areaForBuilding,transformPoint} from './grid.js';
import { buildPublicScenes } from './public-scenes.js';
import { isModelItem, modelAssetId, effectiveSize } from './model-meta.js';

const Y = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Object3D();
const matCache = new Map();
const material = color => {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true }));
  return matCache.get(color);
};
const cube = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 7);
const crown = new THREE.DodecahedronGeometry(1, 0);
function mesh(geo, color, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, material(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; return m;
}
function textTexture(draw, width = 512, height = 256) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4; return texture;
}
class Batches {
  constructor(scene) { this.scene = scene; this.groups = new Map(); }
  add(geometry, mat, matrix, shadow = true) {
    const key = geometry.uuid + mat.uuid + shadow;
    if (!this.groups.has(key)) this.groups.set(key, { geometry, mat, matrices: [], shadow });
    this.groups.get(key).matrices.push(matrix.clone());
  }
  box(x, y, z, w, h, d, color, yaw = 0) {
    tmp.position.set(x, y, z); tmp.rotation.set(0, yaw, 0); tmp.scale.set(w, h, d); tmp.updateMatrix();
    this.add(cube, material(color), tmp.matrix);
  }
  object(object, x, y, z, yaw = 0, scale = 1) {
    object.updateMatrixWorld(true); tmp.position.set(x, y, z); tmp.rotation.set(0, yaw, 0); tmp.scale.setScalar(scale); tmp.updateMatrix();
    const placement = tmp.matrix.clone();
    object.traverse(child => { if (child.isMesh) this.add(child.geometry, child.material, new THREE.Matrix4().multiplyMatrices(placement, child.matrixWorld)); });
  }
  finish() {
    for (const { geometry, mat, matrices, shadow } of this.groups.values()) {
      const instance = new THREE.InstancedMesh(geometry, mat, matrices.length);
      matrices.forEach((matrix, index) => instance.setMatrixAt(index, matrix));
      instance.castShadow = shadow; instance.receiveShadow = true; instance.computeBoundingSphere(); this.scene.add(instance);
    }
    this.groups.clear();
  }
}

function avatar({ color = '#a6b79a', smooth = false, hair = '#45453c', skin = '#cda67e', seated = false } = {}) {
  const group = new THREE.Group();
  const joint = smooth ? new THREE.CapsuleGeometry(.12, .32, 3, 7) : cube;
  const body = mesh(smooth ? new THREE.CapsuleGeometry(.27, .28, 4, 8) : cube, color, 0, 1.05, 0, smooth ? 1 : .66, smooth ? 1 : .63, smooth ? 1 : .35);
  group.add(body);
  const head = mesh(smooth ? new THREE.SphereGeometry(.29, 9, 7) : cube, skin, 0, 1.59, 0, smooth ? 1 : .49, smooth ? 1 : .49, smooth ? 1 : .46); group.add(head);
  group.add(mesh(smooth ? crown : cube, hair, 0, 1.78, -.025, smooth ? .30 : .51, smooth ? .2 : .2, smooth ? .29 : .49));
  group.add(mesh(cube, hair, 0, 1.61, -.21, .51, .36, .08));
  const arms = [-1, 1].map(side => {
    const pivot = new THREE.Group(); pivot.position.set(side * .43, 1.29, 0);
    const sleeve = mesh(joint, color, 0, -.15, 0, smooth ? .8 : .21, smooth ? .65 : .32, smooth ? .8 : .29);
    pivot.add(sleeve, mesh(smooth ? new THREE.SphereGeometry(.12, 7, 5) : cube, skin, 0, -.43, 0, smooth ? 1 : .2, smooth ? 1 : .24, smooth ? 1 : .25));
    group.add(pivot); return pivot;
  });
  const legs = [-1, 1].map(side => {
    const pivot = new THREE.Group(); pivot.position.set(side * .18, .76, 0);
    pivot.add(mesh(joint, '#4f5650', 0, -.27, 0, smooth ? 1 : .28, smooth ? 1.1 : .58, smooth ? 1 : .29));
    pivot.add(mesh(cube, '#3f4640', 0, -.64, .045, .28, .14, .43)); group.add(pivot); return pivot;
  });
  for (const side of [-1, 1]) group.add(mesh(cube, '#3e4036', side * .115, 1.61, .238, .055, .055, .012));
  if (seated) { group.position.y = -.42; legs.forEach(l => l.rotation.x = -1.15); arms.forEach(a => a.rotation.x = -.75); }
  group.userData = { arms, legs, body, seated }; return group;
}

function sign(office) {
  const texture = textTexture((ctx, w, h) => {
    ctx.fillStyle = '#f5f4e9'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = office.color; ctx.fillRect(0, 0, 13, h);
    ctx.fillStyle = office.color; ctx.beginPath(); ctx.roundRect(32, 61, 83, 92, 12); ctx.fill();
    ctx.fillStyle = '#faf9f1'; ctx.font = 'bold 43px Arial'; ctx.textAlign = 'center'; ctx.fillText(office.monogram, 74, 122);
    ctx.textAlign = 'left'; ctx.fillStyle = '#35483d'; ctx.font = `bold ${office.name.length > 14 ? 25 : 36}px Arial`; ctx.fillText(office.name, 137, 99, 350);
    ctx.fillStyle = '#667362'; ctx.font = '17px "PingFang SC", "Microsoft YaHei", sans-serif';
    const words = Array.from(office.tagline); let line = '', y = 135;
    for (const word of words) { if (ctx.measureText(line + word).width > 325) { ctx.fillText(line, 138, y); y += 25; line = ''; } line += word; }
    ctx.fillText(line, 138, y);
    ctx.fillStyle = '#a4ad99'; ctx.font = '16px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText('欢迎来到我的小天地', 138, 204);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(2.95, 1.05), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent:true, depthWrite:false }));
}

export class OfficeWorld extends EventTarget {
  constructor(canvas) {
    super(); this.canvas = canvas; this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#dce5df');
    this.scene.fog = new THREE.Fog('#dce5df', 50, 135);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth<700?1:1.7)); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(45, 1, .1, 140);
    this.fpCamera = new THREE.PerspectiveCamera(72, 1, .04, 140);
    this.cameraMode = 'orbit'; this.yaw = 0; this.pitch = -.05; this.elevation = .4; this.zoomLevel = 5;
    this.position = new THREE.Vector3(spawn.x, 0, spawn.z); this.rotation = Math.PI; this.velocityY = 0; this.jumpCount = 0;
    this.keys = new Set(); this.path = []; this.colliders = []; this.remote = new Map(); this.npcs = []; this.signs = new Map(); this.entered = false;
    this.dancing = false; this.outfit = { color: '#a6b79a', avatar: 'classic' }; this.touch = { x: 0, z: 0 };
    this.raycaster = new THREE.Raycaster(); this.groundPlane = new THREE.Plane(Y, 0); this.previousTime = performance.now(); this.elapsedTime = 0;
    this.focus = new THREE.Vector3(spawn.x, .7, spawn.z - 2.0); this.lastNear = null; this.pointer = null;
    this.resize = this.resize.bind(this); window.addEventListener('resize', this.resize); this.resize();
    this.bindInput();
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  async init() {
    this.ambient = new THREE.HemisphereLight('#f5f4e6', '#9ba997', 1.8); this.scene.add(this.ambient);
    const sun = this.sun = new THREE.DirectionalLight('#fff5d8', 2.3); sun.position.set(-12, 25, 12); sun.castShadow = true;
    const shadowSize=window.innerWidth<700?1024:2048;sun.shadow.mapSize.set(shadowSize, shadowSize); Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 90 }); sun.shadow.normalBias = .035; sun.shadow.bias = -.00015;
    this.scene.add(sun, sun.target);
    const loader = new GLTFLoader(); this.assets = new Map();
    const packs = ['commons', 'foundation', 'seating', 'tech', 'greenery', 'lighting', 'decor', 'desk-details', 'coffee', 'personality'];
    let loaded = 0;
    await Promise.all(packs.map(async pack => {
      try { const gltf = await loader.loadAsync(`/models/${pack}.glb`); for (const child of gltf.scene.children) this.assets.set(child.name, child); }
      catch (error) { console.warn(`Could not load ${pack} furniture`, error); }
      loaded++; this.emit('loading', loaded / packs.length);
    }));
    this.buildWorld(); this.setOutfit(this.outfit); this.ready = true; this.animate();
    this.emit('ready'); return this;
  }
  buildWorld() {
    const sceneOffices=this.previewData?.offices||offices,sceneZones=this.previewData?.zones||neighborhoods,sceneAreas=this.previewData?.areas||PUBLIC_AREAS,sceneBuildings=this.previewData?.buildings||this.layoutBuildings||[];
    if(this.environment){this.scene.remove(this.environment);for(const p of this.signs.values()){p.material.map?.dispose();p.material.dispose();p.geometry.dispose();}this.publicScene?.dispose();}
    this.environment=new THREE.Group();this.scene.add(this.environment);
    this.colliders=[];this.signs=new Map();this.npcs=[];this.furnitureGroups=new Map();this.furnitureColliders=new Map();this.officeLights=new Map();this.customTrims=new Map();this.statusMarkers=new Map();this.lastNear=null;
    const batches=this.batches=new Batches(this.environment);
    this.wallUniforms={uFollowPosition:{value:this.position},uFollowCamera:{value:this.camera.position}};
    for(const color of ['#cdd3c8','#d5d8cd','#e0e2d6']) {
      const wall=material(color);wall.transparent=true;wall.depthWrite=false;
      wall.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,this.wallUniforms);
        shader.vertexShader='varying vec3 vWallWorld;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
          vec4 wallVertex=vec4(transformed,1.0);
          #ifdef USE_INSTANCING
            wallVertex=instanceMatrix*wallVertex;
          #endif
          vWallWorld=(modelMatrix*wallVertex).xyz;`);
        shader.fragmentShader='varying vec3 vWallWorld;\nuniform vec3 uFollowPosition;\nuniform vec3 uFollowCamera;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
          vec2 viewDirection=normalize(uFollowCamera.xz-uFollowPosition.xz);
          vec2 fromPerson=vWallWorld.xz-uFollowPosition.xz;
          float inFront=dot(fromPerson,viewDirection);
          float sideways=abs(dot(fromPerson,vec2(-viewDirection.y,viewDirection.x)));
          if(inFront>0.2&&inFront<10.0&&sideways<2.6)diffuseColor.a=0.16;
          #include <opaque_fragment>`);
      };wall.customProgramCacheKey=()=> 'follow-partition-v2';
    }
    batches.box(0,-.34,0,140,.6,140,'#c8d4bb');
    batches.box(0,-.7,0,146,.25,146,'#a8b69b');
    batches.box(0,-1,0,260,.3,260,'#7eabaa');
    for(const z of [-24,24,47]){batches.box(0,-.025,z,130,.08,2.5,'#eae8dc');for(let x=-64;x<65;x+=3)batches.box(x,.018,z,.025,.01,2.45,'#d5d7c9');}
    for(const x of [-47,47])batches.box(x,-.025,0,2.5,.08,130,'#eae8dc');
    for(const zone of sceneZones){
      const w=(zone.columns-1)*zone.spacing+5,d=(zone.rows-1)*zone.spacing+5;
      batches.box(zone.x,-.015,zone.z,w,.025,d,zone.color);
      const label=this.sprite(zone.name,'#405641',4);label.scale.set(5,2,1);label.position.set(zone.x,3,zone.z-d/2-1);this.environment.add(label);
      for(const o of sceneOffices.filter(o=>o.zoneId===zone.id))this.makeOffice(o);
    }
    for(let i=-7;i<=7;i++)for(const side of [-1,1]){this.tree(i*8,side*61,Math.abs(i)%3);if(Math.abs(i)>2)this.tree(side*61,i*8,Math.abs(i+1)%3);}
    for(let i=-5;i<=5;i++)for(const side of [-1,1])this.lamp(side*48.8,i*10);
    batches.finish();
    this.publicScene=buildPublicScenes(THREE,sceneAreas.filter(a=>!a.assetId));this.environment.add(this.publicScene.group);this.colliders.push(...this.publicScene.colliders);this.setStickers(this.stickers||[]);
    this.drawWorldGrid(sceneBuildings);for(const b of sceneBuildings.filter(b=>b.enabled!==false&&b.assetId))this.addImportedBuilding(b);
    this.car=new THREE.Group();this.car.position.set(43,0,24);
    this.car.add(mesh(cube,'#b2bd9b',0,.5,0,1.25,.45,2.1),mesh(cube,'#ecebdb',0,1.65,0,1.4,.13,2.25));
    for(const x of [-.65,.65])for(const z of [-.7,.7]){const wheel=mesh(new THREE.CylinderGeometry(.27,.27,.15,10),'#454d43',x,.28,z);wheel.rotation.z=Math.PI/2;this.car.add(wheel,mesh(cube,'#718073',x,1.1,z,.055,1.1,.055));}
    this.car.add(mesh(cube,'#647663',0,.95,.25,1,.65,.18));this.environment.add(this.car);
    this.selection=new THREE.Mesh(new THREE.PlaneGeometry(3.8,3.9),new THREE.MeshBasicMaterial({color:'#afca82',transparent:true,opacity:.15,depthWrite:false}));this.selection.rotation.x=-Math.PI/2;this.selection.position.y=.085;this.environment.add(this.selection);
    const ringGeo=new THREE.RingGeometry(.14,.23,32);ringGeo.rotateX(-Math.PI/2);this.destinationMarker=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:'#5e805b',transparent:true,opacity:.8,depthWrite:false}));this.destinationMarker.visible=false;this.environment.add(this.destinationMarker);
    this.nearLights=Array.from({length:3},()=>{const l=new THREE.PointLight('#ffce7e',0,7,2);this.environment.add(l);return l;});
    this.updatePresence(this.onlineUserIds||[]);
  }
  drawWorldGrid(buildings){
    const grid=new THREE.GridHelper(GRID.size,GRID.size,'#6f8b73','#99ad93');grid.position.y=.003;grid.material.transparent=true;grid.material.opacity=.3;this.environment.add(grid);
    this.gridFootprints=new THREE.Group();this.environment.add(this.gridFootprints);
    for(const b of buildings.filter(b=>b.enabled!==false)){const r=footprint(b),color=b.kind==='class'?'#728a68':b.kind==='office'?'#a7b98a':b.kind==='custom'?'#b49258':'#6eaaa3';const points=[[r.x,r.z],[r.x+r.w,r.z],[r.x+r.w,r.z+r.d],[r.x,r.z+r.d]].map(([x,z])=>new THREE.Vector3(x,.08,z));const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity:b.kind==='class'?.45:.24}));this.gridFootprints.add(line);}
  }
  async addImportedBuilding(building){
    const asset=this.modelAssets?.find(a=>a.id===building.assetId);if(!asset)return;const environment=this.environment,center=centerOf(building),r=footprint(building),root=new THREE.Group();root.name=building.name;root.position.set(center.x,0,center.z);root.rotation.y=building.rotation*Math.PI/180;environment.add(root);
    const placeholder=new THREE.Mesh(new THREE.BoxGeometry(building.width,.15,building.depth),new THREE.MeshBasicMaterial({color:'#a4bd97',wireframe:true}));placeholder.position.y=.15;root.add(placeholder);
    if(building.solid)this.colliders.push({x:center.x,z:center.z,w:r.w/2,d:r.d/2});
    try{this.importedCache||=new Map();let promise=this.importedCache.get(asset.id);if(!promise){promise=new GLTFLoader().loadAsync(asset.url);this.importedCache.set(asset.id,promise);}const gltf=await promise;if(this.environment!==environment)return;const object=gltf.scene.clone(true),box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3());if(box.isEmpty())throw new Error('模型没有可显示的几何体');const nativeMax=Math.max(Number(asset.width)||0,Number(asset.height)||0,Number(asset.depth)||0);const useAssetScale=Number.isFinite(Number(asset.scale))&&nativeMax>0;const fit=useAssetScale?Number(asset.scale)/nativeMax:Math.min(building.width/Math.max(size.x,.001),building.depth/Math.max(size.z,.001))*.98;const offset=new THREE.Group();offset.add(object);offset.position.set(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);const scaled=new THREE.Group();scaled.scale.setScalar(fit);scaled.add(offset);object.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});root.remove(placeholder);placeholder.geometry.dispose();placeholder.material.dispose();root.add(scaled);
    }catch(error){if(this.environment===environment){placeholder.material.color.set('#c48075');this.emit('asset-error',{name:asset.name,message:error.message});}}
  }
  previewLayout(buildings,selected){
    if(!this.layoutPreviewActive){this.savedLayoutCamera={yaw:this.yaw,elevation:this.elevation,zoomLevel:this.zoomLevel,cameraMode:this.cameraMode};this.layoutPreviewActive=true;this.cameraMode='orbit';this.elevation=.85;this.yaw=0;}
    const byId=new Map(buildings.map(b=>[b.id,b]));this.previewData={buildings,offices:offices.map(o=>{const b=byId.get(`office-${o.id}`);return b?{...o,x:b.gridX+2.5,z:b.gridZ+2.5}:{...o};}),zones:neighborhoods.map(z=>{const b=byId.get(`class-${z.id}`);return b?{...z,...centerOf(b)}:{...z};}),areas:buildings.filter(b=>b.enabled!==false&&BASE_PUBLIC_AREAS.some(a=>a.id===b.id)).map(b=>areaForBuilding(b,BASE_PUBLIC_AREAS.find(a=>a.id===b.id)))};
    if(selected){this.previewFocus=centerOf(selected);this.zoomLevel=selected.kind==='office'?5:12;}
    this.buildWorld();this.selection.visible=false;
  }
  endLayoutPreview(){if(!this.layoutPreviewActive)return;this.layoutPreviewActive=false;this.previewData=null;this.previewFocus=null;Object.assign(this,this.savedLayoutCamera);this.buildWorld();this.resize();}
  setFurniture(office,furniture) {
    const old=this.furnitureGroups.get(office.id);if(old)this.environment.remove(old);
    const group=new THREE.Group();group.position.set(office.x,0,office.z);group.userData.officeId=office.id;const collisions=[];
    for(const placed of furniture||[]){
      if(isModelItem(placed.itemId)){
        const model=this.modelAssets?.find(asset=>asset.id===modelAssetId(placed.itemId));
        if(!model)continue;
        const size=effectiveSize(model);
        if(Math.max(size.width,size.height,size.depth)>3.4)continue;
        const angle=(placed.rotation||0)*Math.PI/180;
        const hx=Math.abs(Math.cos(angle))*(size.width/2)+Math.abs(Math.sin(angle))*(size.depth/2);
        const hz=Math.abs(Math.sin(angle))*(size.width/2)+Math.abs(Math.cos(angle))*(size.depth/2);
        collisions.push({x:office.x+placed.x,z:office.z+placed.z,w:hx,d:hz});
        this.addCustomFurniture(group,placed,model);
        continue;
      }
      const item=ITEMS.find(i=>i.id===placed.itemId);const asset=item&&this.assets.get(item.model);if(!asset)continue;const object=asset.clone(true);object.position.set(placed.x,item.surface==='desk'?.79:0,placed.z);object.rotation.y=placed.rotation*Math.PI/180;object.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});group.add(object);
      if(item.surface==='floor'&&item.id!=='lamp')collisions.push({x:office.x+placed.x,z:office.z+placed.z,w:item.id==='desk'?.82:item.radius,d:item.id==='desk'?.4:item.radius});
    }
    this.environment.add(group);this.furnitureGroups.set(office.id,group);this.furnitureColliders.set(office.id,collisions);
  }
  async addCustomFurniture(group,placed,asset){
    try{
      const template=await this.assetObject(asset);
      if(group.parent!==this.environment)return;
      const nativeMax=Math.max(Number(asset.width)||0,Number(asset.height)||0,Number(asset.depth)||0)||1;
      const scale=(Number(asset.scale)||1)/nativeMax;
      const object=template.clone(true);object.scale.setScalar(scale);
      const box=new THREE.Box3().setFromObject(object);if(box.isEmpty())return;
      object.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});
      const center=box.getCenter(new THREE.Vector3());
      const pivot=new THREE.Group();pivot.position.set(placed.x,0,placed.z);pivot.rotation.y=(placed.rotation||0)*Math.PI/180;
      object.position.set(-center.x,-box.min.y,-center.z);pivot.add(object);group.add(pivot);
    }catch(error){this.emit('asset-error',{name:asset?.name||'3D 模型',message:error.message});}
  }
  assetObject(asset){
    this.importedCache||=new Map();
    let promise=this.importedCache.get(asset.id);
    if(!promise){promise=new GLTFLoader().loadAsync(asset.url);this.importedCache.set(asset.id,promise);}
    return promise.then(gltf=>gltf.scene);
  }
  setStickers(stickers) {
    this.stickers=stickers;if(this.stickerGroup){this.environment.remove(this.stickerGroup);this.stickerGroup.traverse(m=>{if(m.isMesh){m.geometry.dispose();m.material.map?.dispose();m.material.dispose();}});}this.stickerGroup=new THREE.Group();
    const area=(this.previewData?.areas||PUBLIC_AREAS).find(a=>a.id==='wall');if(!area||area.assetId)return;
    stickers.slice(-27).forEach((s,i)=>{const texture=textTexture((ctx,w,h)=>{ctx.fillStyle=s.color;ctx.fillRect(0,0,w,h);ctx.fillStyle='#465443';ctx.font='26px "PingFang SC", sans-serif';let line='',y=42;for(const char of s.text){if(ctx.measureText(line+char).width>w-40){ctx.fillText(line,20,y);y+=36;line='';}line+=char;}ctx.fillText(line,20,y);ctx.font='20px "PingFang SC", sans-serif';ctx.fillText(s.name,20,h-18);},256,256);const note=new THREE.Mesh(new THREE.PlaneGeometry(.74,.66),new THREE.MeshStandardMaterial({map:texture,roughness:1}));const a=(area.rotation||0)*Math.PI/180,x=-4.3+(i%9)*1.05,z=-.91;note.position.set(area.x+x*Math.cos(a)+z*Math.sin(a),1+Math.floor(i/9)*.84,area.z-x*Math.sin(a)+z*Math.cos(a));note.rotation.y=a;this.stickerGroup.add(note);});this.environment.add(this.stickerGroup);
  }
  updatePresence(ids) {
    this.onlineUserIds=ids;const online=new Set(ids);
    for(const o of this.previewData?.offices||offices){o.online=online.has(o.ownerId);const marker=this.statusMarkers.get(o.id);if(marker){marker.material.color.set(o.ownerId?(o.online?'#83bc70':'#9aab9e'):'#bcc5b6');marker.material.opacity=o.online?1:.65;}}
  }
  setCommunity(data,{rebuild=false}={}) {
    this.layoutBuildings=data.buildings||this.layoutBuildings;this.modelAssets=data.modelAssets||this.modelAssets;this.latestCommunity=data;if(this.layoutPreviewActive)return;
    const stickersChanged=data.stickers&&JSON.stringify(data.stickers)!==JSON.stringify(this.stickers);this.settings=data.settings||this.settings;this.stickers=data.stickers||this.stickers;if(this.ready&&!rebuild&&stickersChanged)this.setStickers(this.stickers);
    if(rebuild&&this.ready){this.buildWorld();if(!this.canMove(this.position.x,this.position.z)){const own=offices.find(o=>o.ownerId===this.currentUserId)||offices[0];this.teleport(own.x,own.z+2.5);}}
  }
  updateDayNight(time) {
    this.hour=sceneHour(this.settings||{timeMode:'auto'});const target=(this.hour<6||this.hour>=18)?1:0;this.night=THREE.MathUtils.lerp(this.night??target,target,.025);
    this.sun.intensity=2.3*(1-this.night)+.18*this.night;this.ambient.intensity=1.8*(1-this.night)+.52*this.night;
    const sky=new THREE.Color('#dce5df').lerp(new THREE.Color('#172b3b'),this.night);this.scene.background.copy(sky);this.scene.fog.color.copy(sky);
    const lit=[];
    for(const o of this.previewData?.offices||offices){const glow=this.officeLights.get(o.id);if(glow){glow.visible=o.online&&this.night>.05;const lamp=o.furniture.find(f=>f.itemId==='lamp'),screen=o.furniture.find(f=>['monitor','laptop'].includes(f.itemId));glow.children[0].visible=Boolean(lamp);glow.children[1].visible=Boolean(lamp);if(lamp){glow.children[1].position.set(lamp.x,1.5,lamp.z);}glow.children[2].visible=Boolean(screen);if(screen){glow.children[2].position.set(screen.x,1.2,screen.z+.04);glow.children[2].rotation.y=screen.rotation*Math.PI/180;}glow.children.forEach(m=>{m.material.opacity=this.night*(m.userData.opacity||.8);});}if(o.online)lit.push(o);}
    lit.sort((a,b)=>Math.hypot(a.x-this.position.x,a.z-this.position.z)-Math.hypot(b.x-this.position.x,b.z-this.position.z));
    this.nearLights?.forEach((l,i)=>{const o=lit[i],lamp=o?.furniture.find(f=>f.itemId==='lamp'),screen=o?.furniture.find(f=>['monitor','laptop'].includes(f.itemId));l.intensity=o?this.night*(lamp?7:screen?1.4:0):0;const item=lamp||screen;if(o&&item)l.position.set(o.x+item.x,lamp?1.7:1.2,o.z+item.z);});
    this.publicScene?.update(time,this.night);
  }
  addAsset(name, x, y, z, yaw = 0, scale = 1) { const asset = this.assets.get(name); if (asset) this.batches.object(asset, x, y, z, yaw, scale); return Boolean(asset); }
  makeOffice(office) {
    const { x, z, seed } = office; const b = this.batches;
    b.box(x, .012, z, 3.85, .075, 3.85, seed % 7 === 0 ? '#e6e0d2' : '#ebede3');
    b.box(x, .056, z, 3.5, .018, 3.5, office.color);
    b.box(x, .068, z, 3.38, .015, 3.38, '#e8e9dd');
    const wallColor = seed % 3 === 0 ? '#cdd3c8' : '#d5d8cd';
    for (const [dx, dz, w, d] of [[0, -1.82, 3.8, .14], [-1.83, 0, .14, 3.8], [1.83, -.4, .14, 3]]) {
      b.box(x + dx, .74, z + dz, w, 1.45, d, wallColor); b.box(x + dx, 1.49, z + dz, w + .07, .1, d + .05, '#e0e2d6');
      this.colliders.push({ x: x + dx, z: z + dz, w: w / 2, d: d / 2 });
    }
    const poster = sign(office); poster.position.set(x, .94, z - 1.735); this.environment.add(poster); this.signs.set(office.id, poster);
    this.setFurniture(office,office.furniture);
    const marker=new THREE.Mesh(new THREE.SphereGeometry(.1,10,8),new THREE.MeshBasicMaterial({color:'#9aab9e',transparent:true}));marker.position.set(x+1.45,1.7,z-1.75);this.environment.add(marker);this.statusMarkers.set(office.id,marker);
    const glow=new THREE.Group();glow.position.set(x,0,z);
    const pool=new THREE.Mesh(new THREE.CircleGeometry(1.5,24),new THREE.MeshBasicMaterial({color:'#ffc975',transparent:true,opacity:0,depthWrite:false}));pool.rotation.x=-Math.PI/2;pool.position.set(.2,.085,.1);pool.userData.opacity=.19;
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),new THREE.MeshBasicMaterial({color:'#ffdfa1',transparent:true,opacity:0}));bulb.position.set(1.3,1.5,.8);bulb.userData.opacity=.95;
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(.75,.38),new THREE.MeshBasicMaterial({color:'#c6e4ea',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));screen.position.set(0,1.2,-.79);screen.userData.opacity=.35;
    glow.add(pool,bulb,screen);this.environment.add(glow);this.officeLights.set(office.id,glow);
    if (seed % 8 === 0) {
      const note = this.sprite('♪', '#667d68', .6); note.position.set(x + .7, 2.5, z); note.userData.baseY = note.position.y; this.environment.add(note); this.npcs.push({ note, seed });
    }
  }
  tree(x, z, seed = 0) {
    const colors = ['#8da67e', '#bfa387', '#b7bc83'];
    this.batches.object(mesh(cylinder, '#aa987b', 0, 1.15, 0, .12, 2.3, .12), x, 0, z);
    for (const [dx,dy,dz,s] of [[0,2.8,0,1.2],[-.7,2.55,.25,.87],[.7,2.6,-.2,.92]]) {
      const object = mesh(crown, colors[seed % 3], dx, dy, dz, s, s * .6, s); this.batches.object(object, x, 0, z);
    }
    this.batches.box(x, .04, z, 2.5, .07, 2.5, '#bac7a8');
  }
  lamp(x, z) {
    this.batches.box(x, 1.7, z, .07, 3.4, .07, '#758477'); this.batches.box(x + .2, 3.4, z, .5, .08, .12, '#758477');
    this.batches.box(x + .4, 3.15, z, .3, .45, .3, '#dfcc87');
  }
  sprite(text, color = '#405641', size = 1) {
    const texture = textTexture((ctx,w,h) => { ctx.clearRect(0,0,w,h); ctx.fillStyle=color;ctx.textAlign='center';ctx.font='100px Arial';ctx.fillText(text,w/2,155,w-10); },256,256);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));sprite.scale.setScalar(size);return sprite;
  }
  setOutfit(outfit) {
    Object.assign(this.outfit, outfit); if (this.local) this.scene.remove(this.local);
    this.local = avatar({ color: this.outfit.color, smooth: this.outfit.avatar === 'smooth' }); this.scene.add(this.local);
  }
  updateOffice(office) {
    const old=this.signs.get(office.id);if(!old)return;
    Object.assign(offices.find(o=>o.id===office.id),office);
    const next=sign(office);next.position.copy(old.position);this.environment.remove(old);old.material.map.dispose();old.material.dispose();old.geometry.dispose();this.environment.add(next);this.signs.set(office.id,next);
    this.setFurniture(office,office.furniture);this.updatePresence(this.onlineUserIds||[]);let trim=this.customTrims.get(office.id);if(!trim){trim=new THREE.Group();for(const [x,z,w,d]of [[0,-1.73,3.5,.055],[0,1.73,3.5,.055],[-1.73,0,.055,3.5],[1.73,0,.055,3.5]])trim.add(mesh(cube,office.color,x,.09,z,w,.015,d));trim.position.set(office.x,0,office.z);this.environment.add(trim);this.customTrims.set(office.id,trim);}trim.children.forEach(m=>m.material=material(office.color));
  }
  setPlayers(players) {
    const ids = new Set(players.map(p => p.id));
    for (const [id, item] of this.remote) if (!ids.has(id)) { this.scene.remove(item.group); this.remote.delete(id); }
    for (const player of players) {
      let item = this.remote.get(player.id);
      if (!item || item.color !== player.color || item.avatar !== player.avatar) {
        if (item) this.scene.remove(item.group);
        const group = avatar({ color: player.color, smooth: player.avatar === 'smooth' }); group.position.set(player.x,0,player.z); this.scene.add(group);
        item = { group, target: new THREE.Vector3(player.x,0,player.z), color:player.color, avatar:player.avatar }; this.remote.set(player.id,item);
      }
      item.target.set(player.x,0,player.z); item.rotation = player.rotation; item.dancing=player.dancing;
      if (player.reaction && item.reactionText !== player.reaction) { if(item.reaction) item.group.remove(item.reaction); item.reaction=this.sprite(player.reaction,'#405641',1);item.reaction.position.y=2.6;item.group.add(item.reaction); }
      if (!player.reaction && item.reaction) { item.group.remove(item.reaction);item.reaction=null; }
      item.reactionText=player.reaction;
    }
  }
  setDance(value = !this.dancing) { this.dancing = value; this.emit('dance',value); }
  react(emoji) {
    if (this.reaction) this.scene.remove(this.reaction); this.reaction=this.sprite(emoji,'#405641',1);this.scene.add(this.reaction);this.reactionUntil=performance.now()+4500;
  }
  enter() { this.entered = true; this.canvas.focus(); }
  zoom(delta) { this.zoomLevel = THREE.MathUtils.clamp(this.zoomLevel + delta,3.5,20);this.resize(); }
  resize() {
    const w = window.innerWidth, h=window.innerHeight; const aspect=w/h;
    this.renderer.setSize(w,h); const half = this.zoomLevel || 7.7;
    this.camera.aspect=aspect;this.camera.updateProjectionMatrix();
    this.fpCamera.aspect=aspect;this.fpCamera.updateProjectionMatrix();
  }
  toggleCamera() {
    this.cameraMode = this.cameraMode === 'orbit' ? 'first' : 'orbit'; this.path=[];
    if(this.cameraMode==='first') { this.pitch=-.03; this.canvas.requestPointerLock?.()?.catch?.(()=>{}); }
    else if(document.pointerLockElement===this.canvas)document.exitPointerLock();
    this.emit('camera',this.cameraMode);
  }
  teleport(x,z) { this.position.set(x,0,z);this.path=[];this.velocityY=0;this.driving=false;this.emit('location',{x,z}); }
  canMove(x,z) {
    if(Math.abs(x)>worldBounds-1 || Math.abs(z)>worldBounds-1)return false;
    return !this.colliders.some(r=>Math.abs(x-r.x)<r.w+.22 && Math.abs(z-r.z)<r.d+.22) && ![...this.furnitureColliders.values()].flat().some(r=>Math.abs(x-r.x)<r.w+.2&&Math.abs(z-r.z)<r.d+.2);
  }
  planTo(x,z) {
    const step=.45, key=(x,z)=>`${x},${z}`;
    const sx=Math.round(this.position.x/step),sz=Math.round(this.position.z/step);let gx=Math.round(x/step),gz=Math.round(z/step);
    if(!this.canMove(gx*step,gz*step)) { let found=false;for(let r=1;r<8&&!found;r++)for(let dx=-r;dx<=r&&!found;dx++)for(let dz=-r;dz<=r&&!found;dz++)if(this.canMove((gx+dx)*step,(gz+dz)*step)){gx+=dx;gz+=dz;found=true;}if(!found)return; }
    const heuristic=(x,z)=>Math.hypot(gx-x,gz-z);const start={x:sx,z:sz,g:0,f:heuristic(sx,sz),parent:null};const open=[start],best=new Map([[key(sx,sz),0]]);let found=null;
    for(let i=0;open.length&&i<14000;i++) {
      open.sort((a,b)=>b.f-a.f);const cur=open.pop();if(cur.x===gx&&cur.z===gz){found=cur;break;}
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
        const nx=cur.x+dx,nz=cur.z+dz,k=key(nx,nz),cost=cur.g+Math.hypot(dx,dz);
        if((best.get(k)??Infinity)<=cost||!this.canMove(nx*step,nz*step))continue;
        if(dx&&dz&&(!this.canMove((cur.x+dx)*step,cur.z*step)||!this.canMove(cur.x*step,(cur.z+dz)*step)))continue;
        best.set(k,cost);open.push({x:nx,z:nz,g:cost,f:cost+heuristic(nx,nz),parent:cur});
      }
    }
    if(found){const path=[];while(found.parent){path.unshift(new THREE.Vector3(found.x*step,0,found.z*step));found=found.parent;}this.path=path;this.destinationMarker.position.set(gx*step,.1,gz*step);this.destinationMarker.visible=true;this.dancing=false;}
  }
  jump() {
    if(!this.entered||this.paused)return;
    if(this.position.y<.01){this.velocityY=7.6;this.jumpCount=1;}
    else if(this.jumpCount===1&&Math.abs(this.velocityY)<2){this.velocityY=6;this.jumpCount=2;this.flipStarted=performance.now();}
  }
  bindInput() {
    window.addEventListener('keydown',e=>{
      if(e.target.matches('input,textarea,select')||!this.entered||this.paused)return;
      const key=e.key.toLowerCase();this.keys.add(key);
      if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();
      if(e.repeat)return;
      if(key===' ')this.jump();
      if(key==='f')this.toggleCamera();
      if(key==='e') {
        if(this.driving){this.driving=false;this.position.x+=1.5;this.emit('vehicle',false);}
        else if(this.position.distanceTo(this.car.position)<2.5){this.position.copy(this.car.position);this.driving=true;this.emit('vehicle',true);}
        else if(this.nearArea)this.emit('area',this.nearArea);
        else if(this.nearOffice)this.emit('office',this.nearOffice);
      }
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>this.keys.clear());
    this.canvas.addEventListener('pointerdown',e=>{if(!this.entered||(this.paused&&!this.layoutPreviewActive))return;this.pointer={x:e.clientX,y:e.clientY,drag:false,button:e.button};this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener('pointermove',e=>{
      if(document.pointerLockElement===this.canvas){this.yaw-=e.movementX*.0025;this.pitch=THREE.MathUtils.clamp(this.pitch-e.movementY*.0025,-1.2,1.2);return;}
      if(!this.pointer)return;const dx=e.clientX-this.pointer.x,dy=e.clientY-this.pointer.y;
      if(Math.abs(dx)+Math.abs(dy)>3)this.pointer.drag=true;
      if(this.pointer.drag){this.yaw-=dx*.006;if(this.cameraMode==='orbit')this.elevation=THREE.MathUtils.clamp(this.elevation+dy*.004,.28,1.25);else this.pitch=THREE.MathUtils.clamp(this.pitch-dy*.004,-1.2,1.2);this.pointer.x=e.clientX;this.pointer.y=e.clientY;}
    });
    this.canvas.addEventListener('pointerup',e=>{
      if(this.pointer&&!this.pointer.drag&&this.cameraMode==='orbit'&&!this.paused){this.raycaster.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1),this.camera);const p=new THREE.Vector3();if(this.raycaster.ray.intersectPlane(this.groundPlane,p))this.planTo(p.x,p.z);}
      this.pointer=null;
    });
    this.canvas.addEventListener('dblclick',e=>{
      if(!this.entered||this.paused)return;this.raycaster.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1),this.cameraMode==='first'?this.fpCamera:this.camera);const p=new THREE.Vector3();
      if(this.raycaster.ray.intersectPlane(new THREE.Plane(Y,-.8),p)){const o=offices.find(o=>Math.abs(o.x-p.x)<1.9&&Math.abs(o.z-p.z)<1.9);if(o&&Math.hypot(o.x-this.position.x,o.z-this.position.z)<3)this.emit('office',o);}
    });
    this.canvas.addEventListener('wheel',e=>{if(this.cameraMode==='orbit'){e.preventDefault();this.zoom(e.deltaY*.006);}}, {passive:false});
    this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
  }
  animate() {
    this.frame=requestAnimationFrame(()=>this.animate());const now=performance.now(),dt=Math.min((now-this.previousTime)/1000,.045);this.previousTime=now;this.elapsedTime+=dt;const time=this.elapsedTime;
    if(this.entered&&!this.paused) {
      let dx=(this.keys.has('d')||this.keys.has('arrowright')?1:0)-(this.keys.has('a')||this.keys.has('arrowleft')?1:0)+this.touch.x;
      let dz=(this.keys.has('s')||this.keys.has('arrowdown')?1:0)-(this.keys.has('w')||this.keys.has('arrowup')?1:0)+this.touch.z;
      let direction=new THREE.Vector3(dx,0,dz).applyAxisAngle(Y,this.yaw);let moving=direction.lengthSq()>.01;
      if(moving){this.path=[];this.dancing=false;direction.normalize();}
      else if(this.path.length){direction.copy(this.path[0]).sub(this.position);direction.y=0;if(direction.length()<.17)this.path.shift();else{direction.normalize();moving=true;}}
      let speed=this.keys.has('shift')?7:3.8;if(this.driving)speed*=2;
      if(moving){const nx=this.position.x+direction.x*speed*dt,nz=this.position.z+direction.z*speed*dt;if(this.canMove(nx,this.position.z))this.position.x=nx;if(this.canMove(this.position.x,nz))this.position.z=nz;this.rotation=Math.atan2(direction.x,direction.z);}
      this.walking=moving;this.velocityY-=18*dt;this.position.y=Math.max(0,this.position.y+this.velocityY*dt);if(this.position.y===0){this.velocityY=0;this.jumpCount=0;}
    } else this.walking=false;
    if(this.local){this.local.position.copy(this.position);this.local.rotation.y=this.rotation;
      this.local.visible=this.cameraMode==='orbit'&&!this.driving;
      const limb=this.walking?Math.sin(time*(this.keys.has('shift')?15:10))*.6:0;
      this.local.userData.arms.forEach((a,i)=>{a.rotation.x=(i?1:-1)*limb;a.rotation.z=this.dancing?(i?1:-1)*(1.2+Math.sin(time*6)*.4):0;});
      this.local.userData.legs.forEach((l,i)=>l.rotation.x=(i?-1:1)*limb);
      if(this.dancing){this.local.position.y+=Math.abs(Math.sin(time*5))*.14;this.local.rotation.y+=Math.sin(time*4)*.4;}
      this.local.rotation.x=this.flipStarted&&performance.now()-this.flipStarted<700?-(performance.now()-this.flipStarted)/700*Math.PI*2:0;
    }
    if(this.driving){this.car.position.copy(this.position);this.car.rotation.y=this.rotation;}
    for(const item of this.remote.values()){item.group.position.lerp(item.target,Math.min(1,dt*9));item.group.rotation.y=item.rotation||0;item.group.visible=!(this.cameraMode==='first'&&item.group.position.distanceTo(this.position)<.85);item.group.userData.arms.forEach((a,i)=>a.rotation.z=item.dancing?(i?1:-1)*1.3:0);item.group.position.y=item.dancing?Math.abs(Math.sin(time*5))*.15:0;}
    for(const {note,seed} of this.npcs){note.position.y=note.userData.baseY+Math.sin(time*1.4+seed)*.18;note.material.opacity=.45+Math.sin(time+seed)*.15;}
    if(this.reaction){this.reaction.position.copy(this.position).add(new THREE.Vector3(0,2.5,0));if(performance.now()>this.reactionUntil){this.scene.remove(this.reaction);this.reaction=null;}}
    const cameraTarget=new THREE.Vector3(this.previewFocus?.x??this.position.x,.6,(this.previewFocus?.z??this.position.z)-1.6);this.focus.lerp(cameraTarget,Math.min(1,dt*6));
    if(this.cameraMode==='orbit'){
      const radius=20*this.zoomLevel/7.7;this.camera.position.copy(this.focus).add(new THREE.Vector3(Math.sin(this.yaw)*radius*Math.cos(this.elevation),radius*Math.sin(this.elevation),Math.cos(this.yaw)*radius*Math.cos(this.elevation)));this.camera.lookAt(this.focus);
    } else {this.fpCamera.position.copy(this.position).add(new THREE.Vector3(0,1.57,0));this.fpCamera.lookAt(this.fpCamera.position.clone().add(new THREE.Vector3(-Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),-Math.cos(this.yaw)*Math.cos(this.pitch))));}
    if(this.wallUniforms)this.wallUniforms.uFollowCamera.value=this.cameraMode==='first'?this.fpCamera.position:this.camera.position;
    const followCamera=this.cameraMode==='first'?this.fpCamera:this.camera;
    const viewX=followCamera.position.x-this.position.x,viewZ=followCamera.position.z-this.position.z,viewLength=Math.hypot(viewX,viewZ)||1;
    for(const poster of this.signs.values()){
      const dx=poster.position.x-this.position.x,dz=poster.position.z-this.position.z,front=(dx*viewX+dz*viewZ)/viewLength,side=Math.abs((-dx*viewZ+dz*viewX)/viewLength);
      poster.material.opacity=front>.2&&front<10&&side<2.6?.08:1;
    }
    if(this.destinationMarker)this.destinationMarker.visible=this.path.length>0;
    let near=null,best=3.0;for(const o of offices){const dist=Math.hypot(o.x-this.position.x,o.z+1.5-this.position.z);if(dist<best){best=dist;near=o;}}
    this.nearOffice=near;
    this.nearArea=PUBLIC_AREAS.find(a=>withinArea(this.position,a))||null;
    if(this.nearArea?.id!==this.lastArea){this.lastArea=this.nearArea?.id;this.emit('area-nearby',this.nearArea);}
    this.updateDayNight(time);
    if(near&&!this.layoutPreviewActive){this.selection.visible=true;this.selection.position.x=near.x;this.selection.position.z=near.z;}else if(this.selection)this.selection.visible=false;
    if(near?.id!==this.lastNear){this.lastNear=near?.id;this.emit('nearby',near);}
    this.renderer.render(this.scene,this.cameraMode==='first'?this.fpCamera:this.camera);
    if(this.onFrame)this.onFrame(this.position,this.yaw);
  }
  inspect() { return { ready:this.ready, entered:this.entered, position:{x:this.position.x,y:this.position.y,z:this.position.z}, cameraMode:this.cameraMode, dancing:this.dancing, remotePlayers:this.remote.size, officeCount:offices.length, area:this.nearArea?.id, hour:this.hour, night:this.night, litOffices:offices.filter(o=>o.online).length, drawCalls:this.renderer.info.render.calls, triangles:this.renderer.info.render.triangles }; }
}

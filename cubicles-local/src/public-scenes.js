import {rotatePoint} from './grid.js';
/** Procedural community spaces. Coordinates and colliders use world units.
 * night is either a boolean or a 0..1 darkness blend; time is elapsed seconds.
 * The caller owns adding/removing group and must call dispose on replacement.
 */
export function buildPublicScenes(THREE, areas = []) {
  const group = new THREE.Group(); group.name = '社区公共区域';
  const colliders = [], geometries = new Set(), materials = new Set(), textures = new Set();
  const batches = new Map(), animated = [], lamps = [];
  const matrixObject = new THREE.Object3D();
  const palette = { cream: '#ece9dc', sage: '#a5b79e', dark: '#405c4c', wood: '#a98259', trim: '#cbbd9f', stone: '#a9ada0', gold: '#c4a354', mint: '#c5d9c0', pink: '#d6a5a0', blue: '#9dbec4' };
  const ownGeometry = geometry => (geometries.add(geometry), geometry);
  const ownMaterial = material => (materials.add(material), material);
  const boxGeometry = ownGeometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinderGeometry = ownGeometry(new THREE.CylinderGeometry(1, 1, 1, 10));
  const coneGeometry = ownGeometry(new THREE.ConeGeometry(1, 1, 8));
  const sphereGeometry = ownGeometry(new THREE.SphereGeometry(1, 10, 7));
  const rockGeometry = ownGeometry(new THREE.DodecahedronGeometry(1, 0));
  const matCache = new Map();
  const mat = color => {
    if (!matCache.has(color)) matCache.set(color, ownMaterial(new THREE.MeshStandardMaterial({ color, roughness: .87, flatShading: true })));
    return matCache.get(color);
  };
  const glowMaterial = ownMaterial(new THREE.MeshStandardMaterial({ color: '#ffebac', emissive: '#ffcf77', emissiveIntensity: .12, roughness: .4 }));
  const screenMaterial = ownMaterial(new THREE.MeshStandardMaterial({ color: '#9ebeb4', emissive: '#77b8ab', emissiveIntensity: .22, roughness: .65 }));
  let origin = {x:0,z:0,rotation:0};const originMatrix=new THREE.Matrix4();
  function shape(geometry, color, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const material = typeof color === 'string' ? mat(color) : color;
    const key = `${geometry.uuid}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { geometry, material, matrices: [] });
    matrixObject.position.set(x,y,z);
    matrixObject.rotation.set(rx, ry, rz); matrixObject.scale.set(sx, sy, sz); matrixObject.updateMatrix();
    batches.get(key).matrices.push(new THREE.Matrix4().multiplyMatrices(originMatrix,matrixObject.matrix));
  }
  const box = (color, x, y, z, w, h, d, ry = 0) => shape(boxGeometry, color, x, y, z, w, h, d, 0, ry);
  const cyl = (color, x, y, z, radius, h, ry = 0) => shape(cylinderGeometry, color, x, y, z, radius, h, radius, 0, ry);
  const sphere = (color, x, y, z, sx, sy = sx, sz = sx) => shape(sphereGeometry, color, x, y, z, sx, sy, sz);
  const collision=(x,z,w,d)=>{const p=rotatePoint(x,z,origin.rotation),swap=origin.rotation%180!==0;colliders.push({x:origin.x+p.x,z:origin.z+p.z,w:swap?d:w,d:swap?w:d});};
  function textBoard(text, subtitle, x, y, z, width = 3.1, height = .85, background = '#eae8d9') {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = Math.round(768 * height / width);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#9da88c'; ctx.lineWidth = 9; ctx.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#365344';
    ctx.font = `600 ${subtitle ? 64 : 76}px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.fillText(text, 384, canvas.height * (subtitle ? .4 : .5), 710);
    if (subtitle) { ctx.font = '29px "PingFang SC","Microsoft YaHei",sans-serif'; ctx.fillStyle = '#697c65'; ctx.fillText(subtitle, 384, canvas.height * .76, 700); }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; textures.add(texture);
    const material = ownMaterial(new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side: THREE.DoubleSide }));
    const board = new THREE.Mesh(ownGeometry(new THREE.PlaneGeometry(width, height)), material);
    board.position.set(x,y,z);board.applyMatrix4(originMatrix);group.add(board);
    return board;
  }
  function postSign(title, subtitle, x, z, width = 3) {
    box(palette.wood, x, .85, z, .12, 1.7, .12);
    box(palette.wood, x, 1.75, z, width + .12, .97, .15);
    textBoard(title, subtitle, x, 1.75, z + .081, width, .85);
    collision(x, z, .14, .14);
  }
  function lamp(x, z, height = 2.5, real = false) {
    cyl(palette.dark, x, height / 2, z, .045, height);
    cyl(palette.dark, x, .08, z, .18, .12);
    box(glowMaterial, x, height, z, .29, .4, .29);
    shape(coneGeometry, palette.dark, x, height + .29, z, .29, .22, .29);
    box(palette.dark, x, height - .23, z, .38, .06, .38);
    collision(x, z, .16, .16);
    if (real) {
      const light = new THREE.PointLight('#ffd395', 0, 8, 2); light.position.set(x,height,z);light.applyMatrix4(originMatrix);group.add(light); lamps.push(light);
    }
  }
  function bench(x, z, ry = 0) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const part = (color, px, y, pz, w, h, d) => box(color, x + px * c + pz * s, y, z - px * s + pz * c, w, h, d, ry);
    for (let i = 0; i < 4; i++) part(palette.wood, 0, .54, -.23 + i * .16, 1.8, .1, .12);
    for (let i = 0; i < 3; i++) part(palette.wood, 0, .9 + i * .16, -.36, 1.8, .12, .08);
    for (const side of [-1, 1]) { part(palette.dark, side * .68, .26, 0, .1, .5, .6); part(palette.dark, side * .68, .86, -.38, .08, .9, .08); }
    collision(x, z, Math.abs(c) * .95 + Math.abs(s) * .4, Math.abs(s) * .95 + Math.abs(c) * .4);
  }
  function planter(x, z, size = .5) {
    cyl(palette.trim, x, .24, z, size, .46);
    cyl('#706b4c', x, .48, z, size * .88, .06);
    sphere('#759272', x, .8, z, size * .85, .55, size * .85);
    sphere('#98ae85', x + .16, 1.05, z, size * .5, .4, size * .5);
    collision(x, z, size, size);
  }
  function pond(area) {
    const waterMat = ownMaterial(new THREE.MeshPhysicalMaterial({ color: '#78b4ac', roughness: .23, metalness: .08, transparent: true, opacity: .87, clearcoat: .65, side: THREE.DoubleSide }));
    const water = new THREE.Mesh(ownGeometry(new THREE.CircleGeometry(1, 64)), waterMat);
    water.rotation.x = -Math.PI / 2; water.scale.set(4.45, 3.15, 1); water.position.set(0,.025,-.7);water.applyMatrix4(originMatrix); water.receiveShadow = true; group.add(water);
    // A lowered basin beneath translucent water makes the pool a volume rather than a painted disc.
    shape(cylinderGeometry, '#547f76', 0, -.14, -.7, 4.48, .28, 3.2);
    for (let i = 0; i < 44; i++) {
      const angle = i / 44 * Math.PI * 2, x = Math.cos(angle) * 4.55, z = Math.sin(angle) * 3.25 - .7;
      const size = .31 + (Math.sin(i * 13) + 1) * .1;
      shape(rockGeometry, i % 3 ? '#aeb2a2' : '#c6c7b3', x, .08, z, size * 1.3, size * .6, size, .2, angle, .2);
    }
    // Water colliders leave a deliberate gap under the walkable fishing deck.
    for (let x = -4; x <= 4; x += .8) for (let z = -3.1; z <= 2.1; z += .8) {
      if ((x / 4.25) ** 2 + ((z + .7) / 3) ** 2 < 1 && !(Math.abs(x) < 1.25 && z > .1)) collision(x, z, .41, .41);
    }
    for (let i = 0; i < 11; i++) box(palette.wood, 0, .13, .3 + i * .31, 1.8, .17, .27);
    for (const x of [-.73, .73]) for (const z of [.35, 1.8, 3.5]) cyl('#795d42', x, -.08, z, .1, .8);
    box('#c4a177', -.92, .18, 1.88, .08, .12, 3.6); box('#c4a177', .92, .18, 1.88, .08, .12, 3.6);
    const leafMat = mat('#6c9870');
    const leafGeo = ownGeometry(new THREE.CircleGeometry(1, 14, .16, Math.PI * 2 - .32));
    const lilies = [[-2.6,-1.4,.53], [2.4,-1.8,.58], [1.6,.1,.45], [-1.8,.35,.46], [.5,-2.5,.4], [-3.1,-.2,.35], [3.1,-.3,.43]];
    lilies.forEach(([x,z,size], i) => {
      shape(leafGeo, leafMat, x, .065, z, size, size, size, -Math.PI / 2, 0, i * .7);
      if (i % 2 === 0) {
        for (let petal = 0; petal < 7; petal++) {
          const a = petal / 7 * Math.PI * 2;
          shape(sphereGeometry, '#e2b4b5', x + Math.cos(a) * .12, .15, z + Math.sin(a) * .12, .1, .055, .22, .4, -a + Math.PI / 2);
        }
        sphere('#e9cd78', x, .19, z, .075, .07, .075);
      }
    });
    const rippleGeo = ownGeometry(new THREE.RingGeometry(.92, 1, 48));
    const rippleMat = ownMaterial(new THREE.MeshBasicMaterial({ color: '#d5eee3', transparent: true, opacity: .38, depthWrite: false, side: THREE.DoubleSide }));
    for (let i = 0; i < 8; i++) {
      const ripple = new THREE.Mesh(rippleGeo, rippleMat.clone()); materials.add(ripple.material);
      ripple.rotation.x = -Math.PI / 2; ripple.position.set(i%2?2.1:-1.6,.077+i*.0002,-.9+Math.sin(i*3)*.9);ripple.applyMatrix4(originMatrix);
      group.add(ripple); animated.push({ kind: 'ripple', mesh: ripple, offset: i / 8 });
    }
    for (let i = 0; i < 18; i++) {
      const angle = 3.5 + i * .075, x = Math.cos(angle) * 4.1, z = Math.sin(angle) * 3 - .7;
      const h = .6 + (i % 5) * .13;
      cyl('#7b9465', x, h / 2, z, .025, h);
      cyl('#876b4b', x, h, z, .06, .24);
      shape(coneGeometry, '#829b70', x + .08, .35, z, .045, .6, .04, 0, i, -.3);
    }
    // A small fishing rod beside the deck, with its line over the water.
    shape(cylinderGeometry, '#765c3e', .67, .75, 2.2, .025, 1.9, .025, -.6, 0, -.25);
    box('#d5d8c3', .92, .65, 1.43, .012, 1.2, .012);
    sphere('#d99776', .92, .09, 1.43, .06, .1, .06);
    bench(-3.3, 3.4, -.25); lamp(3.8, 3.8, 2.4, true);
    postSign(area.name || '荷风池塘', '走上木台 · 按 E 开始钓鱼', 3.7, 2.25, 3.1);
  }
  function wall(area) {
    box(palette.cream, 0, -.02, .5, 12.5, .12, 9);
    box('#d3d6c8', 0, .015, 2.75, 10.3, .035, 2.3);
    box(palette.dark, 0, 1.95, -1.3, 10.5, 3.6, .38);
    box('#d8c9a6', 0, 1.95, -1.065, 9.8, 2.95, .12);
    for (const x of [-5.05, 5.05]) { box(palette.wood, x, 2, -1.3, .2, 4.05, .55); collision(x, -1.3, .16, .35); }
    box(palette.wood, 0, 3.92, -1.3, 10.5, .18, .6);
    box(palette.wood, 0, .28, -1.3, 10.5, .18, .6);
    collision(0, -1.3, 5.3, .35);
    const colors = ['#e8d582','#d6a5a0','#a9c6ae','#9dbec4','#e4c3a0'];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 9; col++) {
      const x = -4.3 + col * 1.05, y = 1 + row * .84;
      const rotation = Math.sin(row * 17 + col * 3) * .1;
      shape(boxGeometry, colors[(col + row * 3) % colors.length], x, y, -.96, .73, .65, .027, 0, 0, rotation);
      cyl('#b29b64', x, y + .25, -.93, .025, .07, 0);
      // Raised pencil strokes make each note legible as a hand-made physical object.
      for (let line = 0; line < 3; line++) box('#8b8b71', x - .02, y + .12 - line * .12, -.941, .43 - ((line + col) % 3) * .07, .017, .01);
      if ((row + col) % 4 === 0) sphere('#b47e6e', x + .21, y - .18, -.925, .065, .065, .015);
    }
    textBoard(area.name || '社区贴纸墙', '留下灵感 · 分享今天的小成就', 0, 4.45, -1.25, 5.4, .82);
    bench(-3.5, 3.2); bench(3.5, 3.2); planter(-5.8, -.4); planter(5.8, -.4);
    lamp(-5.8, 3.5); lamp(5.8, 3.5);
    box(palette.sage, 0, .52, 1.25, 1.1, 1, .6); box(palette.cream, 0, 1.05, 1.25, 1.2, .1, .75);
    textBoard('灵感投递', '按 E 查看与发布', 0, .65, 1.56, .9, .5); collision(0, 1.25, .65, .4);
  }
  function trophy(x, y, z, size = 1) {
    cyl(palette.dark, x, y + .07 * size, z, .28 * size, .14 * size);
    cyl(palette.gold, x, y + .3 * size, z, .065 * size, .4 * size);
    shape(coneGeometry, palette.gold, x, y + .65 * size, z, .32 * size, .43 * size, .32 * size, Math.PI);
    cyl('#dfbd69', x, y + .87 * size, z, .33 * size, .04 * size);
    const handles = ownGeometry(new THREE.TorusGeometry(.24 * size, .037 * size, 5, 12));
    for (const side of [-1, 1]) shape(handles, palette.gold, x + side * .28 * size, y + .63 * size, z, 1, 1, 1);
  }
  function hall(area) {
    box('#dadbcb', 0, -.025, 0, 12, .15, 11);
    box(palette.cream, 0, .02, 0, 11.6, .05, 10.6);
    for (let x = -5; x <= 5; x += 1) box('#d6d9ca', x, .052, 0, .018, .009, 10.3);
    for (let z = -4.5; z <= 4.5; z += 1) box('#d6d9ca', 0, .053, z, 11.3, .009, .018);
    box(palette.sage, 0, .067, 1.35, 2.1, .025, 7.6);
    for (const x of [-4.7, 4.7]) for (const z of [-3.5, .2, 3.5]) {
      box(palette.trim, x, .2, z, .86, .35, .86); cyl(palette.cream, x, 1.9, z, .24, 3.1);
      box(palette.trim, x, 3.56, z, .77, .24, .77); collision(x, z, .46, .46);
    }
    box(palette.dark, 0, 3.82, 3.5, 10.45, .36, .76);
    shape(coneGeometry, palette.trim, 0, 4.12, 3.5, 5.6, 1.15, .62, 0, Math.PI / 4);
    textBoard(area.name || '排行榜殿堂', '每一份努力，都值得被看见', 0, 3.84, 3.91, 5.5, .8);
    box(palette.dark, 0, 1.7, -4.3, 10.2, 3.3, .28); collision(0, -4.3, 5.2, .22);
    textBoard('社区荣誉榜', '学习 · 共创 · 热心伙伴', 0, 2.55, -4.13, 5.6, .88);
    for (const [x, h, rank, color] of [[-1.65,.55,'二',palette.sage],[0,.92,'一',palette.gold],[1.65,.36,'三',palette.blue]]) {
      box(color, x, h / 2 + .08, -2, 1.4, h, 1.5); collision(x, -2, .73, .78);
      textBoard(rank, '', x, h / 2 + .08, -1.238, .45, .38, color); trophy(x, h + .1, -2, rank === '一' ? 1.12 : .8);
    }
    for (const x of [-3.55, 3.55]) {
      box(palette.trim, x, .8, -3.25, 1.2, 1.5, 1); trophy(x, 1.57, -3.25, .72); collision(x, -3.25, .65, .55);
      textBoard(x < 0 ? '共同成长' : '助人为乐', '', x, 1, -2.735, .95, .4);
    }
    for (const x of [-3.5, 3.5]) { planter(x, 3.4, .45); lamp(x, .8, 2.5, x < 0); }
    textBoard('到达殿堂后按 E 查看榜单', '', 0, 1.35, -4.12, 4.2, .45);
  }
  function computerDesk(x, z) {
    box(palette.wood, x, .83, z, 1.6, .12, .82);
    for (const dx of [-.65, .65]) for (const dz of [-.28, .28]) box(palette.dark, x + dx, .4, z + dz, .065, .8, .065);
    box('#404e47', x, 1.29, z - .16, .86, .55, .09);
    box(screenMaterial, x, 1.29, z - .108, .75, .43, .012);
    box(palette.dark, x, .99, z - .16, .06, .24, .06); box(palette.dark, x, .9, z - .16, .38, .04, .19);
    box('#c1c5b6', x - .06, .92, z + .21, .62, .045, .22);
    for (let row = 0; row < 3; row++) for (let key = 0; key < 9; key++) box('#77897b', x - .32 + key * .061, .945, z + .15 + row * .062, .042, .012, .039);
    sphere('#6d8272', x + .5, .93, z + .2, .07, .04, .1);
    box(palette.sage, x, .5, z + .96, .58, .12, .55); box(palette.sage, x, .88, z + 1.17, .58, .68, .12);
    cyl(palette.dark, x, .27, z + .96, .055, .48); box(palette.dark, x, .08, z + .96, .62, .06, .52);
    collision(x, z, .84, .46); collision(x, z + 1, .32, .38);
    // Tiny browser panes on the physical screen, facing the classroom entrance.
    box('#c8decf', x - .22, 1.29, z - .098, .21, .31, .008);
    for (let i = 0; i < 3; i++) box('#d9e8d8', x + .11, 1.4 - i * .1, z - .098, .29, .032, .008);
  }
  function lab(area) {
    box(palette.cream, 0, -.025, 0, 12.8, .14, 11.7);
    for (const x of [-6.1, 6.1]) { box(palette.sage, x, .52, -.4, .22, 1, 10.2); collision(x, -.4, .17, 5.15); }
    box('#c8d0bf', 0, 1.5, -5.3, 12.3, 2.95, .24); collision(0, -5.3, 6.2, .17);
    box(palette.dark, 0, 1.85, -5.12, 5.1, 1.7, .1);
    textBoard('今天也要有所收获', '进入机房 · 按 E 打开学习任务', 0, 1.85, -5.055, 4.8, 1.38, '#ccd7c0');
    for (const x of [-4.1,-2.1,2.1,4.1]) for (const z of [-2.75,.05,2.85]) computerDesk(x,z);
    box(palette.wood, 0, .82, -3.65, 2.7, .14, 1.05);
    box(palette.dark, 0, .4, -3.65, 2.4, .75, .8); collision(0, -3.65, 1.4, .56);
    box('#526954', 0, .94, -3.65, .8, .07, .5);
    for (const x of [-5.6,5.6]) { box(palette.dark,x,1.8,5.05,.16,3.6,.16); collision(x,5.05,.12,.12); }
    box(palette.dark,0,3.62,5.05,11.35,.21,.25);
    textBoard(area.name || '社区机房', '一起学习 · 一起创造',0,3.65,5.21,4.6,.78);
    planter(-5.5,4.5,.4); planter(5.5,4.5,.4);
    for (const x of [-5.2,5.2]) lamp(x,-4.45,2.6,x>0);
  }
  for (const area of areas) {
    origin={x:Number(area.x)||0,z:Number(area.z)||0,rotation:area.rotation||0};originMatrix.makeRotationY(origin.rotation*Math.PI/180);originMatrix.setPosition(origin.x,0,origin.z);
    const builder = { pond, wall, hall, lab }[area.kind];
    if (builder) builder(area);
  }
  for (const { geometry, material, matrices } of batches.values()) {
    const instance = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, index) => instance.setMatrixAt(index, matrix));
    instance.castShadow = true; instance.receiveShadow = true; instance.computeBoundingSphere(); group.add(instance);
  }
  batches.clear();
  let disposed = false;
  function update(time = 0, night = false) {
    if (disposed) return;
    const darkness = Math.min(1, Math.max(0, typeof night === 'boolean' ? Number(night) : Number(night) || 0));
    glowMaterial.emissiveIntensity = .12 + darkness * 2.2;
    screenMaterial.emissiveIntensity = .2 + darkness * .7;
    lamps.forEach(light => { light.intensity = darkness * 8; });
    for (const animation of animated) {
      const phase = (time * .24 + animation.offset) % 1;
      animation.mesh.scale.setScalar(.18 + phase * .85);
      animation.mesh.material.opacity = Math.sin(phase * Math.PI) * .38;
    }
  }
  function dispose() {
    if (disposed) return; disposed = true;
    group.removeFromParent();
    group.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
    group.clear(); colliders.length = 0;
  }
  return { group, colliders, update, dispose };
}

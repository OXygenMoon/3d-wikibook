import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { effectiveSize, formatModelSize } from './model-meta.js';

class ModelPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 200);
    this.scene.add(new THREE.HemisphereLight('#fff8e7', '#70836b', 2.2));
    const sun = new THREE.DirectionalLight('#fff4d6', 2.4);
    sun.position.set(4, 8, 5);
    this.scene.add(sun);
    this.grid = new THREE.GridHelper(4, 8, '#9eb68d', '#cbd8c0');
    this.grid.position.y = -0.001;
    this.scene.add(this.grid);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.loader = new GLTFLoader();
    this.frame = 0;
    this.running = true;
    this.resize();
    this.animate();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(220, rect.width || 360);
    const height = Math.max(180, rect.height || 260);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  async load(file) {
    const buffer = await file.arrayBuffer();
    const gltf = await this.loader.parseAsync(buffer, '');
    const object = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) throw new Error('模型没有可显示的几何体。');
    const size = box.getSize(new THREE.Vector3());
    const max = Math.max(size.x, size.y, size.z) || 1;
    const center = box.getCenter(new THREE.Vector3());
    object.position.set(-center.x, -box.min.y, -center.z);
    this.group.clear();
    const fit = new THREE.Group();
    fit.scale.setScalar(2 / max);
    fit.add(object);
    this.group.add(fit);
    object.traverse(mesh => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    this.camera.position.set(2.6, 2.1, 3.2);
    this.camera.lookAt(0, 0.75, 0);
    this.native = { width: size.x, height: size.y, depth: size.z };
    return this.native;
  }

  animate() {
    if (!this.running) return;
    this.frame = requestAnimationFrame(() => this.animate());
    this.group.rotation.y += 0.008;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.renderer.dispose();
    this.scene.traverse(object => {
      if (object.isMesh) {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
        else object.material?.dispose();
      }
    });
  }
}

export class ModelImporter {
  constructor({ state, world, request, esc, toast }) {
    this.state = state;
    this.world = world;
    this.request = request;
    this.esc = esc;
    this.toast = toast;
    this.overlay = null;
    this.preview = null;
    this.file = null;
    this.native = null;
    this.onImported = null;
    this.trigger = null;
  }

  isOpen() {
    return Boolean(this.overlay);
  }

  open({ context = 'user', onImported = null } = {}) {
    if (!this.state.user) {
      this.toast('请先登录账号。');
      return;
    }
    if (this.overlay) this.close();
    this.context = context;
    this.onImported = onImported;
    this.trigger = document.activeElement;
    this.file = null;
    this.native = null;
    const admin = context === 'admin';
    const min = admin ? 0.5 : 0.1;
    const max = admin ? 32 : 3.5;
    const value = admin ? 4 : 1;
    const overlay = document.createElement('div');
    overlay.className = 'model-import-overlay';
    overlay.innerHTML = `
      <section class="model-import-dialog" role="dialog" aria-modal="true" aria-label="导入 3D 模型">
        <header class="dialog-header">
          <div><p class="eyebrow">${admin ? '世界模型库' : '我的 3D 模型'}</p><h2>把一个想法带进社区。</h2></div>
          <button type="button" class="close-button" data-model-import-close aria-label="关闭">×</button>
        </header>
        <div class="model-import-grid">
          <div class="model-preview-panel">
            <canvas id="model-preview-canvas" width="420" height="300" aria-label="3D 模型预览"></canvas>
            <div class="model-preview-empty" id="model-preview-empty">选择一个自包含 GLB 文件<br><small>预览会自动旋转，底部对齐地面</small></div>
            <div class="model-preview-meta" id="model-preview-meta">尚未选择模型</div>
          </div>
          <form id="model-import-form">
            <label class="form-label">模型名称<input name="name" maxlength="40" required placeholder="例如：我的小书架"></label>
            <label class="form-label">描述<textarea name="description" maxlength="160" rows="3" placeholder="它是什么？适合放在哪里？"></textarea></label>
            <label class="form-label model-scale-label"><span>缩放倍率 <output id="model-scale-output">${value.toFixed(2)}×</output></span><input id="model-scale" name="scale" type="range" min="${min}" max="${max}" step="0.05" value="${value}"></label>
            <p class="subtle">1.0 = 模型最长边 1 米；按比例缩放，不会拉伸。${admin ? '世界建筑最大 32 米。' : '工位模型最大 3.5 米。'}</p>
            <label class="form-label">GLB 文件<input id="model-file" name="file" type="file" accept=".glb,model/gltf-binary" required></label>
            <p class="subtle">${admin ? '自包含 GLB，≤20 MiB、≤30 万三角形。' : '自包含 GLB，≤5 MiB、≤8 万三角形。个人模型仅自己可见。'}</p>
            <p class="form-error" id="model-import-error" role="alert"></p>
            <footer class="dialog-footer"><span>导入后即可放入${admin ? '世界' : '工位'}。</span><div class="model-import-actions"><button type="button" class="secondary" data-model-import-close>取消</button><button type="submit" class="primary">导入并保存</button></div></footer>
          </form>
        </div>
      </section>`;
    document.querySelector('#panels').append(overlay);
    this.overlay = overlay;
    this.world.paused = true;
    this.world.keys.clear();
    this.preview = new ModelPreview(overlay.querySelector('#model-preview-canvas'));
    overlay.querySelectorAll('[data-model-import-close]').forEach(button => button.addEventListener('click', () => this.close()));
    overlay.querySelector('#model-file').addEventListener('change', event => this.handleFile(event.target.files[0]));
    overlay.querySelector('#model-scale').addEventListener('input', event => this.updateScale(Number(event.target.value)));
    requestAnimationFrame(() => {
      this.preview.resize();
      overlay.querySelector('input[name="name"]')?.focus({ preventScroll: true });
    });
  }

  close() {
    if (!this.overlay) return;
    this.preview?.dispose();
    this.preview = null;
    this.overlay.remove();
    this.overlay = null;
    this.file = null;
    this.native = null;
    this.world.paused = Boolean(this.state.panel);
    if (this.trigger?.isConnected) this.trigger.focus({ preventScroll: true });
    this.onImported = null;
  }

  updateScale(scale) {
    if (!Number.isFinite(scale)) return;
    const output = this.overlay?.querySelector('#model-scale-output');
    if (output) output.textContent = `${scale.toFixed(2)}×`;
    const meta = this.overlay?.querySelector('#model-preview-meta');
    if (!meta || !this.native) return;
    const asset = { ...this.native, scale };
    meta.innerHTML = `原始 ${this.native.width.toFixed(2)} × ${this.native.height.toFixed(2)} × ${this.native.depth.toFixed(2)} 米<br><b>导入后 ${formatModelSize(asset)}</b>`;
  }

  async handleFile(file) {
    if (!file) return;
    const error = this.overlay?.querySelector('#model-import-error');
    if (error) error.textContent = '';
    if (!file.name.toLowerCase().endsWith('.glb')) {
      if (error) error.textContent = '请选择 .glb 文件。';
      return;
    }
    const limit = this.context === 'admin' ? 20 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > limit) {
      if (error) error.textContent = `文件不能超过 ${Math.round(limit / 1024 / 1024)} MiB。`;
      return;
    }
    try {
      this.file = file;
      this.native = await this.preview.load(file);
      const empty = this.overlay?.querySelector('#model-preview-empty');
      if (empty) empty.hidden = true;
      const name = this.overlay?.querySelector('input[name="name"]');
      if (name && !name.value) name.value = file.name.replace(/\.glb$/i, '').slice(0, 40);
      this.updateScale(Number(this.overlay.querySelector('#model-scale').value));
    } catch (err) {
      this.file = null;
      this.native = null;
      if (error) error.textContent = `无法读取模型：${err.message}`;
    }
  }

  async submit(form) {
    if (!this.file || !this.native) {
      const error = form.querySelector('#model-import-error');
      if (error) error.textContent = '请先选择一个可预览的 GLB 文件。';
      return;
    }
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    if (!name) {
      form.querySelector('#model-import-error').textContent = '请填写模型名称。';
      return;
    }
    const scale = Number(data.get('scale'));
    const button = form.querySelector('button[type="submit"]');
    const error = form.querySelector('#model-import-error');
    button.disabled = true;
    button.textContent = '正在上传…';
    try {
      const endpoint = this.context === 'admin' ? '/api/admin/models' : '/api/models';
      const params = new URLSearchParams({
        filename: this.file.name,
        name,
        description: String(data.get('description') || ''),
        scale: String(scale),
        width: String(this.native.width),
        height: String(this.native.height),
        depth: String(this.native.depth),
      });
      const response = await fetch(`${endpoint}?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'model/gltf-binary', 'X-Session-Token': this.state.token },
        body: this.file,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '模型导入失败。');
      const asset = result.asset;
      const callback = this.onImported;
      this.close();
      callback?.(asset);
      this.toast(this.context === 'admin' ? '模型已保存，可以放入世界了。' : '模型已保存，可以在工位里摆放了。');
    } catch (err) {
      if (error) error.textContent = err.message;
      button.disabled = false;
      button.textContent = '导入并保存';
    }
  }
}

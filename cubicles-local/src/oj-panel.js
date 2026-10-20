export function embeddedWikiBookUrl(url, module = 'oj') {
  const target = new URL(url);
  target.searchParams.set('embed', `community-${module}`);
  return target.href;
}

export const embeddedOjUrl = url => embeddedWikiBookUrl(url, 'oj');

const MODULES = {
  oj: { title: 'WikiBook OJ', area: '云端机房', place: '机房', env: 'WIKIBOOK_OJ_URL', root: 'oj-workspace', prefix: 'oj', action: 'data-oj', frame: 'oj-frame' },
  fishing: { title: 'WikiBook 钓鱼', area: '荷风池塘', place: '池塘', env: 'WIKIBOOK_FISHING_URL', root: 'wikibook-fishing-workspace', prefix: 'wikibook-fishing', action: 'data-wikibook-fishing', frame: 'fishing-frame' },
};

export class WikiBookPanel {
  constructor({ esc, close, tasks, module = 'oj' }) {
    if (!MODULES[module]) throw new Error('未知 WikiBook 模块。');
    Object.assign(this, { esc, close, tasks, module, definition: MODULES[module] });
    this.root = document.createElement('div');
    this.root.id = this.definition.root;
    this.root.dataset.wikibookWorkspace = module;
    this.root.hidden = true;
    document.body.append(this.root);
    this.root.addEventListener('click', event => {
      const action = event.target.closest(`[${this.definition.action}]`)?.getAttribute(this.definition.action);
      if (action === 'return') this.close();
      if (action === 'immersive') this.toggleImmersive();
      if (action === 'tasks') this.tasks?.();
      if (action === 'reload' && confirm(this.module === 'oj' ? '刷新 OJ 可能丢失尚未保存的代码，继续吗？' : '刷新钓鱼页面会重新连接 WikiBook，钓鱼计时不会暂停。继续吗？')) this.load();
    });
    document.addEventListener('fullscreenchange', () => {
      if (this.nativeFullscreen && document.fullscreenElement !== this.root) this.setImmersive(false);
      this.nativeFullscreen = document.fullscreenElement === this.root;
    });
  }

  show(data) {
    const url = data?.[this.module]?.url || '';
    if (url !== this.url || !this.root.children.length) {
      clearTimeout(this.loadingTimer);
      this.url = url;
      const { title, area, place, env, prefix, action, frame } = this.definition;
      const mixed = location.protocol === 'https:' && url.startsWith('http:');
      this.embeddable = Boolean(url) && !mixed;
      const externalLogin = url && new URL(url).protocol === 'http:' && new URL(url).hostname !== location.hostname;
      this.root.innerHTML = `<section class="oj-shell" role="dialog" aria-modal="true" aria-label="${title} ${place}" aria-describedby="${prefix}-help"><header class="oj-toolbar"><div class="oj-title"><span>${area}</span><h2>${title}</h2></div><nav aria-label="${title}工作台操作"><button type="button" ${action}="immersive" class="secondary" aria-pressed="false">沉浸全屏 · F8</button><button type="button" ${action}="return" class="primary">返回 3D 世界</button></nav></header><div class="oj-connection"><span role="status" id="${prefix}-status">${!url?`尚未配置地址，请联系管理员设置 ${env}。`:mixed?'当前社区使用 HTTPS，请配置 HTTPS 的 WikiBook 地址；也可在独立标签页中访问。':`正在连接 ${title}…`}</span><div>${url?`<a href="${this.esc(url)}" target="_blank" rel="noopener noreferrer">独立标签页打开 ↗</a>`:''}${this.embeddable?`<button type="button" ${action}="reload">重新加载</button>`:''}${this.tasks?`<button type="button" ${action}="tasks">社区任务卡</button>`:''}</div></div>${externalLogin?'<p class="wikibook-login-note">远端为 HTTP，跨站嵌入可能无法保持登录；若反复要求登录，请使用上方“独立标签页打开”，无需降低浏览器安全设置。</p>':''}${this.embeddable?`<iframe class="wikibook-frame ${frame}" title="${title}${this.module==='oj'?' 编程':'游戏'}页面" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"></iframe>`:`<div class="oj-empty">${title} 暂时无法在${place}内显示，返回世界不会影响当前位置。</div>`}<footer id="${prefix}-help">${title} 使用 WikiBook 自己的登录。若空白、登录受限或连接失败，请使用“独立标签页打开”。${this.module==='fishing'?'<span>鱼饵、渔获、星星和排行由 WikiBook 记录，不自动计入社区活力；返回世界不会暂停钓鱼计时。</span>':''}<span>工具栏聚焦时：F8 切换沉浸，F7 返回世界；页面内请点击上方按钮。返回后保留页面，刷新社区则会重载。</span></footer></section>`;
      if (this.embeddable) {
        const frame = this.root.querySelector('iframe');
        frame.addEventListener('load', () => {
          clearTimeout(this.loadingTimer);
          this.status(`${title} 页面响应已返回；若未正常显示，请使用独立标签页。`);
        });
        frame.addEventListener('error', () => this.status('连接失败，请检查 WikiBook 服务或使用独立标签页。'));
        this.load();
      }
    }
    this.root.hidden = false;
  }

  status(message) { this.root.querySelector('[role="status"]').textContent = message; }

  load() {
    clearTimeout(this.loadingTimer);
    this.status(`正在连接 ${this.definition.title}…`);
    this.root.querySelector('iframe').src = embeddedWikiBookUrl(this.url, this.module);
    this.loadingTimer = setTimeout(() => this.status('WikiBook 加载较慢。请确认服务已启动；若仍空白，请在独立标签页打开。'), 12000);
  }

  setImmersive(value) {
    this.root.classList.toggle('immersive', value);
    const button = this.root.querySelector(`[${this.definition.action}="immersive"]`);
    if (button) {
      button.textContent = value ? '退出沉浸 · F8' : '沉浸全屏 · F8';
      button.setAttribute('aria-pressed', String(value));
    }
  }

  async toggleImmersive() {
    if (this.root.classList.contains('immersive')) return this.exitImmersive();
    this.setImmersive(true);
    try {
      if (this.root.requestFullscreen) {
        await this.root.requestFullscreen();
        this.nativeFullscreen = document.fullscreenElement === this.root;
        if ((this.root.hidden || !this.root.classList.contains('immersive')) && this.nativeFullscreen) await this.exitImmersive();
      }
    } catch {
      this.status('浏览器未允许系统全屏，已改为窗口内沉浸模式。');
    }
  }

  async exitImmersive() {
    this.setImmersive(false);
    if (document.fullscreenElement === this.root) {
      try { await document.exitFullscreen(); } catch {}
    }
  }

  hide() {
    this.root.hidden = true;
    this.exitImmersive();
  }

  keydown(event) {
    if (event.key === 'Tab') {
      const targets = [...this.root.querySelectorAll('button,a,iframe')];
      if (event.shiftKey && document.activeElement === targets[0]) { event.preventDefault(); targets.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === targets.at(-1)) { event.preventDefault(); targets[0].focus(); }
      return;
    }
    if (event.repeat) return;
    if (event.key === 'F8') { event.preventDefault(); this.toggleImmersive(); }
    if (event.key === 'F7') { event.preventDefault(); this.close(); }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.root.classList.contains('immersive')) this.exitImmersive();
      else this.close();
    }
  }
}

export class OJPanel extends WikiBookPanel {}

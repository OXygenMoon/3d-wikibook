import { OfficeWorld } from './world.js';
import { offices, neighborhoods, outfits, spawn, home } from './data.js';
import { icon } from './icons.js';
import {footprint} from './grid.js';
import {WorldEditor} from './world-editor.js';
import { CommunityUI } from './community-ui.js';
import { PUBLIC_AREAS, withinOffice } from './community.js';
let community,layoutEditor;

const $ = selector => document.querySelector(selector);
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const store = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const state = {
  profile: read('cubicles.profile', { name:'', avatar:'classic', color:outfits[0] }),
  aura:read('cubicles.aura',0), catches:read('cubicles.catches',[]), panel:null, online:1, visitors:0, messages:[],
  user:null,zones:[],settings:{timeMode:'auto',hour:20},revision:0, token:sessionStorage.getItem('cubicles.token') || '', entered:false, ready:false, leaderboard:false, leaderboardTab:'工位', chat:false, music:false, musicPlaying:false,
};
const world = new OfficeWorld($('#world'));
world.outfit = { ...state.profile };
let tickBusy=false, reaction='', reconnecting=false, panelOrigin=null, touchVisible=false, fishingFrame=0;
const btn = (action,label,ico,cls='') => `<button class="${cls}" data-action="${action}">${ico?icon(ico):''}<span>${label}</span></button>`;

function toast(message) { const el=document.createElement('div');el.className='toast';el.innerHTML=`${icon('check')}<span>${esc(message)}</span>`;$('#toasts').append(el);setTimeout(()=>el.remove(),3400); }
function hud() {
  $('#ui').innerHTML=`
    <div class="top-left"><button class="wordmark" data-action="about" aria-label="关于格子社区">${icon('cube')}<strong>格子社区</strong></button><button class="online-pill" data-action="people" aria-label="查看在线伙伴"><i></i><span id="online-count">1 人在线</span></button></div>
    <nav class="account" aria-label="个人资料"><span id="profile-name">${esc(state.profile.name||'访客')}</span>${state.user?btn('account','我的账号'):btn('login','登录')}${state.user?.role==='admin'?btn('admin','管理后台'):''}</nav>
    <div class="top-right">${btn('camera','第一人称','camera','pill camera-button')}<div class="zoom-group"><button data-action="zoom-out" aria-label="缩小视野">${icon('minus')}</button><button data-action="zoom-in" aria-label="放大视野">${icon('plus')}</button></div>${btn('menu','菜单','menu','pill')}</div>
    <div class="left-rail"><div class="visitor-counter"><span>累计到访</span><div id="visitor-digits">${'000001'.split('').map(n=>`<b>${n}</b>`).join('')}</div></div>${btn('aura',`${state.aura} 活力值`,'star','pill aura-button')}<button class="community-pill" data-action="about"><b>邻</b><span>小小工位，大大梦想</span>${icon('external')}</button><section class="radio"><button class="radio-toggle" data-action="music" aria-expanded="false">${icon('sound')}<span>音乐</span>${icon('chevron')}</button><div id="radio-content" hidden></div></section></div>
    <div class="leaderboard-wrap public-nav"><div id="community-clock" class="pill"></div>${PUBLIC_AREAS.map(a=>`<button class="pill" data-area-visit="${a.id}">${{pond:'🪷',wall:'🗒️',hall:'🏆',lab:'🖥️'}[a.id]} ${esc(a.name)}</button>`).join('')}<div id="leaderboard-content" hidden></div></div>
    <button class="minimap" data-action="map" aria-label="打开社区地图"><canvas id="minimap" aria-label="社区小地图" width="320" height="320"></canvas><span class="minimap-north" >北</span></button>
    <div id="nearby-prompt" class="nearby-prompt" hidden></div>
    <div class="quick-hint" id="quick-hint"><kbd>WASD</kbd><span>移动 · 也可使用方向键</span>${btn('controls','查看操作','help')}<button data-action="dismiss-hint" aria-label="关闭操作提示">${icon('close')}</button></div>
    <button class="controls-button pill" data-action="controls">${icon('help')}<span>操作</span></button>
    <div class="world-credit">小小工位，装下大大梦想。</div>
    <nav class="quick-actions" aria-label="快捷操作">${btn('chat','聊天','chat','pill')}${btn('dance','跳舞','music','pill')}${btn('character','角色','user','pill')}${btn('backpack','背包','cube','pill context-inventory')}<button class="pill reaction-button" data-action="reactions" aria-label="表情反应">👋</button>${btn('map','地图','map','pill')}</nav>
    <div id="reaction-popover" class="reaction-popover" hidden>${['👋','❤️','✨','☕','🎉','🌿'].map(e=>`<button data-reaction="${e}" aria-label="发送表情 ${e}">${e}</button>`).join('')}</div>
    <aside id="chat-panel" hidden aria-label="社区聊天"></aside>
    <div class="touch-controls" id="touch-controls" hidden><div id="joystick" class="joystick"><span></span></div><div class="touch-buttons">${btn('run','奔跑')}${btn('jump','跳跃')}</div></div>
  `;
  updateStats();renderRadio();renderLeaderboard();renderChat();
  $('#joystick').addEventListener('pointerdown',startJoystick);$('#touch-controls').hidden=!touchVisible;if(touchVisible)$('#quick-hint').hidden=true;
}
function updateStats() {
  if(!$('#online-count'))return;
  $('#online-count').textContent=`${state.online} 人在线`;
  $('#visitor-digits').innerHTML=String(state.visitors).padStart(6,'0').slice(-6).split('').map(n=>`<b>${n}</b>`).join('');
  $('.aura-button span').textContent=`${state.aura} 活力值`;
  $('#profile-name').textContent=state.profile.name||'访客';
}
function award(amount) { updateStats(); }

function panelShell(title,content,{wide=false,eyebrow='',className=''}={}) {
  return `<div class="backdrop"><section class="dialog ${wide?'wide':''} ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="dialog-header"><div>${eyebrow?`<p class="eyebrow">${eyebrow}</p>`:''}<h2>${title}</h2></div><button class="close-button" data-action="close" aria-label="关闭">${icon('close')}</button></header>${content}</section></div>`;
}
function lockPanelButtons(){ $('#panels').querySelectorAll('button:not([disabled])').forEach(b=>{b.dataset.busyDisabled='1';b.disabled=true;});}
function openPanel(name,data) {
  if(document.pointerLockElement)document.exitPointerLock();
  panelOrigin=document.activeElement;state.panel=name;state.panelData=data;world.paused=true;world.keys.clear();$('#panels').innerHTML=renderPanel(name,data);$('#ui').inert=true;
  if(state.saving)lockPanelButtons();requestAnimationFrame(()=>$('#panels').querySelector('input,button:not([disabled]),[tabindex="0"]')?.focus({preventScroll:true}));
  if(name==='map')drawMapPosition();
}
function closePanel() {
  cancelAnimationFrame(fishingFrame);if(state.panel==='world-editor')layoutEditor?.cancel();if(state.panel==='editor'&&community?.draft){const o=community.ownOffice();if(o)world.setFurniture(o,o.furniture);community.draft=null;}state.panel=null;$('#panels').innerHTML='';$('#ui').inert=false;world.paused=false;world.keys.clear();
  if(panelOrigin?.isConnected)panelOrigin.focus({preventScroll:true});else $('#world').focus();
}
function renderPanel(name,data) {
  const layout=layoutEditor?.render(name);if(layout)return layout;
  const custom=community?.render(name,data);if(custom)return custom;
  if(name==='welcome') return `<div class="welcome-shade"><section class="welcome-card" role="dialog" aria-modal="true" aria-label="互联网里，有了我们的社区。"><button class="welcome-close" data-action="enter" aria-label="关闭欢迎页面">${icon('close')}</button><div class="welcome-brand">${icon('cube')}<b>格子社区</b></div><h1>互联网里，<br>有了我们的社区。</h1><p>逛逛社区，认识伙伴，<br class="desktop-only">一起创造属于我们的空间。</p><button class="enter-button" data-action="enter" ${state.ready?'':'disabled'}><span>${state.ready?'进入社区':'正在准备你的空间…'}</span>${state.ready?icon('arrow'):'<i class="spinner"></i>'}</button><small>无需注册，自由探索。</small><div class="welcome-bottom"><span class="live-dot"></span> 小小工位，大大梦想 ${icon('external')}</div><div class="load-track"><div id="load-progress" style="width:${state.ready?100:0}%"></div></div></section></div>`;
  if(name==='controls')return panelShell('操作',`<p class="dialog-intro">自由走动，认识伙伴，留意身边的互动提示。</p><div class="control-tabs"><div class="tabs" role="tablist" aria-label="操作类型"><button class="active" data-controltab="world" role="tab" aria-selected="true">社区</button><button data-controltab="editing" role="tab" aria-selected="false">布置</button></div><button class="quiet" data-action="touch">${icon('keyboard')} 键盘 / 触控</button></div><div id="control-content">${controlsContent()}</div><footer class="dialog-footer"><span>先来逛逛，再打造属于你的空间。</span>${btn('close','返回社区','','small-button')}</footer>`,{eyebrow:'操作指南',className:'controls-dialog'});
  if(name==='map')return panelShell('社区地图',`<div class="map-layout"><div class="world-map-art">${mapSVG()}</div><aside class="map-side">${PUBLIC_AREAS.map(a=>`<div class="map-place"><span>${{pond:'🪷',wall:'🗒️',hall:'🏆',lab:'🖥️'}[a.id]}</span><div><b>${esc(a.name)}</b><small>抵达区域后按 E 互动</small></div><button data-area-visit="${a.id}" aria-label="前往${esc(a.name)}"></button></div>`).join('')}</aside></div><div class="map-tools"><h3>班级区域与工位</h3><label class="search-field">${icon('search')}<input id="map-search" placeholder="搜索工位、伙伴或班级…" aria-label="搜索工位与区域" autocomplete="off"></label></div><div id="map-results">${mapResults()}</div><p class="map-footnote">我的工位支持独立布置，公共功能需到达对应区域后使用。</p>`,{wide:true,className:'map-dialog'});
  if(name==='character')return panelShell('选一个喜欢的样子。',`${characterCards()}<div class="outfit-section"><span class="eyebrow">换个喜欢的颜色</span><div class="swatches">${outfits.map(c=>`<button class="swatch ${state.profile.color===c?'selected':''}" style="--swatch:${c}" data-color="${c}" aria-pressed="${state.profile.color===c}" aria-label="选择服装颜色 ${c}">${state.profile.color===c?icon('check'):''}</button>`).join('')}</div></div><p class="subtle center">社区里的伙伴都能看到你的新造型。</p>`,{eyebrow:'我的角色',className:'character-dialog'});
  if(name==='profile')return panelShell('欢迎来到自己的小天地。',`<p class="dialog-intro">选个好记的名字，让伙伴们认识你。</p><form id="profile-form"><label class="form-label">你的昵称<input name="name" required maxlength="24" placeholder="希望大家怎么称呼你？" value="${esc(state.profile.name)}" autocomplete="nickname"></label><div class="profile-preview"><div class="mini-avatar" style="--shirt:${state.profile.color}"><i></i><b></b><span></span></div><div><strong>${esc(state.profile.name||'从这里开始新故事')}</strong><p>你的资料会保存在当前浏览器。</p></div></div><button class="primary" type="submit">加入社区 ${icon('arrow')}</button></form>`,{eyebrow:'你好，新伙伴',className:'profile-dialog'});
  if(name==='office')return officePanel(data);
  if(name==='menu')return panelShell('欢迎来到自己的小天地。',`<div class="menu-list">${menuItem('map','map','探索社区','发现新区域，认识新伙伴')}${menuItem(state.user?'account':'login','user',state.user?'我的账号':'登录账号','登录后回到自己的工位')}${menuItem('my-office','pin','我的工位','回到自己的空间')}${menuItem('backpack','cube','家具背包','查看拥有的家具与摆件')}${state.user?.role==='admin'?menuItem('admin','edit','管理员后台','账号、班级、工位与昼夜'):''}${menuItem('controls','keyboard','操作指南','了解社区里的各种玩法')}${menuItem('plaza','leaf','逛逛中心广场','找个安静地方歇一歇')}${menuItem('drive','car','开车兜风','小车正停在林荫大道旁')}${menuItem('fishing','fish','去钓鱼','看看荷风池塘有什么收获')}${menuItem('reset-camera','reset','重置视角','回到熟悉的观察角度')}</div><div class="menu-setting"><label for="daylight">日光亮度</label><input id="daylight" type="range" min=".7" max="1.7" step=".05" value="${world.renderer.toneMappingExposure}"></div><p class="subtle center">属于我们的小小社区。</p>`,{eyebrow:'社区菜单',className:'menu-dialog'});
  if(name==='people')return panelShell('伙伴就在身边。',`<p class="dialog-intro">当前有 ${state.online} 位伙伴正在探索社区。</p><div class="person-row"><span class="person-dot" style="background:${state.profile.color}"></span><div><b>${esc(state.profile.name||'访客')}</b><small>这是你 · 中心广场</small></div><span class="tag">在这里</span></div>${[...world.remote.values()].map((p,i)=>`<div class="person-row"><span class="person-dot" style="background:${p.color}"></span><div><b>${esc(state.lastPlayers?.[i]?.name||'伙伴')}</b><small>正在探索社区</small></div></div>`).join('')}<div class="empty-note">在另一个窗口打开这个本地地址，即可一起探索。</div>`,{eyebrow:'社区伙伴'});
  if(name==='aura')return panelShell('每一份成长，都值得记录。',`<div class="aura-total">${icon('star')}<strong>${state.aura}</strong><span>我的活力值</span></div><p class="dialog-intro center">在机房完成任务，在池塘收获惊喜。<br>活力按账号记录，前往排行榜殿堂查看。</p><div class="reward-row"><span>完成一张机房任务卡（每项一次）</span><b>+5 活力</b></div><div class="reward-row"><span>在池塘钓到一条鱼</span><b>+10 活力</b></div><button class="primary" data-area-visit="hall">前往排行榜殿堂 ${icon('arrow')}</button>`,{eyebrow:'活力与奖励'});
  if(name==='fishing')return panelShell('给自己一点慢时光。',`<p class="dialog-intro">在荷风池塘坐一坐，不必着急。</p><div class="fishing-scene"><span class="fish-cloud one"></span><span class="fish-cloud two"></span><span class="fishing-sun"></span><span class="fishing-pier"></span><span class="fishing-line"></span><span class="fishing-bobber"></span><span class="water-lines">∿ &nbsp; ∿ &nbsp; ∿ &nbsp; ∿</span></div><div id="fishing-status"><h3>看看今天有什么收获。</h3><p>先抛竿，再在指针进入绿色区域时收线。</p><div class="fishing-meter"><i class="sweet-spot"></i><b id="fishing-cursor"></b></div><button class="primary" data-action="cast">抛竿 ${icon('fish')}</button></div><p class="subtle center" id="fishing-best">最佳收获：${state.catches.length?Math.max(...state.catches.map(c=>c.weight)).toFixed(1)+' 千克':'还在等待第一条鱼'}</p>`,{eyebrow:'荷风池塘',className:'fishing-dialog'});
  return panelShell('小小工位，装下大大梦想。',`<div class="about-cube">${icon('cube')}</div><p class="about-copy">互联网里，有了我们的社区。</p><p class="dialog-intro center">这里有热爱创造的伙伴，也有等待实现的想法。走一走、聊一聊，让每一次相遇都带来一点新灵感。</p><div class="about-stats"><div><b>${offices.length}</b><span>个探索工位</span></div><div><b>${neighborhoods.length+PUBLIC_AREAS.length}</b><span>个社区区域</span></div><div><b>∞</b><span>种可能</span></div></div><button class="primary" data-action="map">找到我的位置 ${icon('arrow')}</button>`,{eyebrow:'欢迎来到格子社区'});
}
function menuItem(action,ico,title,desc) { return `<button data-action="${action}" class="menu-item">${icon(ico)}<div><strong>${title}</strong><small>${desc}</small></div>${icon('chevron')}</button>`; }
function controlsContent(editing=false) {
  const item=(ico,title,keys,desc)=>`<article class="control-item">${icon(ico)}<div><div class="control-title"><strong>${title}</strong>${keys?`<div>${keys.split(' ').map(k=>`<kbd>${({Space:'空格',Enter:'回车',Esc:'退出'})[k]||k}</kbd>`).join('')}</div>`:''}</div><p>${desc}</p></div></article>`;
  if(editing)return `<div class="editing-guide">${item('edit','布置我的工位','','登录并抵达自己的工位，按 B 打开编辑。拖动家具平面图，实时预览和保存。')}${item('check','保存修改','','家具、资料和角色按账号保存在本地服务器。')}${item('home','继续探索','Esc','关闭工位面板，继续逛逛社区。')}</div>`;
  return `<div class="control-columns"><section><h3 class="eyebrow">移动与视角</h3>${item('compass','移动','W A S D','方向键也可移动。按住 Shift 奔跑，空格键跳跃。')}${item('plus','二段跳','Space','松开空格，在接近跳跃顶点时再按一次，即可前空翻。')}${item('camera','镜头','','点击地面自动绕行。拖拽旋转视角，滚轮或 + / − 调整远近。')}${item('camera','第一人称','F','按 F 切换第一人称。移动鼠标观察四周；无法锁定鼠标时，可拖拽查看。')}<h3 class="eyebrow">互动与聊天</h3>${item('user','互动','E','按 E 触发附近互动。双击工位查看介绍。')}${item('chat','社区聊天','Enter','按回车键打开聊天，向社区伙伴打个招呼。')}${item('star','表情','','点击挥手按钮，选择一个表情。')}</section><section><h3 class="eyebrow">驾驶</h3>${item('car','上下车','E','找到路边的小车，按 E 上车或下车。')}${item('compass','驾驶小车','W A S D','用移动键驾驶，按住 Shift 加速。')}<h3 class="eyebrow section-space">池塘钓鱼</h3>${item('fish','放松片刻','','到达荷风池塘区域后按 E。抛竿后，在指针进入绿色区域时收线。')}<h3 class="eyebrow section-space">探索</h3>${item('map','地图与搜索','M','前往不同区域，搜索伙伴、工位和感兴趣的地方。')}${item('close','关闭面板','Esc','随时返回社区，继续探索。')}</section></div>`;
}
function characterCards() {
  return `<div class="character-options">${['classic','smooth'].map(type=>`<button class="character-option ${state.profile.avatar===type?'selected':''}" data-avatar="${type}" aria-pressed="${state.profile.avatar===type}"><div class="avatar-stage ${type}"><div class="mini-avatar" style="--shirt:${state.profile.color}"><i></i><b></b><span></span></div><span class="avatar-shadow"></span></div><div class="character-option-title"><strong>${type==='classic'?'经典':'圆润'}</strong>${state.profile.avatar===type?`<span class="current-tag">${icon('check')} 已选择</span>`:''}</div><p>${type==='classic'?'方方正正，经典的格子社区造型。':'圆润柔和，换一种可爱的风格。'}</p></button>`).join('')}</div>`;
}
function officePanel(office) {
  const own=office.ownerId===state.user?.id,can=own&&withinOffice(world.position,office);
  return panelShell(esc(office.name),`<div class="office-banner" style="--brand:${office.color}"><div>${esc(office.monogram)}</div><p>${esc(office.tagline)}</p></div><div class="office-facts"><span>${icon('pin')} ${esc(neighborhoods.find(z=>z.id===office.zoneId)?.name||'班级区域')}</span><span>${icon('user')} ${esc(office.owner)}</span><span>${office.ownerId?(office.online?'🟢 在线':'⚪ 离线'):'待分配工位'}</span></div><p class="dialog-intro">${own?'这是你的个人空间。到达工位后，可布置家具、修改名称与配色。':'欢迎来串门。只有工位主人可以修改这里的布置。'}</p><div class="office-actions"><button class="primary" data-visit="${office.id}">前往工位 ${icon('arrow')}</button>${can?btn('editor','布置我的工位','edit','secondary'):own?'<span class="subtle">抵达后开放编辑</span>':''}</div>`,{eyebrow:own?'我的工位':'社区工位',className:'office-dialog'});
}
function mapSVG() {
 const px=x=>380+x*5,py=z=>255+z*3.5;
 const buildings=(state.buildings||[]).filter(b=>b.enabled!==false);
 return `<svg viewBox="0 0 760 510" aria-label="社区网格分布地图"><defs><pattern id="community-map-grid" width="5" height="3.5" patternUnits="userSpaceOnUse"><path d="M5 0H0V3.5" fill="none" stroke="#92a789" stroke-width=".3"/></pattern></defs><rect width="760" height="510" fill="#c3d1b6"/><rect x="30" y="10" width="700" height="490" fill="url(#community-map-grid)"/>${buildings.filter(b=>b.kind!=='office').map(b=>{const r=footprint(b),area=PUBLIC_AREAS.find(a=>a.id===b.id);return `<g ${area?`data-area-visit="${b.id}" role="button" tabindex="0" aria-label="前往${esc(b.name)}"`:''}><rect x="${px(r.x)}" y="${py(r.z)}" width="${r.w*5}" height="${r.d*3.5}" fill="${b.kind==='class'?'#8fae87':b.kind==='custom'?'#d6bd83':'#eceddb'}" stroke="#6d8c75" opacity=".8"/><text x="${px(r.x+r.w/2)}" y="${py(r.z+r.d/2)}" text-anchor="middle" font-size="9" fill="#405a48">${esc(b.name)}</text></g>`;}).join('')}${offices.map(o=>`<g data-visit="${o.id}" tabindex="0" role="button" aria-label="前往${esc(o.name)}"><rect class="map-office" x="${px(o.x-2.5)}" y="${py(o.z-2.5)}" width="25" height="17.5" fill="${o.ownerId?o.color:'#dbe3ce'}" stroke="#f8f7e8"/><circle cx="${px(o.x)+5}" cy="${py(o.z)-4}" r="2" fill="${o.online?'#4d9b59':'#9ba894'}"/></g>`).join('')}<circle id="map-player" cx="${px(world.position.x)}" cy="${py(world.position.z)}" r="5" fill="#fffdf2" stroke="#42674c" stroke-width="2"/></svg>`;
}
function mapResults(query='') {
  const q=query.trim().toLowerCase();if(!q)return `<div class="neighborhood-grid">${neighborhoods.map((n,i)=>`<button data-neighborhood="${i}"><i style="background:${n.color}"></i>${n.name}${icon('arrow')}</button>`).join('')}</div>`;
  const found=offices.filter(o=>(o.name+' '+o.owner+' '+(neighborhoods.find(z=>z.id===o.zoneId)?.name||'')).toLowerCase().includes(q));
  return `<div class="office-search-results">${found.length?found.map(o=>`<button data-visit="${o.id}"><i style="background:${o.color}">${esc(o.monogram)}</i><span><b>${esc(o.name)}</b><small>${(neighborhoods.find(z=>z.id===o.zoneId)?.name||'')}</small></span>${icon('arrow')}</button>`).join(''):'<p class="empty-note">没有找到匹配的工位，试试其他名称或区域。</p>'}</div>`;
}
function renderLeaderboard() {
  const el=$('#leaderboard-content');if(!el)return;el.hidden=!state.leaderboard;
  el.innerHTML=`<div class="leaderboard-tabs">${['工位','活力','驾驶','钓鱼'].map(t=>`<button data-leadertab="${t}" class="${state.leaderboardTab===t?'active':''}">${t}</button>`).join('')}</div>${state.leaderboardTab==='工位'?`<p class="eyebrow">社区人气工位</p>${[...offices].sort((a,b)=>b.visits-a.visits).slice(0,5).map((o,i)=>`<button class="standing" data-office="${o.id}"><span>${i+1}</span><i style="background:${o.color}">${esc(o.monogram)}</i><b>${esc(o.name)}</b><small>${o.visits.toLocaleString()}</small></button>`).join('')}`:state.leaderboardTab==='活力'?`<div class="leaderboard-empty">${icon('star')}<b>${state.aura} 活力值</b><p>社区活力，从你开始。</p>${btn('aura','查看我的奖励','','small-button')}</div>`:state.leaderboardTab==='钓鱼'?`<div class="leaderboard-empty">${icon('fish')}<b>${state.catches.length?Math.max(...state.catches.map(c=>c.weight)).toFixed(1)+' 千克':'下一条大鱼正在等你'}</b><p>${state.catches.length+' 条鱼已收入记录。'}</p>${btn('fishing','去钓鱼','','small-button')}</div>`:`<div class="leaderboard-empty">${icon('car')}<b>沿着风景，慢慢走。</b><p>小车正停在林荫大道旁。</p>${btn('drive','找到小车','','small-button')}</div>`}`;
}
function renderChat() {
  const panel=$('#chat-panel');if(!panel)return;panel.hidden=!state.chat;
  if(!state.chat)return;
  panel.innerHTML=`<header><div><b>社区聊天</b><small><i class="live-dot"></i> ${state.online} 人在线 · 和伙伴打个招呼</small></div><button data-action="chat" aria-label="关闭聊天">${icon('close')}</button></header><div class="chat-messages" aria-live="polite">${chatMessages()}</div><form id="chat-form"><input name="text" maxlength="240" placeholder="和伙伴说点什么…" aria-label="聊天消息" autocomplete="off" required><button type="submit" aria-label="发送消息">${icon('send')}</button></form>`;
  const list=$('.chat-messages');list.scrollTop=list.scrollHeight;
}
function chatMessages() { return state.messages.map(m=>`<div class="chat-message ${m.system?'system':''}"><div><b>${esc(m.name)}</b><time>${new Date(m.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</time></div><p>${esc(m.text)}</p></div>`).join(''); }
function renderRadio() {
  const el=$('#radio-content');if(!el)return;el.hidden=!state.music;
  $('.radio-toggle').setAttribute('aria-expanded',state.music);
  el.innerHTML=`<div class="radio-record ${state.musicPlaying?'playing':''}"><i></i></div><div class="radio-track"><b>午后微光</b><small>格子社区 · 氛围电台</small></div><div class="radio-controls"><button data-action="play-music" aria-label="${state.musicPlaying?'暂停':'播放'}音乐">${icon(state.musicPlaying?'pause':'play')}</button><span>${state.musicPlaying?'让音乐陪你一会儿':'给生活一点轻柔的旋律'}</span></div><label class="volume-label">${icon('sound')}<input id="volume" type="range" min="0" max="1" step=".05" value="${audioVolume}" aria-label="音乐音量"></label>`;
}
let audioContext, audioGain, audioTimer, audioVolume=.3;
function toggleMusic() {
  state.musicPlaying=!state.musicPlaying;
  if(state.musicPlaying) {
    audioContext ||= new (window.AudioContext||window.webkitAudioContext)();audioContext.resume();audioGain ||= audioContext.createGain();audioGain.gain.value=audioVolume*.14;audioGain.connect(audioContext.destination);
    let i=0;const notes=[261.63,329.63,392,523.25,440,349.23,293.66,392];
    const play=()=>{const now=audioContext.currentTime;for(const [j,f] of [notes[i%8]/2,notes[(i+2)%8]/2,notes[i%8]].entries()){const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.value=f;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(j===2?.1:.25,now+.5);gain.gain.exponentialRampToValueAtTime(.001,now+3);osc.connect(gain);gain.connect(audioGain);osc.start(now);osc.stop(now+3.1);}i++;};play();audioTimer=setInterval(play,2400);
  } else {clearInterval(audioTimer);audioContext?.suspend();}
  renderRadio();
}

async function request(path,{method='GET',data,authenticated=true}={}) {
  const res=await fetch(path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(authenticated?{'X-Session-Token':state.token}:{})},...(data?{body:JSON.stringify(data)}:{})});
  const json=await res.json();if(!res.ok){const err=new Error(json.error||'暂时无法连接社区，请稍后重试。');err.status=res.status;throw err;}return json;
}
async function session() {
  const data=await request('/api/session',{method:'POST',authenticated:false,data:{token:state.token}});state.token=data.token;state.visitors=data.visitors;sessionStorage.setItem('cubicles.token',state.token);setUser(data.user);return data;
}
async function tick() {
  if(!state.token||tickBusy)return;tickBusy=true;
  try {
    const data=await request('/api/tick',{method:'POST',data:{x:world.position.x,z:world.position.z,rotation:world.rotation,dancing:world.dancing,...state.profile,reaction}});reaction='';
    state.online=data.online;state.visitors=data.visitors;state.lastPlayers=data.players;world.setPlayers(data.players);world.updatePresence(data.onlineUserIds);world.settings=data.settings;updateStats();if(data.revision!==state.revision)await refreshWorld(false);
    const changed=JSON.stringify(state.messages)!==JSON.stringify(data.messages);state.messages=data.messages;
    if(changed&&state.chat){const el=$('.chat-messages');if(el){el.innerHTML=chatMessages();el.scrollTop=el.scrollHeight;}}
  } catch(error) { if(error.status===401&&!reconnecting){reconnecting=true;try{await session();}finally{reconnecting=false;}} }
  finally {tickBusy=false;}
}
function visitOffice(id) {
  const o=offices.find(o=>o.id===Number(id));if(!o)return;
  closePanel();world.teleport(o.x,o.z+1.35);toast(`欢迎来到${o.name}。`);award(1);
}
function visitNeighborhood(index) {
  const n=neighborhoods[Number(index)];if(!n)return;closePanel();world.teleport(n.x,n.z);if(!world.canMove(n.x,n.z)) { const o=offices.find(o=>o.neighborhood===Number(index));if(o)world.teleport(o.x,o.z+1.35); }toast(`你已来到${n.name}。`);
}
function enter() {
  if(!state.ready)return;state.entered=true;store('cubicles.entered',true);closePanel();world.enter();if(!read('cubicles.firstAura',false)){award(5);store('cubicles.firstAura',true);}
}

document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action],[data-avatar],[data-color],[data-visit],[data-neighborhood],[data-reaction],[data-office],[data-customize],[data-controltab],[data-leadertab],[data-admin-tab],[data-zone],[data-new-zone],[data-import-sample],[data-placed],[data-select-placed],[data-add-item],[data-remove-item],[data-task],[data-area-visit],[data-world-action],[data-world-building],[data-world-rect],[data-add-world-model]');if(!el)return;
  if(await layoutEditor.click(el))return;
  if(await community.click(el))return;
  if(el.dataset.visit)return visitOffice(el.dataset.visit);
  if(el.dataset.neighborhood!==undefined)return visitNeighborhood(el.dataset.neighborhood);
  if(el.dataset.office)return openPanel('office',offices.find(o=>o.id===Number(el.dataset.office)));
  if(el.dataset.customize){$('#office-editor').hidden=false;$('#office-editor input').focus();return;}
  if(el.dataset.avatar){state.profile.avatar=el.dataset.avatar;store('cubicles.profile',state.profile);world.setOutfit(state.profile);if(state.user)request('/api/me',{method:'PATCH',data:state.profile}).catch(e=>toast(e.message));openPanel('character');tick();return;}
  if(el.dataset.color){state.profile.color=el.dataset.color;store('cubicles.profile',state.profile);world.setOutfit(state.profile);if(state.user)request('/api/me',{method:'PATCH',data:state.profile}).catch(e=>toast(e.message));openPanel('character');tick();return;}
  if(el.dataset.reaction){reaction=el.dataset.reaction;world.react(reaction);$('#reaction-popover').hidden=true;award(1);tick();return;}
  if(el.dataset.controltab){const editing=el.dataset.controltab==='editing';$('#control-content').innerHTML=controlsContent(editing);document.querySelectorAll('[data-controltab]').forEach(b=>{b.classList.toggle('active',b===el);b.setAttribute('aria-selected',b===el);});return;}
  if(el.dataset.leadertab){state.leaderboardTab=el.dataset.leadertab;renderLeaderboard();return;}
  const action=el.dataset.action;
  if(action==='enter')return enter();
  if(action==='close')return closePanel();
  if(['map','controls','character','profile','menu','about','people','aura'].includes(action))return openPanel(action);
  if(action==='camera')return world.toggleCamera();
  if(action==='zoom-in')return world.zoom(-1.2);if(action==='zoom-out')return world.zoom(1.2);
  if(action==='dance'){world.setDance();tick();return;}
  if(action==='chat'){state.chat=!state.chat;renderChat();if(state.chat)$('#chat-form input').focus();return;}
  if(action==='reactions'){const pop=$('#reaction-popover');pop.hidden=!pop.hidden;return;}
  if(action==='leaderboard')return navigateArea('hall');
  if(action==='dismiss-hint'){$('#quick-hint').hidden=true;return;}
  if(action==='music'){state.music=!state.music;renderRadio();return;}
  if(action==='play-music') {try{toggleMusic();}catch{toast('当前浏览器暂时无法播放音乐。');}return;}
  if(action==='plaza'){closePanel();world.teleport(0,24);toast('欢迎来到中心广场，休息一下吧。');return;}
  if(action==='marina'){closePanel();world.teleport(43,24);toast('欢迎来到朝阳码头。');return;}
  if(action==='drive'){closePanel();world.teleport(world.car.position.x+1.5,world.car.position.z);toast('按 E 上车，使用 WASD 驾驶。');return;}
  if(action==='reset-camera'){world.yaw=0;world.elevation=.4;world.zoomLevel=5;world.resize();if(world.cameraMode==='first')world.toggleCamera();closePanel();return;}
  if(action==='fishing')return navigateArea('pond');
  if(action==='cast')return castLine(el);
  if(action==='reel')return reelLine();
  if(action==='touch'){touchVisible=!touchVisible;$('#touch-controls').hidden=!touchVisible;closePanel();return;}
  if(action==='jump')return world.jump();
  if(action==='exit-car'){world.driving=false;world.position.x+=1.5;world.emit('vehicle',false);return;}
  if(action==='run'){world.keys.has('shift')?world.keys.delete('shift'):world.keys.add('shift');el.classList.toggle('active');}
});
document.addEventListener('input',e=>{
  if(e.target.id==='map-search')$('#map-results').innerHTML=mapResults(e.target.value);
  if(e.target.id==='daylight')world.renderer.toneMappingExposure=Number(e.target.value);
  if(e.target.id==='volume'){audioVolume=Number(e.target.value);if(audioGain)audioGain.gain.value=audioVolume*.14;}
});
document.addEventListener('submit',async e=>{
  e.preventDefault();if(['model-upload-form','building-transform-form'].includes(e.target.id)){await layoutEditor.submit(e.target);return;}const communityForm=['login-form','zone-form','import-form','time-form','furniture-form','sticker-form'].includes(e.target.id)||e.target.classList.contains('user-assignment');if(communityForm){if(state.saving)return;state.saving=true;lockPanelButtons();try{await community.submit(e.target);}finally{state.saving=false;$('#panels').querySelectorAll('[data-busy-disabled]').forEach(b=>{b.disabled=false;delete b.dataset.busyDisabled;});}return;}const data=new FormData(e.target);
  if(e.target.id==='profile-form'){state.profile.name=String(data.get('name')).trim().slice(0,24);store('cubicles.profile',state.profile);if(state.user){try{setUser((await request('/api/me',{method:'PATCH',data:state.profile})).user);}catch(err){toast(err.message);return;}}closePanel();updateStats();tick();toast(`很高兴认识你，${state.profile.name}。`);}
  if(e.target.id==='chat-form') {
    const input=e.target.querySelector('input'),button=e.target.querySelector('button');button.disabled=true;
    try {const msg=await request('/api/messages',{method:'POST',data:{text:String(data.get('text'))}});state.messages.push(msg);input.value='';const list=$('.chat-messages');list.innerHTML=chatMessages();list.scrollTop=list.scrollHeight;}
    catch(error){toast(error.message);}finally{button.disabled=false;input.focus();}
  }
  if(e.target.id==='office-editor') {
    const button=e.target.querySelector('button[type=submit]');button.disabled=true;
    try{const office=await request(`/api/offices/${e.target.dataset.office}`,{method:'PATCH',data:Object.fromEntries(data)});world.updateOffice(office);openPanel('office',office);toast('工位已保存，布置得真不错。');}
    catch(error){toast(error.message);button.disabled=false;}
  }
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape') {if(state.panel==='welcome'){enter();}else if(state.panel)closePanel();else if(state.chat){state.chat=false;renderChat();}$('#reaction-popover').hidden=true;}
  if(e.key==='Tab'&&state.panel){const els=[...$('#panels').querySelectorAll('button:not([disabled]),input,[tabindex="0"]')].filter(el=>el.getClientRects().length);if(!els.length)return;if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===els.at(-1)){e.preventDefault();els[0].focus();}}
  if(e.target.matches('input,textarea,select')||!state.entered)return;
  if(e.key.toLowerCase()==='b'&&!state.panel){e.preventDefault();community.show(community.canEdit()?'editor':'backpack');}
  if(e.key.toLowerCase()==='m'&&!state.panel){e.preventDefault();openPanel('map');}
  if(e.key==='Enter'&&!state.panel&&!state.chat){e.preventDefault();state.chat=true;renderChat();$('#chat-form input').focus();}
  if(e.key==='Enter'&&e.target.matches('[data-visit],[data-neighborhood]'))e.target.click();
});

let fishStart=0,fishPosition=0;
async function castLine(button) {
  if(!state.user){openPanel('login');return;}try{await request('/api/fishing/cast',{method:'POST'});}catch(e){toast(e.message);return;}
  fishStart=performance.now();button.dataset.action='reel';button.innerHTML=`收线 ${icon('fish')}`;$('#fishing-status h3').textContent='等待指针进入绿色区域…';
  const loop=()=>{if(state.panel!=='fishing')return;fishPosition=(Math.sin((performance.now()-fishStart)/450-Math.PI/2)+1)/2;const marker=$('#fishing-cursor');if(marker)marker.style.left=`${fishPosition*96}%`;fishingFrame=requestAnimationFrame(loop);};loop();
}
async function reelLine() {
 cancelAnimationFrame(fishingFrame);let data;
 try{data=await request('/api/fishing/reel',{method:'POST'});setUser(data.user);}catch(e){toast(e.message);return;}
 const {caught,fish}=data;if(caught){state.catches=data.user.catches||[];$('#fishing-best').textContent=`最佳收获：${Math.max(...state.catches.map(c=>c.weight)).toFixed(1)} 千克`;}
 $('#fishing-status').innerHTML=`<div class="catch-result">${caught?'🐟':'💧'}<h3>${caught?`${fish.weight} 千克 ${fish.name}！`:'这条小鱼很机灵。'}</h3><p>${caught?'收获不错！获得 10 点活力值。':'小鱼溜走了，再试一次吧。'}</p><button class="primary" data-action="cast">再抛一竿 ${icon('fish')}</button><div class="fishing-meter"><i class="sweet-spot"></i><b id="fishing-cursor"></b></div></div>`;
}
function startJoystick(e) {
  const el=e.currentTarget;el.setPointerCapture(e.pointerId);const rect=el.getBoundingClientRect();
  const move=event=>{const dx=Math.max(-36,Math.min(36,event.clientX-rect.left-rect.width/2)),dy=Math.max(-36,Math.min(36,event.clientY-rect.top-rect.height/2));el.querySelector('span').style.transform=`translate(${dx}px,${dy}px)`;world.touch={x:dx/36,z:dy/36};};
  const stop=()=>{world.touch={x:0,z:0};el.querySelector('span').style.transform='';el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',stop);el.removeEventListener('pointercancel',stop);};el.addEventListener('pointermove',move);el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);move(e);
}

let lastMapTime=0;
function drawMiniMap(position,yaw) {
  const canvas=$('#minimap');if(!canvas)return;const c=canvas.getContext('2d'),w=320;c.clearRect(0,0,w,w);c.fillStyle='#c5d1b9';c.fillRect(0,0,w,w);
  c.save();c.translate(w/2,w/2);c.rotate(yaw);const scale=7;
  c.translate(-position.x*scale,-position.z*scale);
  c.strokeStyle='#b5c3aa';c.lineWidth=.5;c.beginPath();for(let cell=-70;cell<=70;cell++){c.moveTo(cell*scale,-70*scale);c.lineTo(cell*scale,70*scale);c.moveTo(-70*scale,cell*scale);c.lineTo(70*scale,cell*scale);}c.stroke();for(const b of (state.buildings||[]).filter(b=>b.enabled!==false&&b.kind!=='office')){const r=footprint(b);c.fillStyle=b.kind==='class'?'#afc0a4':b.kind==='custom'?'#d6bd83':'#9abbb0';c.fillRect(r.x*scale,r.z*scale,r.w*scale,r.d*scale);c.strokeStyle='#718e73';c.strokeRect(r.x*scale,r.z*scale,r.w*scale,r.d*scale);}
  for(const o of offices){c.fillStyle='#a3b99b';c.fillRect((o.x-1.9)*scale,(o.z-1.9)*scale,3.8*scale,3.8*scale);c.strokeStyle='#dfe8d5';c.lineWidth=1.3;c.strokeRect((o.x-1.9)*scale,(o.z-1.9)*scale,3.8*scale,3.8*scale);}
  c.fillStyle='#aa91c4';for(const p of state.lastPlayers||[]){c.beginPath();c.arc(p.x*scale,p.z*scale,4,0,Math.PI*2);c.fill();}c.restore();
  c.beginPath();c.moveTo(160,144);c.lineTo(152,165);c.lineTo(160,161);c.lineTo(168,165);c.closePath();c.fillStyle='#fbfcf2';c.strokeStyle='#42614d';c.lineWidth=2.5;c.fill();c.stroke();
}
function drawMapPosition() { const dot=$('#map-player');if(dot){dot.setAttribute('cx',380+world.position.x*5);dot.setAttribute('cy',255+world.position.z*3.5);} }
world.onFrame=(position,yaw)=>{if(performance.now()-lastMapTime>100){drawMiniMap(position,yaw);drawMapPosition();updateNearbyPrompt();document.body.classList.toggle('night',world.night>.5);const clock=$('#community-clock');if(clock)clock.textContent=`${world.night>.5?'🌙':'☀️'} ${String(world.hour??0).padStart(2,'0')}:00 · ${world.night>.5?'夜间':'日间'} · 网格 ${Math.floor(position.x)},${Math.floor(position.z)}`;lastMapTime=performance.now();}};
world.addEventListener('loading',e=>{const bar=$('#load-progress');if(bar)bar.style.width=`${e.detail*100}%`;});
world.addEventListener('ready',()=>{state.ready=true;if(state.panel==='welcome'){$('#panels').innerHTML=renderPanel('welcome');$('.enter-button').focus();}else if(read('cubicles.entered',false)){state.entered=true;world.enter();}});
world.addEventListener('office',e=>openPanel('office',e.detail));
world.addEventListener('asset-error',e=>toast(`${e.detail.name}加载失败：${e.detail.message}`));
world.addEventListener('area',e=>community.show(e.detail.id));
world.addEventListener('area-nearby',updateNearbyPrompt);
function updateNearbyPrompt() {const office=world.nearOffice,area=world.nearArea,el=$('#nearby-prompt');el.hidden=!world.driving&&!office&&!area;if(world.driving)el.innerHTML='<kbd>E</kbd> <button data-action="exit-car">下车</button>';else if(area)el.innerHTML=`<kbd>E</kbd> <button data-action="area-interact">${area.hint}</button>`;else if(office)el.innerHTML=`<kbd>E</kbd> <button data-office="${office.id}">${esc(office.name)}</button>`;const context=$('.context-inventory');if(context){context.dataset.action=community?.canEdit()?'editor':'backpack';context.querySelector('span').textContent=community?.canEdit()?'布置':'背包';}}
world.addEventListener('nearby',updateNearbyPrompt);
world.addEventListener('camera',e=>{const first=e.detail==='first';$('.camera-button span').textContent=first?'第三人称':'第一人称';$('.camera-button').setAttribute('aria-label',first?'切换第三人称':'切换第一人称');});
world.addEventListener('dance',e=>{$('[data-action=dance]').classList.toggle('active',e.detail);$('[data-action=dance]').setAttribute('aria-pressed',e.detail);});
world.addEventListener('vehicle',e=>{toast(e.detail?'出发兜风吧，按 E 下车。':'已下车，继续逛逛吧。');updateNearbyPrompt();});

function setUser(user){state.user=user;world.currentUserId=user?.id;if(user){state.profile={name:user.name,avatar:user.avatar,color:user.color};state.aura=user.score;state.catches=user.catches||[];}else{state.profile={name:'',avatar:'classic',color:outfits[0]};state.aura=0;state.catches=[];}world.setOutfit(state.profile);if($('#ui').children.length)hud();}
async function refreshWorld(force=false,data){data ||=await request('/api/world',{authenticated:false});const geometry=JSON.stringify([data.zones,data.buildings]);const oldGeometry=JSON.stringify([state.zones,state.buildings]);const areasChanged=JSON.stringify(PUBLIC_AREAS)!==JSON.stringify(data.areas);PUBLIC_AREAS.splice(0,PUBLIC_AREAS.length,...data.areas);state.buildings=data.buildings;state.modelAssets=data.modelAssets;state.layoutRevision=data.layoutRevision;const prior=new Map(offices.map(o=>[o.id,JSON.stringify(o)]));offices.splice(0,offices.length,...data.offices);neighborhoods.splice(0,neighborhoods.length,...data.neighborhoods);state.zones=data.zones;state.settings=data.settings;state.revision=data.revision;state.visitors=data.visitors;world.setCommunity(data,{rebuild:force||geometry!==oldGeometry});if(world.ready&&!force&&geometry===oldGeometry){for(const o of offices)if(JSON.stringify(o)!==prior.get(o.id)&&!(state.panel==='editor'&&o.ownerId===state.user?.id))world.updateOffice(o);}
 if(state.user){const result=await request('/api/me');if(result.user){state.user=result.user;state.aura=result.user.score;}}if(areasChanged)hud();updateStats();}
async function navigateArea(id){const area=PUBLIC_AREAS.find(a=>a.id===id);if(!area)return toast('该公共区域已收起。');closePanel();world.teleport(area.entry.x,area.entry.z);await tick();toast(`已抵达${area.name}，按 E ${area.hint}。`);}
community=new CommunityUI({state,world,offices,request,esc,btn,shell:panelShell,open:openPanel,close:closePanel,toast,tick,session,refresh:refreshWorld,setUser});community.bind();layoutEditor=new WorldEditor({state,world,offices,request,esc,open:openPanel,close:closePanel,toast,refresh:refreshWorld});layoutEditor.bind();
hud();
if(!read('cubicles.entered',false))openPanel('welcome');else{state.entered=true;world.enter();}
try{const login=await session();await refreshWorld();if(login.user)world.teleport(login.position.x,login.position.z);else if(offices[0])world.teleport(offices[0].x,offices[0].z+2.5);}catch(error){toast('正在重新连接本地社区。');}
await world.init();await tick();setInterval(tick,1000);
window.__cubicles={world,state,openPanel,closePanel,community,inspect:()=>world.inspect()};
if(matchMedia('(pointer: coarse), (max-width: 700px)').matches){touchVisible=true;$('#touch-controls').hidden=false;$('#quick-hint').hidden=true;}

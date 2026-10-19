# Cubicles 前端静态调查

目标：https://www.cubicles.lol/ 。本报告只依据公开首页下载的 HTML/JS/CSS，不执行页面、不直接请求业务接口、不下载模型/音频。原始下载 URL、大小、SHA-256 见 `evidence/public-assets.json`。以下 `chunk` 均指 `public-bundle/_next/static/immutable/chunks/` 下文件；offset 为解码后零基 Python 字符偏移，JSON 摘录同时保存 byte offset。不要把静态分支当作运行时已触发。

## 已观察到的代码事实

| 领域 | 可核查结论 | 精确引用 |
|---|---|---|
| UI / 打包 | 初始 JS 是 TURBOPACK 注册块；存在 Next 编译内部路径和组件边界；React 导出版本字面值为 `19.3.0-canary-cbb046ab-20260731`。 | `0llsa4_5p1t45.js` offset 18801 附近 `/ROOT/node_modules/next/dist/compiled/process/`、22598/31068 附近 `version`；`evidence/static-secondary-contexts.json`。 |
| 3D 引擎 | Three.js 模块导出 `REVISION = "185"`。应用直接创建 `WebGLRenderer`，使用 SRGBColorSpace、ACESFilmicToneMapping、PCFSoftShadowMap 和 high-performance 设置。 | `1-h8xr0vu9wrm.js` offset 255452；`0pk2_0c34vbky.js` offset 305134；`evidence/static-code-contexts.json`。 |
| 主镜头 | 同一场景建立 `OrthographicCamera(-30,30,22,-22,.1,1400)` 和第一人称 `PerspectiveCamera(FIRST_PERSON_FOV,1,.055,240)`，默认当前镜头是正交相机；切换逻辑 `aR=e?aI:aP` 并隐藏本地角色。 | `0pk2_0c34vbky.js` offset 311340 附近、342900 附近；`evidence/static-focused-ranges.json` 的 start_char 310950/340000。 |
| 第一人称参数 | 眼高 1.57，FOV 72，鼠标灵敏度 .0022，pitch 限制 ±1.3；桌面进入时申请 pointer lock，失败提示重试。 | `2w0y2gqqj2oc7.js` offset 79410 附近；`0pk2_0c34vbky.js` offset 342000 附近；同上 ranges。 |
| 输入 | 代码显式映射 WASD 与箭头移动、Shift 跑、Space 跳、E 交互、F 镜头、M 地图、Enter 聊天；帮助文字包含双跳峰值时前空翻。 | `29pwl2pex9vu6.js` offset 1900–4300；`evidence/static-focused-ranges.json`。 |
| 移动/碰撞 | 移动参数 WALK_SPEED 5、RUN_SPEED 10、GRAVITY 18、JUMP_SPEED 7.6；`moveOnFloor` 把 dt 限在 .1，并将步长分为最多 .16 的子步，经传入碰撞函数检查。另有 `advanceWalk` 通过 `WalkGeometry.clear` 检查路线步进。 | `3dzu48d190e90.js` offset 100300–100900；`evidence/static-stack-search.json`；`0pk2_0c34vbky.js` offset 81770–82400，`evidence/static-secondary-contexts.json`。 |
| 路线规划 | `WorldWalkPlanner` 创建 module Worker，发送 rects/bounds/version 与 route start/goal；几何更新会拒绝旧路线；请求超时 12 秒。没有拿到 worker 文件本体，不能确认寻路算法类型。 | `0pk2_0c34vbky.js` offset 82200–83880；`evidence/static-secondary-contexts.json`。 |
| 场景资源 | 显式 fetch `/models/cubicles/v1/commons.glb` 与 `/models/cubicles/v1/cubicle.glb`，用 `GLTFLoader.parseAsync`；cubicle 上限 1,500,000 bytes，限定静态单材质组件，并列出 CubicleFloor、PartitionBack/Left/Right、DeskTop/Frame、Chair、Monitor。 | `1y0jl7cpc38wf.js` offset 4376、25030–26000；`evidence/static-secondary-contexts.json` 与 `evidence/static-code-contexts.json`。 |
| 模型库 | 内嵌 Higgsfield manifest 列 208 个资产、15 个 pack，单位 meters、Y-up、floor-center。来源字段指向 Higgsfield 3d-jutsu 项目及 GLB/Blend SHA；这证明打包代码所声明的来源，不能独立证明创作过程。 | `0xdo8najholab.js` offset 5848 附近 JSON.parse；解析副本 `evidence/static-higgsfield-manifest.json`。 |
| 资源加载 | 库 pack 通过 `/models/cubicles/{directory or higgsfield-r6}/{pack}.glb.gz.b64` 获取，base64 解码、`DecompressionStream("gzip")` 解压并用 SHA-256 比对 manifest，然后 GLTF 解析。 | `1y0jl7cpc38wf.js` offset 15100–16900；`evidence/static-stack-search.json` 与 `evidence/static-secondary-contexts.json`。 |
| 渲染预算 | 使用 InstancedMesh、按距离/zoom 筛选驻留资产与三角预算；库默认 maxInstances 320/maxTriangles 500,000，commons 使用 96/220,000。移动设备关闭抗锯齿/阴影、pixelRatio 1、maxInteriors 48、assetConcurrency 1；桌面 concurrency 2。AdaptiveRenderQuality 会根据帧时调整像素比。 | `1y0jl7cpc38wf.js` offset 5088、18000–19600；`0pk2_0c34vbky.js` offset 83800–85900；`evidence/static-secondary-contexts.json`、`evidence/static-focused-ranges.json`。 |
| 帧循环 | 主 world chunk 有 `requestAnimationFrame` 的调用和取消清理；Three.js renderer 及应用动画都由前端代码驱动。 | `0pk2_0c34vbky.js` offset 358579/358618 的递归 rAF、400164 的 `t.render(aa,aR)`、401901 的清理取消；`evidence/static-frame-loop.json`。 |
| 在线状态同步 | presence SWR 配置 refreshInterval 1,000ms、dedupingInterval 500ms；构造 `presence?x=…&z=…&viewX=…&viewZ=…`，连接角色且可同步时 POST 位置/avatar/seatControl，否则 GET；seatControl 含 clientId/version/command。 | `3_dlclu6ncxwx.js` offset 138019–139423；`evidence/static-network-contexts.json`。 |
| 聊天 | messages SWR 同样每秒拉取；发送是 POST `/api/messages`，body/recipient；附近聊天半径 24，通知最多显示 3 条。 | `3_dlclu6ncxwx.js` offset 140280、172745；`0pk2_0c34vbky.js` offset 408700 附近；`evidence/static-network-contexts.json`、`evidence/static-focused-ranges.json`。 |
| 批量网络 | `batchedFetch` 将 presence、messages、cars、skateboards、blimp、agents/nearby、hq、rewards 等白名单请求收集到 POST `/api/tick`，每批最多12条且请求 JSON ≤65,536 字符；默认 gather 25ms、hold 1,200ms、leader 3,000ms；404/405 禁用批量并回退原请求。 | `0pk2_0c34vbky.js` offset 405700–408650；`evidence/static-focused-ranges.json`。 |
| 远端角色平滑 | `RemotePlayerMotion` 接受更新位置/旋转，按接收间隔平滑估计时长并插值；座位变化、超大位移或更新间隔 >5秒直接贴到新位置；默认 interval 1秒。 | `0pk2_0c34vbky.js` offset 136650–138300；`evidence/static-remote-interpolation.json`。 |
| 地块/Agent刷新 | 某些地块详情每5秒 GET `/api/world?ids=…`；agents/nearby 默认5秒；详情按id分批。 | `3_dlclu6ncxwx.js` offset 124923、128435、136700–137900；`evidence/static-secondary-contexts.json`、`evidence/static-presence-ranges.json`。 |

## API 线索与功能范围

`evidence/static-literals.json` 保存全量 URL/接口/资源字面值及上下文。除上表之外，公开代码含 auth、visitor、profile、cubicles、design-drafts（upload/checkout）、billing/confirm、trials、rewards、fishing、chess、four-row、pickleball、boat-races、cars、skateboards、radio、rolodex、agents/chat、hq/chat 等调用线索。`nH` 包装器在 `3_dlclu6ncxwx.js` offset 110300 附近将相对名组成 `/api/` 路径，POST 携带 Layout/Geometry/Identity/Overview 等版本/能力头。命名包含 admin 的代码分支只是前端可见分支，不构成对任何权限绕过的判断。

由这些静态控制流推断：多人呈现主要采用 HTTP 定时同步 + 客户端位置插值，应用有家具编辑、共享地块、社交与小游戏子系统。这些是从前端实现推断的架构，不保证所有功能对游客启用。不能仅因 bundle 搜索到 websocket 字词就声称业务采用 WebSocket；已证实的应用路径是 fetch/tick/presence 轮询。

## REA 证据与覆盖限制

完整 CLI 结果：`evidence/static-rea-application.json`；Evidence ID：`ev_1f3ad36183bf3b120d24562e7c3e5cad80cc2628b4a285191c8bedc46365e169`。摘要：`evidence/static-rea-summary.json`。

只选择 `1y0jl7cpc38wf.js`、`0xdo8najholab.js`、`0pk2_0c34vbky.js` 3个业务块；REA 按当时完整目录清单统计36个相关文件、33个未选，读取598,990 bytes，访问182,061 AST节点，3个文件解析成功，0 parse failures。保留2,500语义节点、1,340关系、500 unknown；人为限制使 semantic coverage 为 partial/truncated，不能据此作不存在结论。REA 常规 application graph 的 modules 为0：此 Turbopack 形态未形成可用的跨模块导入恢复，故没有把 e.i(id) 关系当成完整依赖图。上述具体行为由保存的原始代码片段补证，未执行打包器或 JSON 外的页面代码。分析完成后主调查向 public-bundle 追加了3个运行时脚本，见 `evidence/runtime-additional-assets.json`；目录总 digest 因而可能变化，本 REA Evidence 绑定的是追加前快照，3个选定文件字节不变，无需把后来文件算作已覆盖。

尚未知：服务端框架/数据库/鉴权实现、具体部署平台、服务器权威规则、完整响应 schema、worker 寻路算法、全部懒加载资源、实际模型网格/贴图观感与运行时帧率。未下载任何GLB/音频，也没有读取后来另存的运行时追加脚本。所有日期状态限定为本次下载快照；运行结果应另看主调查的 runtime Evidence。

主调查补充的运行边界：自动化浏览器点击第一人称按钮显示 could not enter first person；因此本报告只证实镜头实现存在，不能声称第一人称在本次浏览器中已成功工作。

# WikiBook 钓鱼池塘接入

## 入口与配置

到达当前世界布局中的「荷风池塘」后按 E，或点击附近交互提示，打开 WikiBook 钓鱼工作台。不再从池塘进入社区旧版收线小游戏。菜单里的「去钓鱼」仍先带角色抵达池塘，再按 E。

本机按用户确认，配置了远端地址（忽略提交的 `.env`）：

```dotenv
WIKIBOOK_FISHING_URL=http://211.154.20.65:20017/fishing
```

修改后重启社区服务。此配置和 `WIKIBOOK_OJ_URL` 独立，不会把机房 OJ 一并切换。默认示例仍为 `http://127.0.0.1:5009/fishing`；其他部署者需按实际浏览器可访问地址配置。空值显示未配置提示，HTTPS 社区不能内嵌 HTTP 页面，保留独立标签页入口。

后端 `GET /api/pond` 校验会话和当前布局中的池塘位置，返回钓鱼地址，不读取学生钓鱼数据，也不代理 Cookie／密码。禁用或移动池塘后，旧地点不再有效。独立访问 WikiBook 本身不受社区位置限制。

## WikiBook 模块盘点

本机 WikiBook 源码的真实入口为 `/fishing`，同一模块还包含：

- `/fishing/shop`：钓具商店。
- `/fishing/collection`：鱼类图鉴。
- `/fishing/bait`：每日鱼饵。
- `/fishing/practice`：控竿练习。
- `/fishing/leaderboard`：钓鱼排行。

页面调用 `/api/v1/fishing` 获取状态与提交操作，由 WikiBook 控制鱼饵、鱼竿／装备、钓区、咬钩与收线、渔获、星星等数据；操作自带 requestId 和重试机制。社区仅提供整个模块的入口，不复制这些接口和结算逻辑。真实远端服务的版本、登录后钓鱼流程与数据仍需使用者登录验证，本轮没有代替学生抛竿、消耗鱼饵、购买或领取奖励。

## 返回与数据边界

- 复用 OJ 工作台的全屏／窗口铺满与返回操作，F8／F7 仅在父工作台有焦点时生效。
- 返回保持角色位置、视角与 WikiBook iframe；再次进入可继续页面。OJ 和钓鱼分别缓存，不互相替换。
- **返回 3D 世界不会暂停 WikiBook 服务器的咬钩／收线计时**，也不自动放弃或重试钓鱼。
- 鱼饵、渔获、星星、排行榜仍由 WikiBook 账号记录，暂不自动加社区活力或发 3D 奖励。
- 原社区历史分数和渔获未删除，旧 cast/reel API 保留兼容，但新池塘入口不调用它们。排行榜与活力说明已取消“远端钓鱼 +10 活力”的错误暗示。

## 远端登录限制

已只读确认远端 `/fishing` 页面入口返回 HTTP 200，不能据此声称登录、判题或钓鱼服务可用。当前本地社区与远端 HTTP IP 是跨站嵌入，Cookie 策略可能导致反复要求登录；工作台会明确提示并提供无 opener 的「独立标签页打开」。需要时在独立页面使用自己的 WikiBook 账号，返回社区可直接切回原标签页。不要关闭浏览器安全保护来强行传递登录。

iframe 添加 `embed=community-fishing` 对接标记，独立入口不带标记。按用户授权，已把 WikiBook 的嵌入布局更新部署到远端：隐藏全局主导航、Logo、账号／通知以及钓鱼页面大标题，只把六个钓鱼栏目和刷新操作放在顶部 subnavbar。登录跳转、栏目切换和刷新保留标记；独立页面即使手动携带标记也保持原导航。已有 OJ 精简模式不受影响，未修改 CSP／X-Frame-Options 或登录权限。长期部署建议由管理员统一规划 HTTPS 同站点入口与明确的嵌入允许策略。

已打开的旧 iframe 不会被强制刷新，以免影响输入或当前钓鱼回合。需要时在工作台上方点击「重新加载」获取新版；服务器的钓鱼计时仍不会暂停。

## 远端发布与回滚

远端项目路径 `/root/projects/wikibook`，发布前工作区干净，HEAD 为 `dd6c118d`，与本机基础版本及被改动文件的 SHA-256 一致。只更新以下前端源文件与对应构建资源，不提交 Git：

- `frontend/src/layouts/AppShell.vue`
- `frontend/src/router/index.js`
- `frontend/src/views/FishingView.vue`
- `frontend/src/utils/ojEmbed.js`
- `frontend/tests/oj-embed.test.js`

发布前备份位于 `/root/wikibook-backups/community-fishing-embed-20261020-codex-1`，含原始源码／完整 dist 归档、原 index、版本／哈希记录、专项测试及构建日志。先在该目录的 `release` 内构建，保留旧 dist 哈希资源，复制新资源后原子替换 `frontend/dist/index.html`；原前端预览进程未重启，数据库、后端和判题服务未改动。

需要快速回退网页时，可把备份的 `index-before.html` 复制为 `frontend/dist/index.html.rollback`，再在同一目录 `mv` 为 `index.html`。旧资源仍保留，可立即恢复旧入口。完整源码／静态资源可从 `frontend-before.tgz` 恢复；新增 helper 与测试不属于原始归档，恢复源码时应单独核对，不覆盖后续人工修改。

## 验证方式

`node --test --test-concurrency=2 tests/*.test.mjs`、`npm run check`、`npm run build`、`E2E_PRODUCTION=1 npm run test:e2e`。浏览器测试拦截钓鱼页为隔离模拟页面，验证到达限制、URL、全屏、返回、页面缓存、手机布局、独立窗口，以及没有调用旧本地钓鱼奖励 API；不依赖真实学生数据。

本轮社区 92 项单元／集成、29 条生产浏览器流程通过。WikiBook 本机和远端的嵌入／登录／钓鱼专项各 16 项通过，两端前端构建通过。

针对已发布的真实远端 JS／CSS，额外在独立浏览器上下文拦截所有业务 API：验证六栏目子导航、无全局顶栏／大标题、切页与刷新保持标记、移动端 44px 单行滚动导航、登录嵌入、OJ 嵌入及独立访问不变。9 次 API 请求全部隔离，未请求真实业务数据；报告见社区 `.tmp/acceptance/fishing-remote-layout-report.json`。实际未登录浏览器确认远端登录页也不再显示全局主导航。此验收不等于已验证真实账号的钓鱼结算。

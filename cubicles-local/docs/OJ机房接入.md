# WikiBook OJ 机房

## 使用

1. 走到「云端机房」，或点击右侧机房导航抵达，然后按 **E**。
2. 在机房工作台中使用 WikiBook OJ；账号和登录仍由 WikiBook 管理，3D 社区不会代传密码或自动登录。
   机房 iframe 自动附加 `embed=community-oj`：WikiBook 隐藏主 navbar、Logo、账号／通知等全局顶栏，只保留 OJ subnavbar 与题目内容；社区的沉浸／返回工具栏仍保留。独立标签页不带标记，正常显示完整 WikiBook。
3. 点击「沉浸全屏」进入系统全屏；浏览器不支持或拒绝时，自动改为窗口内铺满。工具栏始终提供「返回 3D 世界」。
4. 工具栏有焦点时，**F8** 切换沉浸、**F7** 返回世界。跨域 iframe 内的代码编辑器不会把按键传给社区，请使用上方按钮；不会拦截编辑器快捷键。系统全屏时 Esc 可退出全屏；非全屏且工具栏聚焦时 Esc 返回世界。
5. 返回世界不重建场景、不改变角色位置或相机，也不销毁 OJ iframe。再次按 E 可继续当前页面；刷新社区或改变 OJ 地址会重新加载。返回只隐藏 OJ，不等于关闭 OJ 会话，独立标签页的编辑状态不和嵌入页同步。
6. 原有社区任务卡仍在工作台中提供；完成卡片不是完成 OJ 判题，不会把题目成绩自动换成活力或奖励。

## 配置

在 `cubicles-local/.env` 设置后重启社区：

```dotenv
WIKIBOOK_OJ_URL=http://127.0.0.1:5009/oj/problems
```

本机已确认 WikiBook `/oj/problems` 是题库入口，目前 5009 后端会跳转到 5180 前端。以上默认值适用于本机开发，不会自动启动 WikiBook。部署到学生设备时必须换成**学生浏览器可访问**的真实域名；127.0.0.1 指向学生自己的电脑。HTTPS 社区需配置 HTTPS OJ。空值表示暂未配置；非法协议或 URL 内含账号密码会拒绝启动。不要在 URL 放 token。

`GET /api/lab` 仍校验用户已到达当前布局中的机房，再返回任务卡和 OJ 地址。没有增加数据库表、迁移学生、读取提交或改写 WikiBook 数据；这是旧 OJ 的入口集成，不是 OJ 独立迁移。

嵌入布局需要一并部署 WikiBook 前端的 `src/utils/ojEmbed.js`、`src/router/index.js` 和 `src/layouts/AppShell.vue` 更新。本机源码位于 `/Users/laozhenyu/Project/wikibook/frontend`，已构建并由运行中的 5180 开发服务加载。标记只在 iframe 且路径为 `/oj`、`/oj/*` 或 `/login` 时生效；登录跳转和 OJ 内部 SPA 导航自动保留标记，刷新后仍有效。普通顶层访问即便手动带此参数也不隐藏顶栏。未升级的远端 WikiBook 会继续显示原有导航，社区不会通过跨域注入 CSS 或裁切页面来绕过限制。

OJ iframe 禁止顶层导航，允许必要脚本、表单、同源登录和下载；独立标签页使用 noopener/noreferrer。社区不代理 OJ 请求，不移除对方 CSP / X-Frame-Options，不传社区 token。

浏览器对跨站 Cookie、iframe 登录和目标网站嵌入策略的限制仍有效。可在目标 WikiBook 自己的部署中明确允许社区域名嵌入并使用适当 Cookie 策略，或直接使用「独立标签页打开」。跨域页面的 load 事件不代表题库成功显示，工作台不会据此声称判题服务在线；保留加载慢、连接失败和独立标签页提示。返回世界不会清除 WikiBook 自己的登录。

## 验证

社区 91 项单元／集成与 26 条生产浏览器流程通过，静态检查与构建通过。实际机房验证了精简 OJ 子导航和返回 3D 世界；升级前后 28 个工位、107 条布局、2 个模型的持久化公开字段一致（在线状态除外）。

`npm test`、`npm run check`、`npm run build`，以及 `E2E_PRODUCTION=1 npm run test:e2e -- tests/e2e/oj.spec.mjs`。端到端测试使用隔离的模拟 OJ 服务，不读取或提交真实学生数据。

WikiBook 前端另外执行 `node --test tests/oj-embed.test.js tests/auth-navigation.test.js` 和 `npm run build`；嵌入标记不修改任何登录或权限校验。

本轮 WikiBook 专项 8 项通过、前端构建通过。运行其全部前端单测时，230 项中 228 项通过，`oj-problem-catalog-layout.test.js` 原有的表头／行字段顺序 2 项失败；它们只读取未改动的 `OjView.vue` 与题库 CSS，和本轮嵌入改动无关，本轮未顺带修改。日志位于社区 `.tmp/acceptance/oj-wikibook-full-unit.log`。

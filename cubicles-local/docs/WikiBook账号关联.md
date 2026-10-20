# WikiBook 账号关联与免登录

## 使用

登录 3D 社区，在“我的账号”点击“关联 WikiBook 账号”。页面跳到 WikiBook，首次需要登录，并明确确认两边显示的账号都属于自己。完成后回到社区。每个账号最多关联一个对方账号，不按同名账号自动匹配，不复制密码或合并角色、学习数据。

社区默认强制登录（`REQUIRE_LOGIN=true`）。未登录不会初始化 3D 场景或读取世界数据，关闭弹窗、旧的“已进入”缓存或历史访客 token 都不能绕过。世界、心跳、聊天、课堂、模型下载等接口同时校验成员身份；退出和会话过期会重新锁定页面。登录页静态资源与健康检查仍可匿名访问。测试套件的旧访客场景仅在隔离的测试服务中显式关闭门禁。

关联后，在机房和池塘按 E 会用关联账号进入 OJ／钓鱼，仍只显示子导航；“独立标签页打开”同样免登录，但显示完整 WikiBook。会替换该浏览器当前的 WikiBook 登录身份。返回 3D、沉浸模式与工作台保留逻辑不变。

“我的账号”可解除关联，立即阻止后续免登录以及未使用的跳转凭证。解除关联不会退出已经登录的 WikiBook 会话；共享电脑还需要在 WikiBook 主动退出。WikiBook 修改密码／会话版本会使尚未使用的旧登录凭证失效，不会删掉关联关系。

## 安全与协议

- 两端必须单独登录后才能关联，WikiBook 有明确确认页面和会话 CSRF 校验；社区写接口保留来源检查。
- 关联请求使用独立服务密钥 HMAC 签名，有效期 5 分钟。社区以原浏览器会话与账号绑定 state，服务端兑换时还验证 SHA-256 PKCE，不接受浏览器指定目标账号。
- 账号关系、一次性授权码保存在 WikiBook 数据库的 `community_account_link`、`community_auth_code`，关联双方唯一约束；与已有 Interview 关联模块完全隔离。
- 授权码 60 秒有效，数据库仅保存摘要，事务原子兑换。自动登录先在目标浏览器建立 state，再回社区校验当前登录身份并签发凭证，避免拿到链接即可让其他浏览器切换账号。
- 跳转只允许 OJ 和钓鱼两个目标，禁止任意 next URL。凭证通过免缓存、无 Referrer 页面传递，不放入前端存储。
- 社区内存只保存短时待处理请求，重启或退出登录后必须重新发起；持久关联不会丢失。

## 配置和部署

3D 服务私有环境：

```dotenv
PUBLIC_ORIGIN=http://211.154.20.65:20019
REQUIRE_LOGIN=true
WIKIBOOK_OJ_URL=http://211.154.20.65:20017/oj/problems
WIKIBOOK_FISHING_URL=http://211.154.20.65:20017/fishing
WIKIBOOK_INTERNAL_URL=http://127.0.0.1:5009
WIKIBOOK_SSO_SECRET=<服务端生成的独立随机密钥，至少32字符>
```

WikiBook 私有环境：`COMMUNITY_SSO_ORIGIN` 与上面的 `PUBLIC_ORIGIN` 相同，`COMMUNITY_SSO_SECRET` 与 `WIKIBOOK_SSO_SECRET` 相同。不复用 Flask SECRET_KEY、Interview 关联密钥或账号密码，不把密钥写入 Git、构建文件或浏览器。

本仓库 `deploy/wikibook-community-sso.patch` 保存配套 WikiBook 修改；在对应版本的 WikiBook 工作区先执行 `git apply --check` 再应用，避免覆盖其他改动。修改包括独立集成模块、确认模板、定向建表脚本、登录返回处理和测试。

备份两端代码、私有配置和数据库后，在 WikiBook 根目录运行：

```sh
PYTHONPATH=. venv/bin/python scripts/init_community_sso.py
venv/bin/python -m pytest tests/test_community_sso.py tests/test_account_link.py -q
cd frontend && npm run build
```

建表脚本只创建两张新表，不运行全库重置或修改原有账号。重载 WikiBook 后端以加载模块和配置；如果 Gunicorn 使用 preload，需要启动新 master，而不是仅回收 worker。构建并重启 3D 服务。

公网 WikiBook Nginx 必须拒绝 `/internal/community-sso`，仅允许社区后端通过本机回环地址访问。对 `/community-sso/` 和社区两个 GET 回调禁用含查询串的访问日志；Gunicorn 访问日志也使用不含查询参数的路径格式。WikiBook 嵌入只放行配置的社区 origin，不放宽全站框架限制。

当前公网 HTTP 仍不提供传输加密：一次性凭证不是 HTTPS 的替代品。正式使用应为两站配置 HTTPS；不同站点第三方 Cookie 被禁时，应使用独立标签页，而不是降低浏览器安全设置。

回滚时恢复代码／配置，关闭社区 SSO 配置并重启。新表可保留，勿删除原账号或全库恢复覆盖上线后的学习数据。常规 WikiBook 数据库备份必须包含上述两张表。

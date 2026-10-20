# GitHub 与独立服务端部署

源码仓库：`git@github.com:OXygenMoon/3d-wikibook.git`，沿用本机 `master` 分支。源码和运行数据分离：`.env`、数据库、导入模型、完整备份、日志、浏览器会话与验收截图不上传 GitHub。WikiBook 自身源码属于另外一个仓库，不混入此仓库。

## 本轮部署选择

- 用户选择带上本机当前世界、模型和账号；完整备份只经 SSH 传输与恢复，恢复后验证表与模型校验和。
- 用户选择自行设置强密码后再开放访问，因此服务仅监听 `127.0.0.1:4173`，不增加公网 Nginx 入口。
- 服务端没有 Compose 插件，本轮使用独立 systemd 单进程 + PGlite，不安装插件、不复用 WikiBook 的数据库，不重启现有 WikiBook 服务。
- PGlite 只适合当前单写进程部署，不是高可用／横向扩容方案。后续规模扩大再独立迁至 PostgreSQL。

## 服务与目录

| 项目 | 路径 |
| --- | --- |
| Git 工作区 | `/srv/3d-wikibook` |
| 应用目录 | `/srv/3d-wikibook/cubicles-local` |
| 服务 | `3d-wikibook.service` |
| 专用系统用户 | `wikibook3d` |
| 私有配置 | `/etc/3d-wikibook.env`，root 600 |
| 数据／模型 | `/var/lib/3d-wikibook` |
| 完整备份 | `/var/backups/3d-wikibook` |
| 密码交互命令 | `/usr/local/sbin/3d-wikibook-password` |

配置中 OJ 和钓鱼分别指向 `http://211.154.20.65:20017/oj/problems` 与 `/fishing`。浏览器入口地址不是 `127.0.0.1`；后者只用于服务器自身监听。数据库与模型目录不在 Git 工作区内，更新代码不替换数据。

## 自行设置管理员密码

在自己的终端连接服务器并执行：

```sh
ssh -t -p 20001 root@211.154.20.65 /usr/local/sbin/3d-wikibook-password
```

先完成 SSH 身份验证，再按提示输入两次**新的社区管理员密码**，终端不会显示字符。社区管理员账号保持 `lzy`，不是服务器 root 账号，也不是 WikiBook 账号。密码需要 16–256 字符并至少包含大小写／数字／符号中的三类，或使用至少 24 字符的多词短语。

包装命令仅暂停并重新启动这个 3D 服务；即使取消也恢复启动。密码命令不接受密码参数、环境变量或管道，修改前自动完整备份，密码哈希变更、原管理员登录会话撤销、审计记录在同一事务提交。不改本机密码，不改其他账号、家具或 WikiBook 数据。

设置完成后再启用公网入口。仓库中 `deploy/nginx-3d-wikibook.conf.pending` 为待启用模板，计划端口 20019，不能把现有 20018 入口覆盖掉。需要核对端口、访问控制、防火墙和密码状态后，再复制到 Nginx 的实际 include 目录并执行 `nginx -t` 和 reload。本轮不会自动启用该模板。

3D 与 WikiBook 将来若同为 `http://211.154.20.65` 的不同端口，虽然不同源，但属于同站点，可避免当前“本地 IP 嵌入远端 IP”的跨站 Cookie 问题；这不提供传输加密，正式使用仍应统一规划同站点 HTTPS。

## 运维

```sh
systemctl status 3d-wikibook
journalctl -u 3d-wikibook -n 100 --no-pager
curl http://127.0.0.1:4173/healthz
```

更新时先备份运行数据，再在维护窗口拉取代码、安装依赖、检查与构建，最后重启该服务：

```sh
cd /srv/3d-wikibook
git status --short
git pull --ff-only origin master
cd cubicles-local
npm ci
npm run check
npm run build
systemctl restart 3d-wikibook
```

不要使用 `git reset --hard` 覆盖服务端人工修改，不要开启 `CUBICLES_DB_RESET`，不要运行生产测试对真实数据库重置。PGlite 完整备份／恢复和密码变更都需要先停止该服务，不能与应用同时打开同一个数据目录。

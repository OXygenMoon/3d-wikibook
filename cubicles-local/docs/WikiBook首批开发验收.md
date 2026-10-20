# WikiBook 首批开发与验收

日期：2026-10-20。范围为 M0 运行时基线与 M1 的只读名单／空间预检，不是全量迁移完成。

## 1. 已实现：隔离源码审计

`scripts/wikibook-audit.py` 导入本机 WikiBook 的实际应用组合根，输出已注册 Flask 路由、SQLAlchemy 声明结构、贴纸条件目录及静态队列调用位置。

本次源提交 `dd6c118`，输出为 `docs/wikibook-runtime-inventory.json`：

| 项目 | 当前结果 |
| --- | ---: |
| 已注册 Flask 路由（含 static） | 730 |
| `/api/` 前缀路由 | 423 |
| 声明的 SQLAlchemy 表 | 170 |
| 实际注册的不同贴纸条件 | 243 |
| 静态 enqueue 调用位置 | 14 |

与之前静态声明清单按路径＋方法核对，差异为：静态的 `POST /internal/account-link` 未在当前 WikiBook 应用注册；运行时增加 Flask 自动注册的 `GET /static/<path:filename>`。因此不能仅凭总数同为 730 就判断逐接口完全一致。

审计子进程使用临时工作目录、内存 SQLite 配置、最小环境，禁用 `.env` 加载；实际数据库连接、网络、子进程启动和临时目录外写入均由 Python audit hook 拒绝。不执行 HTTP 请求、不调用 `create_all`、不导出学生记录、不启动 worker。保护测试验证原文件不能覆盖／删除，网络、SQLite 连接和子进程也确实被拒绝。

这些措施用于控制可信本地源码审计的意外副作用，不是执行恶意 Python 的系统级安全沙箱。应用结构与真实运行库可能存在迁移漂移：**170 张表是声明 metadata，并未连接实际 WikiBook 数据库检查结构**。

复跑需使用安装了 WikiBook 依赖的 Python 环境，例如本机：

```sh
/Users/laozhenyu/Project/wikibook/.venv/bin/python scripts/wikibook-audit.py \
  --source /Users/laozhenyu/Project/wikibook \
  --output .tmp/acceptance/wikibook-audit-repeat.json
```

清单逐路由／表状态仍为 `pending`，条件目录也不代表规则已迁入新平台。后台调用位置不是完整的 worker 依赖清单。

## 2. 已实现：管理员名单预检

入口：管理员后台 → **WikiBook 迁移**。默认提供虚构示例，可编辑 JSON 后点击“运行预检（不写入）”。

接口：`POST /api/admin/wikibook/preflight`，仅管理员可用。访客／学生被拒绝，保留同源检查和请求体大小限制。预检不写账号、身份绑定、工位、背包、审计表或迁移任务；数据库修订号不变。当前没有 `/apply` 接口。

输入契约：

```json
{
  "format": "wikibook-roster",
  "version": 1,
  "namespace": "school-demo",
  "classes": [{"id": 101, "name": "示例源班级"}],
  "groups": [{"id": 201, "name": "示例学习小组"}],
  "students": [{
    "id": 1,
    "username": "wiki_student_demo",
    "name": "示例学生",
    "studentId": "DEMO001",
    "classId": 101,
    "groupIds": [201]
  }],
  "classMappings": [{"sourceClassId": 101, "targetZoneId": 1}],
  "bindings": []
}
```

`namespace` 是来源学校／实例的稳定标识，不是每次导入换一个的批次号。来源用户编号支持安全整数或规范正整数字符串，形成 `wikibook:<namespace>:<id>` 身份键。班级映射一对一，学习小组另行保留。

若需要关联已有学生，管理员可显式提供 `bindings: [{"sourceUserId": 1, "targetUserId": "目标学生ID"}]`。这是本次预检的人工绑定提案，不是已经持久化或验证过的跨平台身份凭证。没有按姓名、学号或账号自动合并，也不能绑定管理员／教师。

报告包括拟新增、保留、转班、工位分配与异常清单。重复账号／来源编号／学号、未分班、未知分组、错误映射、绑定冲突和工位不足都阻止 `canPlan`。转班可规划跨班工位互换，但不会实际搬迁或改动家具。分配按稳定来源 ID 排序，重复预检不创建新账号或第二个工位。

`dryRun: true`、`importImplemented: false`、`canPlan: true` 只表示当前名单与空间可规划，**不表示可正式导入**。报告另带目标修订号供识别时点；它不是提交令牌。现有账号格式不兼容的 WikiBook 用户会明确报错，不截断、不改名、不静默漏人。密码、邮箱和完整数据库记录等未支持字段被拒绝，不在错误中回显其值。

## 3. 验证

- 新增 8 项纯预检测试、1 项隔离 API 集成测试和 1 项审计副作用保护测试。
- API 测试比较预检前后的完整数据库快照、内存状态和修订号，验证真正未写入；覆盖越权、跨站、敏感字段、超大请求和不存在的正式导入接口。
- 新增浏览器流程：管理员运行虚构名单预检，再制造账号冲突，确认异常提示且账号、区域和布局版本不变。
- 超大请求测试暴露并修复现有 HTTP 完成日志在连接已释放时读取 `req.socket.remoteAddress` 的异常；现在在请求开始时捕获地址，413 不再触发后台未捕获错误。
- 全量回归与运行证据保存到 `.tmp/acceptance/wikibook-unit.log`、`.tmp/acceptance/wikibook-e2e.log`；浏览器截图为 `test-results/wikibook-preflight.png`。
- 本次全量回归为 65 项单元／集成、17 条生产构建浏览器流程，全部通过；语法、ESLint 和构建通过。隔离源码审计复跑与已保存清单逐字段完全一致。
- 本地真实服务在完整备份后重启，使用虚构名单完成只读预检；重启及预检前后的区域、工位归属／坐标／布置、公开模型目录和布局版本逐字段相同，账号仍为 1 个。截图：`.tmp/acceptance/wikibook-preflight-live.png`。备份：`backups/community-2026-10-19T23-44-48-537Z-before-wikibook-preflight-bc4c8350`。

```sh
node --test tests/wikibook*.test.mjs
npm run check
npm run build
E2E_PRODUCTION=1 npm run test:e2e -- tests/e2e/wikibook.spec.mjs
```

源码审计实际导入需要 WikiBook 的 Python 依赖；保护单测只需 Python 3.9+ 标准库。普通服务启动与名单预检 API 不依赖 Python。

## 4. 后续开发门槛

1. 补齐前端路由、文件存储、后台服务与逐接口权限／响应契约；在授权快照上比较实际数据库结构。M0 尚未全项验收。
2. 实现独立身份映射表及唯一约束、WikiBook 密码兼容／认证流程和可恢复的导入事务；当前没有实际学生导入。
3. 实现班级／分组持久化映射和超出现有 256 工位上限时的分世界方案，不能靠提高常量代替容量验证。
4. 正式导入前生成完整备份、预览差异并明确确认，使用脱敏样本先验证重复导入、重启和转班资产保留。
5. 随后迁入原贴纸条件引擎、历史归属与奖励账本，再接 3D 物品，不用现有课堂活力替代 WikiBook 学习事实。

WikiBook 原仓库与真实学生数据保持不变；当前 3D 社区也没有导入测试学生。

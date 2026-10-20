# WikiBook 身份与工位迁移：第二批

日期：2026-10-20。本批交付学生身份持久化、密码兼容、离线导入事务及源库结构差异清单。尚未开始真实学生导入或贴纸规则迁移。

## 1. 来源身份持久化

新增四张表，平台应用表总计从 13 增至 17：

- `source_classes`：来源平台／实例／班级编号 → 平台区域。来源班级与区域在同一实例内一对一。
- `source_identities`：来源平台／实例／学生编号 → 平台用户。数据库约束防止一个来源身份对应两个用户，或同一实例两个身份指向同一用户。
- `source_groups`：独立保存来源学习小组，不把分组当成行政班级。
- `source_memberships`：学习小组与平台用户的关联，组与用户组合唯一。

迁移为 `0002_shocking_master_chief.sql`。身份、班级、小组、成员关系、用户和工位变更在同一状态事务中提交；任何约束或注入故障失败时，数据库与内存一起恢复。来源身份一经绑定，不允许通过再次导入改绑到另一用户。

同一实例重复导入会自动使用已保存的身份／班级映射，不依赖管理员每次重填 `bindings`。转班保持用户 ID、密码、活力、背包与布置；只替换本次明确包含学生的小组成员关系，不删除未提供的其他学生。全班区域映射变动要求包含受影响班级的已导入学生，防止只移动半个班。

## 2. 原密码兼容，不重新设密

平台保留原生 scrypt 校验，并新增 Werkzeug 哈希验证：

- `scrypt:N:r:p`：验证受限的合法参数和固定长度摘要；包含源项目默认 `32768:8:1`。
- `pbkdf2:sha256:iterations` 与 `pbkdf2:sha512:iterations`：限制算法、迭代次数和摘要长度。

通过源项目实际 Werkzeug 生成的固定样本对照，包含中文密码；错误、损坏、未知或过高资源消耗参数拒绝处理。此为支持范围，不代表已核验真实库所有历史密码算法。

新导入账号保留原用户名，支持 1–80 字符及中文／大小写；WikiBook 登录按精确用户名匹配，本地旧账号继续兼容大小写输入。不会截断用户名，不把源账号自动改成小写。哈希和内部凭据格式不出现在登录／个人资料响应中，学号保留在私有来源身份记录中。

**已有目标账号的用户名、密码、角色和个人姓名不会由重复导入覆盖。** 显式绑定到已有学生时，继续使用其目标账号凭据；报告中的 `targetUsername` 表示实际目标登录名。凭据文件给已有用户提供的哈希会被忽略，并以 `existingCredentialsIgnored` 计数提示。这不是密码同步、强制改密、停用账号或完整权限迁移功能。

## 3. 离线命令与确认门槛

网页仍只有预检，没有正式导入 API。实际提交只由本地维护命令执行，开发验证使用隔离数据。不要现在把真实学生数据写入当前社区；应先确认来源范围、账户状态、目标环境与容量规划。

维护输入分为两份，不向网页提交密码哈希：

1. 名单 JSON：延续首批 `wikibook-roster` 版本 1 格式，包括实例、班级、小组、学生、显式映射及可选已有学生绑定。
2. 凭据 JSON：`format` 为 `wikibook-credentials`、`version` 为 `1`，`namespace` 与名单一致；`credentials` 数组每项只有 `sourceUserId`、`passwordHash`。新用户必须提供实际兼容哈希，已绑定账号可不提供。没有明文密码字段，不应把示例测试哈希用于真实账号。

两份输入均须为普通非符号链接 JSON 文件，不允许组／其他用户访问（通常权限 600），各不超过 10 MiB。不支持重复、未知学生的凭据，不自动猜测或生成密码。

```sh
# 先停止目标应用。PGlite 的只读计划也需要停服。
npm run wikibook:import -- --roster /安全目录/名单.json --credentials /安全目录/凭据.json

# 检查预览的 canPlan、changed、issues、summary、existingCredentialsIgnored 与 fingerprint。
# 确认目标环境和计划后，将预览所得 fingerprint 原样作为 --confirm 参数：
npm run wikibook:import -- --roster /安全目录/名单.json --credentials /安全目录/凭据.json --commit --confirm <预览所得指纹>
```

默认只读，不初始化或迁移目标数据库，不创建账号或备份。提交需要独占写锁和精确指纹；输入、凭据或目标业务状态变化后旧指纹失效。PostgreSQL 可在目标应用运行时只读预览，但运行中的写进程会阻止提交；建议停服后重新预览确认。

真正改变业务数据前自动生成完整备份，再升级表结构并重新核对计划，最后事务提交。重复数据返回 `applied: false`、`already-imported`，不重复建号、分配工位或重写密码。底层数据库错误不会把 SQL 参数／密码哈希打印到终端。新增用户只获得平台基础家具，没有导入 WikiBook 成绩、积分、贴纸或奖励。

当前仍有 256 工位的单世界限制；容量不足时拒绝整批导入，不会跳过学生或挤占他人工位。分世界、管理员／教师角色、细粒度权限、停用／毕业处理和完整用户属性仍需后续实施。当前名单是明确指定的学生子集，不应把全表用户当成学生。

## 4. 备份与升级兼容

新完整备份包含全部 17 张表，元数据用 `domainStorageVersion: 2` 标识。新格式缺少来源身份表会拒绝恢复；旧版 13 表和更早的 4 表目录仍可在新版本程序中恢复，新增身份域为空。恢复后正常迁移，不补造身份关联。

这验证的是旧数据备份由新程序恢复，不是旧程序可直接使用新数据库。不要用旧版二进制对新身份数据写入。正式切换要同时保留匹配的代码、迁移和备份版本。

## 5. 源库结构差异：不能漏迁

通过本机 `wikibook-local-postgres` 的只读事务查询 `information_schema`，未查询任何学生或业务记录，未修改源库：

- 实际 `public` 结构共 **185 张表**，声明 metadata 为 **170 张**。
- 实际多出 `alembic_version`，以及 `comment`、三个 `gacha_*` 表和十个 `oj_training_*` 表；这些业务表需逐项核对，不能因为未出现在 ORM 中就丢弃。
- `fishing_profile` 声明的 `rigs`、`equipped_rig` 在当前库结构中缺失。
- 当前库另有若干声明外字段，包括 `user.free_gacha_draws`、抽取保底字段及评论开关。

原始结构记录为 `wikibook-live-schema.json`，表／列存在性差异为 `wikibook-schema-reconciliation.json`。目前没有完成字段长度、索引、外键、默认值、所有类型语义和数据内容的对账，也没有修复源库缺失字段。

可重复查询（只输出表／列结构，不输出记录）：

```sh
docker exec -i wikibook-local-postgres psql -X -v ON_ERROR_STOP=1 -U wikibook -d wikibook -Atq \
  < scripts/wikibook-schema.sql > .tmp/acceptance/wikibook-live-schema-repeat.json
```

M0 仍需完成前端、附件、完整后台依赖、接口契约和上述结构差异归类；M1 仍需源用户完整生命周期／权限与超容量方案。不能把本批学生闭环当作全量迁移完成。

## 6. 验证范围

- 密码样本、独立登录、数据库唯一约束、重复导入、转班资产保留、成员关系更新、故障回滚、备份恢复与旧 13 表兼容。
- 离线 CLI 在隔离 PGlite 与真实 PostgreSQL 上验证：输入权限、停服／写锁、错误确认指纹、完整备份、提交、重复提交、重启保留。
- 浏览器以隔离环境中实际导入的中文账号登录，刷新后 ID 与唯一工位保持不变；不依赖旧站认证服务。
- 证据：`.tmp/acceptance/wikibook-identity-unit.log`、`wikibook-identity-postgres.log`、`wikibook-identity-deployment.log`；浏览器截图 `test-results/wikibook-migrated-student.png`。
- 全量结果：72 项单元／集成、21 项真实 PostgreSQL 专项（包含离线 CLI）、18 条生产构建浏览器测试全部通过；静态检查与构建通过，容器备份／恢复及重启保留验收通过。
- 本地库在完整备份后升级，服务正常；升级前后的区域、工位归属／坐标／布置、公开模型目录与布局版本逐字段相同，真实账号仍为 1 个，管理员 Cookie 与 20 活力保留。未向真实社区加入测试学生。记录：`.tmp/acceptance/wikibook-identity-live-upgrade.json`。

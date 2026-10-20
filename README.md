# 3D 场景 · Cubicles 学习社区

本仓库包含两个部分：

- [`cubicles-local/`](cubicles-local/README.md)：可运行的 Three.js 本地社区，
  包含账号、班级、工位、家具、公共区域和管理员后台。
- [`cubicles-research/`](cubicles-research/REPORT.md)：对原站
  [cubicles.lol](https://www.cubicles.lol/) 的 REA 浏览器调查、证据与静态分析。

## 快速开始

```sh
cd cubicles-local
npm install
npm start
```

打开 <http://127.0.0.1:4173/>。默认管理员：`lzy / 123456`。

本地默认使用嵌入式 PGlite；生产/容器使用 PostgreSQL：

```sh
cd cubicles-local
cp .env.example .env
docker compose up --build
```

## 文档

- [项目说明](cubicles-local/README.md)
- [P0 工程地基：数据库、会话、备份、Compose、E2E](cubicles-local/docs/工程地基.md)
- [完整备份与部署验收](cubicles-local/docs/完整备份与部署验收.md)
- [GitHub 与独立服务端部署](cubicles-local/docs/GitHub与服务端部署.md)
- [后续开发进度](cubicles-local/docs/开发进度.md)
- [本轮开发验收](cubicles-local/docs/本轮验收.md)
- [数据结构与运行边界](cubicles-local/docs/数据结构与运行边界.md)
- [WikiBook 全量迁移规划](cubicles-local/docs/WikiBook迁移规划.md)
- [WikiBook 首批开发验收](cubicles-local/docs/WikiBook首批开发验收.md)
- [WikiBook 身份与工位迁移验收](cubicles-local/docs/WikiBook身份迁移验收.md)
- [3D 模型导入与工位迷你编辑器](cubicles-local/docs/3D模型与工位编辑器.md)
- [世界建模与导入](cubicles-local/docs/世界建模与导入.md)
- [社区长期路线](cubicles-local/COMMUNITY-ROADMAP.md)
- [历史验证记录](cubicles-local/VALIDATION.md)
- [原站技术拆解](cubicles-research/REPORT.md)

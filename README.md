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
- [3D 模型导入与工位迷你编辑器](cubicles-local/docs/3D模型与工位编辑器.md)
- [世界建模与导入](cubicles-local/docs/世界建模与导入.md)
- [社区长期路线](cubicles-local/COMMUNITY-ROADMAP.md)
- [历史验证记录](cubicles-local/VALIDATION.md)
- [原站技术拆解](cubicles-research/REPORT.md)

# 星焰作业板 · StarFlame Workboard

面向中小学课堂的作业看板系统：教室一体机 / 老师设备 / 学生设备通过「班级码 + 授权码」接入，实时同步作业、考试、模板与课程时间段。

- 线上站点：<https://zy.yanhuoyiyou.cn>（作业看板）、<https://zyadmin.yanhuoyiyou.cn>（后台管理面板）
- 下载页：<https://zy.yanhuoyiyou.cn/desktop/>
- 当前版本：**v1.1.5**

## 功能概览

| 模块 | 说明 |
| --- | --- |
| 作业看板 | 今日/本周作业、临时作业、状态流转（未交 / 已交 / 补交）、按班级与课程时间段分组 |
| 考试管理 | 考试安排、考场与座位、成绩录入与统计 |
| 模板中心 | 作业模板、批量套用、按学科分类 |
| 设备接入 | 班级码 + 授权码登录，设备名称可留空自动按授权码类型命名，设备在线状态与批量吊销 |
| 后台管理 | 班级 / 教师 / 学生 / 设备 / 授权码 / 数据统计，游客只读模式 |
| 桌面端 | Electron 大屏客户端，静默自动更新（electron-updater），支持 win7 / win10 / win11 |

## 技术栈

- 前端：Vue 3 + Vite + TypeScript + Vuetify 3 + Pinia + socket.io-client，PWA（vite-plugin-pwa / Workbox）
- 后台：Vue 3 + Vite + TypeScript + Vuetify 3
- 服务端：Node.js + Express + TypeScript + Drizzle ORM + MySQL + Socket.IO + JWT + Zod
- 桌面端：Electron（win10 走 33.x，win7 走 22.x）+ electron-builder（NSIS 安装器、三通道独立更新源）
- 工程：pnpm monorepo（apps/web、apps/admin、apps/server、apps/desktop、packages/shared）

## 目录结构

```
apps/
  web/        作业看板前端（PWA）
  admin/      后台管理面板
  server/     API 服务（Express + Drizzle + MySQL + Socket.IO）
  desktop/    Electron 桌面端 + NSIS 安装器脚本（build/*.nsh）+ 打包脚本
packages/
  shared/     共享类型、Zod schema、常量（APP_VERSION 单点版本源）
```

## 本地开发

需要 Node.js >= 20 与 pnpm 12。

```bash
pnpm install

# 复制并填写服务端环境变量
cp apps/server/.env.example apps/server/.env

pnpm build:shared      # 先构建共享包
pnpm dev:server        # API，默认 3002
pnpm dev:web           # 作业看板，默认 3031
pnpm dev:admin         # 后台管理，默认 3032
```

数据库使用 MySQL，`pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed` 分别用于生成迁移、执行迁移与写入初始数据。

## 构建与发布

```bash
pnpm build                                   # 构建 shared + 全部应用

# 桌面端（三种通道：win7-ia32 / win10-x64 / win10-ia32）
cd apps/desktop
node scripts/pack.mjs win10-x64              # 也可 all
node scripts/build-bootstrap.mjs             # 统一引导下载安装器
```

桌面端安装包产物在 `apps/desktop/release/<channel>/`，安装器界面与默认安装路径逻辑见 `apps/desktop/build/starflame-installer.nsh`：默认装到所选磁盘的 `StarFlame\StarFlameWorkboard` 目录（C 盘落在当前用户 `%LOCALAPPDATA%` 下，全程不请求管理员权限），并在选盘页提示「若一体机开启了冰点还原，推荐安装在 C 盘以外的磁盘」。

## 版本号

版本号单点维护在 `packages/shared/src/constants.ts` 的 `APP_VERSION` / `APP_VERSION_CODE`，同时需同步 `apps/desktop/package.json` 与 `apps/web/src/lib/changelog.ts` 的更新日志。

## 说明

本仓库为私有项目，包含业务代码与部署配置。安装包不进入版本库，统一发布在各平台的 Release / 发行版附件，或从官网下载页获取。

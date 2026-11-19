# 星焰作业板 · StarFlame Workboard

面向中小学课堂的作业看板系统：教室一体机 / 老师设备 / 学生设备通过「班级码 + 授权码」接入，实时同步作业、考试、模板与课程时间段。

[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](./LICENSE)
![Version](https://img.shields.io/badge/version-1.1.5-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20-green)

- GitHub：<https://github.com/StarFlame-Studio/starflame-workboard>
- Gitee：<https://gitee.com/starflame-studio/starflame-workboard>
- 官网：<https://zy.yanhuoyiyou.cn> ｜ 后台管理：<https://zyadmin.yanhuoyiyou.cn>
- 桌面端下载：<https://zy.yanhuoyiyou.cn/desktop/>

> 本项目以 MIT 协议开源，欢迎 Issue / PR。

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

# 复制并填写服务端环境变量（数据库、JWT 密钥、七牛等）
cp apps/server/.env.example apps/server/.env

pnpm build:shared      # 先构建共享包
pnpm dev:server        # API，默认 3002
pnpm dev:web           # 作业看板，默认 3031
pnpm dev:admin         # 后台管理，默认 3032
```

数据库使用 MySQL，`pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed` 分别用于生成迁移、执行迁移与写入初始数据（初始管理员密码由 `SEED_PASSWORD` 环境变量决定）。

## 构建与发布

```bash
pnpm build                                   # 构建 shared + 全部应用

# 桌面端（三种通道：win7-ia32 / win10-x64 / win10-ia32）
cd apps/desktop
node scripts/pack.mjs win10-x64              # 也可 all
node scripts/build-bootstrap.mjs             # 统一引导下载安装器
```

桌面端安装包产物在 `apps/desktop/release/<channel>/`。安装器界面与默认安装路径逻辑见 `apps/desktop/build/starflame-installer.nsh`：默认装到所选磁盘的 `StarFlame\StarFlameWorkboard` 目录（C 盘落在当前用户 `%LOCALAPPDATA%` 下，全程不请求管理员权限），并在选盘页提示「若一体机开启了冰点还原，推荐安装在 C 盘以外的磁盘」。

## 版本号

版本号单点维护在 `packages/shared/src/constants.ts` 的 `APP_VERSION` / `APP_VERSION_CODE`，同时需同步 `apps/desktop/package.json` 与 `apps/web/src/lib/changelog.ts` 的更新日志。

## 下载

安装包不进入版本库，统一发布在各平台的发行版附件：

- GitHub Releases：<https://github.com/StarFlame-Studio/starflame-workboard/releases>
- Gitee 发行版：<https://gitee.com/starflame-studio/starflame-workboard/releases>
- 官网下载页：<https://zy.yanhuoyiyou.cn/desktop/>

## 安全说明

- 仓库不包含任何生产环境密钥：数据库连接串、JWT 密钥、七牛密钥、签名证书密码一律通过环境变量注入，见 `apps/server/.env.example`。
- 签名证书（`*.pfx`）、安装包、构建产物、内部日志均已加入 `.gitignore`。
- 发现安全问题请通过 Issue 私密反馈或邮件联系维护者，不要公开提交漏洞细节。

## 许可证

本项目基于 [MIT License](./LICENSE) 开源，Copyright © 2026 焰火工作室（StarFlame Studio）。

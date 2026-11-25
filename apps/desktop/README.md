# 星焰作业板 · Windows 桌面端

Electron 包壳，直接复用 `apps/web` 的同一份 Vue 3 + Vuetify 3 渲染代码，UI、布局、交互逻辑与网页端完全一致。

## 为什么是 Electron

- 前端是 HTML/CSS/Vuetify 技术栈，换成 C++/Qt 或 Python 必须整套重画界面，无法做到「和网页端一样」；
- Electron 自带 Chromium，Win7 SP1 与 Win10/11 都能跑，一体机触摸、全屏、离线缓存可复用同一套前端逻辑；
- 用 CEF 手写浏览器壳的成本与直接使用 Electron 等价，还要自己解决打包、签名、自动更新。

## 三通道（同一份源码，三套产物）

| 通道 | Electron | 架构 | 适用系统 | 说明 |
| --- | --- | --- | --- | --- |
| `win7-ia32` | 22.3.27 | ia32 | Win7 SP1 / 8 / 8.1 / 10 / 11（32+64 位） | Chromium 108，Win7 最后被支持的 Electron 大版本 |
| `win10-x64` | 33.4.11 | x64 | Win10 / 11 64 位 | 主力通道，性能与硬件加速最好 |
| `win10-ia32` | 33.4.11 | ia32 | Win10 / 11 32 位老一体机 | 系统太老装不了 x64 版时使用 |

通道定义集中在 `scripts/channels.cjs`，新增通道只需在这里加一项。

## 兼容基线

渲染代码需同时满足 Chromium 108（win7 通道），因此前端**不要**使用：

- CSS `oklch()` / `color-mix()` 之外的新色彩函数（`light-dark()` 等）
- View Transitions API、`@starting-style`
- `Object.groupBy` / `Array.fromAsync` / `Set.prototype.union` 等 ES2024+ 运行时 API
- Popover API、`<dialog>` 的新特性

Vite 构建目标见 `apps/web/vite.config.ts`（`build.target`）。

## 目录结构

```
apps/desktop
├─ build/                NSIS 图标与安装校验片段（Win7 / Win10 各一份）
├─ renderer/             渲染进程产物（由 apps/web 构建而来，不纳入版本库）
├─ scripts/
│  ├─ channels.cjs       通道定义与更新源地址
│  ├─ build-main.mjs     用 esbuild 打包主进程 / 预加载脚本
│  ├─ build-renderer.mjs 调用 apps/web 的 vite 构建渲染进程
│  ├─ dev.mjs            本地开发：build-main → build-renderer → electron .
│  ├─ pack.mjs           打包入口（按通道产出 NSIS + 便携 zip）
│  └─ shot.mjs           截图验证：注入设备令牌后抓一张窗口截图
├─ src/main/             主进程（窗口、协议、IPC、缓存、自动更新）
├─ src/preload/          contextBridge 暴露的 window.sfDesktop
```

## 常用命令

```bash
# 本地运行（首次会先构建 renderer，约 30s）
node apps/desktop/scripts/dev.mjs

# 只构建主进程 / 渲染进程
node apps/desktop/scripts/build-main.mjs
node apps/desktop/scripts/build-renderer.mjs

# 打包（产物在 apps/desktop/release/<channel>/）
node apps/desktop/scripts/pack.mjs win10-x64
node apps/desktop/scripts/pack.mjs win7-ia32
node apps/desktop/scripts/pack.mjs all
```

打包会用 npmmirror 的 Electron / electron-builder 二进制镜像，可用环境变量覆盖：
`ELECTRON_MIRROR`、`ELECTRON_BUILDER_BINARIES_MIRROR`。

> **Linux 构建机（本仓库当前的打包环境）**
>
> - electron-builder 自带的 wine 11 工具链缺少 PE 内置库（`lib/wine/x86_64-windows`），
>   跑不起 `signtool.exe`，因此 `electron-builder.config.cjs` 里用 Linux 原生的
>   `osslsigncode` 作为自定义签名器（`win.signtoolOptions.sign`，SHA-256 + RFC3161 时间戳）；
> - NSIS 生成卸载器仍需 wine，所以打包时要让 electron-builder 用系统 wine：
>   `USE_SYSTEM_WINE=true`（需要已安装 `wine`、`wine32:i386`、`osslsigncode`）；
> - 证书密码通过环境变量注入，例如：
>
>   ```bash
>   USE_SYSTEM_WINE=true SF_CERT_PASSWORD='<pfx 密码>' node apps/desktop/scripts/pack.mjs all
>   ```
>
> 没有证书时设置 `SF_SKIP_SIGN=1` 可跳过签名（产物未签名，不建议发布）。

> 注意：DSH 环境会注入 `ELECTRON_RUN_AS_NODE=1`，直接跑 electron 会退化成纯 Node 进程。
> 用脚本调用时务必删除该变量（`delete env.ELECTRON_RUN_AS_NODE`）。

## 产物与发布

每个通道产出：

- `StarflameWorkboard-<version>-<versionCode>-<arch>.exe`：NSIS 安装包（可选安装目录、创建桌面与开始菜单快捷方式）
- `StarflameWorkboard-<version>-<versionCode>-<arch>.zip`：便携版（解压即用）
- `latest.yml`：electron-updater 的更新清单（含 sha512 与 blockMap，以及客户端用来做数字比较的 `versionCode`）

打包脚本会自动把 `packages/shared/src/constants.ts` 里的 `APP_VERSION_CODE` 写成 `latest.yml` 的 `versionCode`，
并校验 `APP_VERSION` 与 `apps/desktop/package.json` 的 `version` 一致（不一致直接报错退出）。
客户端（v1.2.1 起）优先按这个数字判断有没有新版本，所以**每次发布都必须递增 `APP_VERSION_CODE`**，
否则显示版本号相同、只是重新构建的包，已安装的设备会认为「已经是最新」而收不到。

发布目录与更新源一致：`https://zy.yanhuoyiyou.cn/desktop/<channel>/`，即服务器
`/www/wwwroot/starflame-workboard-web/desktop/<channel>/`。发布步骤：

```bash
node apps/desktop/scripts/pack.mjs win10-x64
# 上传 release/win10-x64/ 下的 exe、zip、latest.yml、*.blockmap 到
# /www/wwwroot/starflame-workboard-web/desktop/win10-x64/
```

NSIS 安装包内的 `nsis-require-win7.nsh` / `nsis-require-win10.nsh` 会在安装前校验系统版本，
不满足时直接提示并中止，避免用户在错误系统上装出打不开的程序。
覆盖发布时先上传带构建号的新文件，再切换 `latest.yml`；不要覆盖旧清单还在引用的包。显示版本号更低但构建号更高时（如 1.2.2/1012 → 1.2.1/1013），旧客户端仍按数字版本号自动升级。

## 主进程能力（window.sfDesktop）

| 命名空间 | 方法 |
| --- | --- |
| `app` | `info()` `quit()` `relaunch()` `openExternal(url)` |
| `window` | `state()` `toggleFullscreen()` `setFullscreen(on)` `minimize()` `maximize()` `close()` |
| `cache` | `read(key)` `write(key, value)` `remove(key)` `list()`（userData/cache/*.json，单键上限 4MB） |
| `update` | `status()` `check()` `download()` `install()` `onStatus(cb)` |
| `print` | `page()` |

前端通过 `apps/web/src/lib/platform` 访问：网页端自动降级为 Fullscreen API / localStorage / 空操作，
因此**业务代码不要直接判断 `window.sfDesktop`**，统一走平台层。

## 安全约束

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；
- 渲染进程通过自定义协议 `app://local` 加载，协议处理器做了目录穿越防护，并按 nginx `try_files` 语义补 `.html`；
- 外部链接一律交系统浏览器打开，`will-navigate` 拦截非 `app://` 跳转；
- 服务端 CORS 已把 `app://local` 加入白名单（`CORS_ORIGINS`）。

## 常见问题

**窗口全黑、日志刷 `did-fail-load -3 app://local/xxx`**：协议处理器没补 `.html` 或 renderer 目录缺失，先确认
`apps/desktop/renderer/index.html` 存在。

**接口全部 CORS 报错**：服务端 `.env` 的 `CORS_ORIGINS` 少了 `app://local`。

**打包报 `Application entry file "dist/main/index.js" ... not found`**：electron-builder 未读到本目录的
`electron-builder.config.cjs`（输出目录会退回默认的 `dist` 并抹掉主进程产物），确认 `pack.mjs` 里带了
`--config electron-builder.config.cjs`。

## 统一安装引导与下载页

- `build/bootstrap.nsi` + `scripts/build-bootstrap.mjs` → `release/bootstrap/StarflameWorkboard-Setup-<version>.exe`（版本号取自 `apps/desktop/package.json`）
  （按 `AtLeastWin10` / `RunningX64` 选通道，`NSISdl` 走 http 下载后拉起真正的安装包）；
- `download-page/index.html` → 发布为 `https://zy.yanhuoyiyou.cn/desktop/`。

```bash
node apps/desktop/scripts/build-bootstrap.mjs
# 上传 release/bootstrap/StarflameWorkboard-Setup-<version>.exe 到
# /www/wwwroot/starflame-workboard-web/desktop/
```

> `build/bootstrap.nsi` 必须保存为 **UTF-8 带 BOM**（`Unicode true` 要求），否则 makensis 报
> `Bad text encoding`。`NSISdl` 只能下 http，不能用 https。


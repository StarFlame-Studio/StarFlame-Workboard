// 用 esbuild 打包主进程与预加载脚本（CJS，外部化 electron / electron-updater）
import { build } from 'esbuild'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const channel = process.env.DESKTOP_CHANNEL || 'dev'
const outBase = resolve(import.meta.dirname, '../dist')
mkdirSync(outBase, { recursive: true })

// 数字版本号从共享常量读，避免桌面端再依赖 @starflame/shared（主进程是整包 bundle 的）
const constantsText = readFileSync(resolve(import.meta.dirname, '../../../packages/shared/src/constants.ts'), 'utf8')
const versionCode = Number((/APP_VERSION_CODE\s*=\s*(\d+)/.exec(constantsText) || [])[1] || 0)
if (!Number.isFinite(versionCode) || versionCode <= 0) {
  console.error('[build-main] 无法从 packages/shared/src/constants.ts 读取 APP_VERSION_CODE')
  process.exit(1)
}

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Electron 22 = Node 16.17，两个通道取交集，避免用到新语法
  target: 'node16',
  sourcemap: false,
  external: ['electron', 'electron-updater'],
  define: {
    __DESKTOP_CHANNEL__: JSON.stringify(channel),
    __APP_VERSION_CODE__: String(versionCode),
  },
  logLevel: 'info',
}

await build({ ...shared, entryPoints: [resolve(import.meta.dirname, '../src/main/index.ts')], outfile: resolve(outBase, 'main/index.js') })
await build({ ...shared, entryPoints: [resolve(import.meta.dirname, '../src/preload/index.ts')], outfile: resolve(outBase, 'preload/index.js') })
console.log('[build-main] channel=' + channel + ' done')

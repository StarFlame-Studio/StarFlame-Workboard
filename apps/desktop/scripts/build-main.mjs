// 用 esbuild 打包主进程与预加载脚本（CJS，外部化 electron / electron-updater）
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const channel = process.env.DESKTOP_CHANNEL || 'dev'
const outBase = resolve(import.meta.dirname, '../dist')
mkdirSync(outBase, { recursive: true })

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Electron 22 = Node 16.17，两个通道取交集，避免用到新语法
  target: 'node16',
  sourcemap: false,
  external: ['electron', 'electron-updater'],
  define: { __DESKTOP_CHANNEL__: JSON.stringify(channel) },
  logLevel: 'info',
}

await build({ ...shared, entryPoints: [resolve(import.meta.dirname, '../src/main/index.ts')], outfile: resolve(outBase, 'main/index.js') })
await build({ ...shared, entryPoints: [resolve(import.meta.dirname, '../src/preload/index.ts')], outfile: resolve(outBase, 'preload/index.js') })
console.log('[build-main] channel=' + channel + ' done')

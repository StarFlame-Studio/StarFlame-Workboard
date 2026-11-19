// 复用 apps/web 的 Vite 构建，产物落到 apps/desktop/renderer（随安装包内置，断网可用）
// Windows 上不要用 spawnSync('npx')，直接跑 node_modules 里的 CLI 脚本更稳
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const webDir = resolve(import.meta.dirname, '../../web')
const viteEntry = resolve(webDir, 'node_modules/vite/bin/vite.js')
if (!existsSync(viteEntry)) {
  console.error('[build-renderer] 找不到 vite：' + viteEntry + '（请先在仓库根执行 pnpm install）')
  process.exit(1)
}

const r = spawnSync(process.execPath, [viteEntry, 'build'], {
  cwd: webDir,
  stdio: 'inherit',
  env: { ...process.env, DESKTOP_BUILD: '1' },
})
if (r.status !== 0) {
  console.error('[build-renderer] vite build 失败，退出码 ' + r.status)
  process.exit(r.status ?? 1)
}
console.log('[build-renderer] 输出目录 apps/desktop/renderer')

// 复用 apps/web 的 Vite 构建，产物落到 apps/desktop/renderer（随安装包内置，断网可用）
// Windows 上不要用 spawnSync('npx')，直接跑 node_modules 里的 CLI 脚本更稳
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../../..')
const sharedDir = resolve(repoRoot, 'packages/shared')
const webDir = resolve(import.meta.dirname, '../../web')

// 先重建 @starflame/shared：renderer 里的版本号来自它的 dist（APP_VERSION / APP_VERSION_CODE），
// 如果 dist 是旧的（例如只改了两处常量就单独 build web），打包出的界面会显示上个版本号。
const tscCandidates = [
  resolve(repoRoot, 'packages/shared/node_modules/typescript/bin/tsc'),
  resolve(repoRoot, 'node_modules/typescript/bin/tsc'),
  resolve(repoRoot, 'apps/web/node_modules/typescript/bin/tsc'),
  resolve(repoRoot, 'apps/desktop/node_modules/typescript/bin/tsc'),
]
const tscEntry = tscCandidates.find(candidate => existsSync(candidate))
if (!tscEntry) {
  console.error('[build-renderer] 找不到 tsc，试过：\n  ' + tscCandidates.join('\n  ') + '\n（请先在仓库根执行 pnpm install）')
  process.exit(1)
}
const shared = spawnSync(process.execPath, [tscEntry, '-p', 'tsconfig.build.json'], {
  cwd: sharedDir,
  stdio: 'inherit',
})
if (shared.status !== 0) {
  console.error('[build-renderer] @starflame/shared 构建失败，退出码 ' + shared.status)
  process.exit(shared.status ?? 1)
}
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

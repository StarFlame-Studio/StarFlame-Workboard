// 本地调试：先构建主进程与渲染进程，再用 Electron 打开
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const pkgDir = resolve(import.meta.dirname, '..')
const electronCli = resolve(pkgDir, 'node_modules/electron/cli.js')
if (!existsSync(electronCli)) {
  console.error('[dev] 找不到 electron，请先执行 pnpm install')
  process.exit(1)
}

const run = (args, env) => {
  const r = spawnSync(process.execPath, args, { cwd: pkgDir, stdio: 'inherit', env: { ...process.env, ...env } })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run(['scripts/build-main.mjs'], { DESKTOP_CHANNEL: process.env.DESKTOP_CHANNEL || 'dev' })
run(['scripts/build-renderer.mjs'], {})
run([electronCli, '.'], { SF_DEVTOOLS: process.env.SF_DEVTOOLS || '' })

// 开发验证：起 Electron 窗口，注入登录态，截图后退出（仅本地用）
// 用法：node scripts/shot.mjs <out.png> [wall|classic] [dark|light]
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const API = 'https://zyapi.yanhuoyiyou.cn/api'
const CLASS_CODE = '8FB78CE4'
const ACCESS_CODE = '539E1CEAD9'

const [out, layout = 'wall', theme = 'dark'] = process.argv.slice(2)
if (!out) {
  console.error('用法：node scripts/shot.mjs <out.png> [wall|classic] [dark|light]')
  process.exit(1)
}

async function deviceToken() {
  const res = await fetch(API + '/device/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ classCode: CLASS_CODE, accessCode: ACCESS_CODE, deviceName: 'desktop-verify' }),
  })
  const json = await res.json()
  const token = json?.data?.deviceToken
  if (!token) throw new Error('device/login 失败：' + JSON.stringify(json).slice(0, 300))
  return token
}

const token = await deviceToken()
const pkgDir = resolve(import.meta.dirname, '..')
const electronCli = resolve(pkgDir, 'node_modules/electron/cli.js')
if (!existsSync(electronCli)) throw new Error('找不到 electron：' + electronCli)
mkdirSync(dirname(resolve(out)), { recursive: true })

// DSH 等终端会注入 ELECTRON_RUN_AS_NODE=1，会让 electron.exe 退化成纯 Node，必须剔除
const env = { ...process.env, SF_TOKEN: token, SF_SHOT: resolve(out), SF_LAYOUT: layout, SF_THEME: theme }
delete env.ELECTRON_RUN_AS_NODE

const r = spawnSync(process.execPath, [electronCli, '.'], { cwd: pkgDir, stdio: 'inherit', env })
console.log('[shot] exit=' + r.status + ' → ' + resolve(out))
process.exit(r.status ?? 1)

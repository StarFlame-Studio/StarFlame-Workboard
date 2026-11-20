/**
 * 后台远程卸载：静默运行 NSIS 卸载程序并退出应用。
 *
 * 卸载器位置按以下顺序探测：
 * 1. 注册表 UninstallString（HKCU / HKLM，含 WOW6432Node）——最可靠；
 * 2. 程序所在目录下的「Uninstall 星焰作业板.exe」；
 * 3. 程序所在目录下的 Uninstall.exe。
 *
 * 注意：不能传 --force-run（那是更新安装器用的参数，会让卸载完成后重新拉起应用）。
 */
import { app } from 'electron'
import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setQuitting } from './appState'

const APP_ID = 'cn.yanhuoyiyou.starflame.workboard'
const PRODUCT_NAME = '星焰作业板'
const QUIT_DELAY_MS = 400
/** 卸载器在应用完全退出后再启动的等待秒数 */
const DELAY_BEFORE_UNINSTALL_SEC = 4

export interface UninstallResult {
  ok: boolean
  message?: string
}

function log(line: string): void {
  try {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'uninstall.log'), '[' + new Date().toISOString() + '] ' + line + '\n', 'utf8')
  } catch {
    // 日志失败不影响卸载
  }
}

/** 把注册表里的 UninstallString 拆成可执行文件与参数 */
function splitCommand(raw: string): { exe: string; args: string[] } | null {
  const text = raw.trim()
  if (!text) return null
  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1)
    if (end < 0) return null
    const exe = text.slice(1, end)
    const rest = text.slice(end + 1).trim()
    return { exe, args: rest ? rest.split(/\s+/) : [] }
  }
  // 未加引号：路径可能含空格，取到 .exe 为止
  const lower = text.toLowerCase()
  const idx = lower.indexOf('.exe')
  if (idx < 0) return { exe: text, args: [] }
  const exe = text.slice(0, idx + 4)
  const rest = text.slice(idx + 4).trim()
  return { exe, args: rest ? rest.split(/\s+/) : [] }
}

function readRegistryUninstallString(): string | null {
  if (process.platform !== 'win32') return null
  const roots = ['HKCU', 'HKLM']
  const paths = [
    'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + APP_ID,
    'Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + APP_ID,
  ]
  for (const root of roots) {
    for (const sub of paths) {
      try {
        const out = execFileSync('reg', ['query', root + '\\' + sub, '/v', 'UninstallString'], {
          encoding: 'utf8',
          timeout: 5000,
          windowsHide: true,
        })
        const match = /UninstallString\s+REG_(?:EXPAND_)?SZ\s+(.+)/.exec(out)
        if (match && match[1].trim()) return match[1].trim()
      } catch {
        // 该注册表位置不存在，继续尝试下一个
      }
    }
  }
  return null
}

/** 找到卸载程序；找不到返回 null */
export function locateUninstaller(): { exe: string; args: string[] } | null {
  const raw = readRegistryUninstallString()
  if (raw) {
    const parsed = splitCommand(raw)
    if (parsed && existsSync(parsed.exe)) return parsed
    log('注册表卸载器不存在：' + (parsed ? parsed.exe : raw))
  }

  const installDir = dirname(app.getPath('exe'))
  const candidates = [
    join(installDir, 'Uninstall ' + PRODUCT_NAME + '.exe'),
    join(installDir, 'Uninstall.exe'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return { exe: candidate, args: [] }
  }
  log('未找到卸载程序，安装目录：' + installDir)
  return null
}

/** 静默卸载并退出应用 */
export function uninstallSelf(): UninstallResult {
  const found = locateUninstaller()
  if (!found) return { ok: false, message: '未找到卸载程序，请手动卸载' }

  const installDir = dirname(found.exe)
  const args = [...found.args]
  if (!args.includes('/S')) args.push('/S')
  // NSIS 静默卸载必须显式给出安装目录，否则卸载器复制到临时目录后找不到自身资源
  if (!args.some((arg) => arg.startsWith('_?='))) args.push('_?=' + installDir)

  // 先让应用自己退出，再由 cmd 延时启动卸载器：
  // 卸载器一旦发现应用还在运行，会尝试强杀进程，容易留下删不掉的文件
  const quoted = [found.exe, ...args].map((part) => '"' + part.replace(/"/g, '') + '"').join(' ')
  const command = 'timeout /t ' + DELAY_BEFORE_UNINSTALL_SEC + ' /nobreak >nul & ' + quoted
  try {
    const child = spawn('cmd.exe', ['/d', '/s', '/c', command], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
  } catch (err) {
    log('启动卸载程序失败：' + String(err))
    return { ok: false, message: '启动卸载程序失败' }
  }

  log('已安排卸载：' + found.exe + ' ' + args.join(' '))
  setTimeout(() => {
    setQuitting(true)
    app.quit()
  }, QUIT_DELAY_MS)

  return { ok: true, message: found.exe }
}

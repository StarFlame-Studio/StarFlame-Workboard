/**
 * 后台远程卸载：静默运行 NSIS 卸载程序并退出应用。
 *
 * 卸载器位置按以下顺序探测：
 * 1. 注册表 QuietUninstallString / UninstallString（HKCU / HKLM，含 WOW6432Node）——最可靠；
 * 2. 程序所在目录下的「Uninstall 星焰作业板.exe」；
 * 3. 程序所在目录下的 Uninstall.exe。
 *
 * 整个过程不需要设备上的人做任何操作：收到后台指令后直接安排静默卸载并退出应用。
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
/** 提交卸载后等待应用退出的时间：留够渲染进程把执行回执发回服务端 */
const QUIT_DELAY_MS = 1200
/** 卸载器在应用完全退出后再启动的等待秒数（给进程退出与文件句柄释放留时间） */
const DELAY_BEFORE_UNINSTALL_SEC = 5

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

/**
 * 后台拉起一个完全脱离本进程的实例（不继承句柄、不阻塞退出）。
 * 返回是否成功创建进程。
 */
function spawnDetached(args: string[], file = 'cmd.exe'): boolean {
  try {
    const child = spawn(file, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.on('error', (err) => log('拉起进程失败：' + String(err)))
    child.unref()
    return true
  } catch (err) {
    log('拉起进程异常：' + String(err))
    return false
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

function readRegistryValue(valueName: string): string | null {
  if (process.platform !== 'win32') return null
  const roots = ['HKCU', 'HKLM']
  const paths = [
    'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + APP_ID,
    'Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + APP_ID,
  ]
  for (const root of roots) {
    for (const sub of paths) {
      try {
        const out = execFileSync('reg', ['query', root + '\\' + sub, '/v', valueName], {
          encoding: 'utf8',
          timeout: 5000,
          windowsHide: true,
        })
        const match = new RegExp(valueName + '\\s+REG_(?:EXPAND_)?SZ\\s+(.+)').exec(out)
        if (match && match[1].trim()) return match[1].trim()
      } catch {
        // 该注册表位置/键值不存在，继续尝试下一个
      }
    }
  }
  return null
}

function readRegistryUninstallString(): string | null {
  // NSIS 会同时写 UninstallString（不带 /S）与 QuietUninstallString（自带 /S）：
  // 优先用静默那条，避免卸载器弹出交互界面
  return readRegistryValue('QuietUninstallString') ?? readRegistryValue('UninstallString')
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

  // 先让应用自己退出，再由系统延时启动卸载器：
  // 卸载器一旦发现应用还在运行，会尝试强杀进程，容易留下删不掉的文件。
  //
  // 延时不能用 timeout.exe：本进程 stdio 全为 ignore、没有控制台，
  // timeout 会立刻报「输入重定向不受支持」而秒退，卸载器就会在应用还活着时启动。
  // ping 不需要控制台，是 Windows 上最稳的无人值守延时方式。
  const quoted = [found.exe, ...args].map((part) => '"' + part.replace(/"/g, '') + '"').join(' ')
  const delayPings = String(DELAY_BEFORE_UNINSTALL_SEC + 1)
  const command = 'ping -n ' + delayPings + ' 127.0.0.1 >nul & ' + quoted
  const launched = spawnDetached(['/d', '/s', '/c', command])
  if (!launched) {
    // 极小概率下 cmd 不可用：退回到 PowerShell 的进程启动方式
    const psArgs = ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command',
      'Start-Sleep -Seconds ' + DELAY_BEFORE_UNINSTALL_SEC + "; Start-Process -FilePath '" +
      found.exe.replace(/'/g, "''") + "'" +
      (args.length ? " -ArgumentList '" + args.join(' ').replace(/'/g, "''") + "'" : '')]
    if (!spawnDetached(psArgs, 'powershell.exe')) {
      log('启动卸载程序失败：cmd 与 powershell 均不可用')
      return { ok: false, message: '启动卸载程序失败' }
    }
  }

  log('已安排卸载：' + found.exe + ' ' + args.join(' '))
  setTimeout(() => {
    setQuitting(true)
    app.quit()
  }, QUIT_DELAY_MS)

  return { ok: true, message: found.exe }
}

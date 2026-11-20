/**
 * 后台远程卸载：静默运行 NSIS 卸载程序并退出应用，设备上不需要任何人操作。
 *
 * 卸载器位置按以下顺序探测（历史版本曾把注册表键写成 appId，而 NSIS 实际写的是
 * 由 appId 派生的 GUID，导致定位失败、远程卸载报「未找到卸载程序」）：
 * 1. HKCU\Software\<GUID> 的 InstallLocation（安装时写入的安装目录），到目录里找 Uninstall*.exe；
 * 2. 枚举 HKCU / HKLM（含 WOW6432Node）Uninstall 根下的子键，按 DisplayName 匹配「星焰作业板」，
 *    读取 QuietUninstallString / UninstallString；
 * 3. 程序所在目录下的 Uninstall*.exe（可执行文件名是 ASCII 的 StarflameWorkboard）。
 *
 * 注意：不能传 --force-run / --updated（那是静默更新用的参数，会让卸载完成后重新拉起应用）。
 */
import { app } from 'electron'
import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setQuitting } from './appState'
import {
  buildSilentArgs,
  pickRegistryValue,
  pickUninstallerFile,
  pickUninstallKeys,
  splitCommand,
  type UninstallCommand,
} from './uninstallLocate'

/** electron-builder 为 appId 生成的 NSIS 安装键 GUID（UUID v5，固定值，不会随版本变化） */
const NSIS_APP_GUID = '82838bdf-0d41-529f-bdfe-8c59998432ee'
/** 卸载器 DisplayName 里出现的关键词，用于在注册表里认出本产品 */
const UNINSTALL_KEYWORDS = ['星焰作业板', 'StarflameWorkboard', 'Starflame']

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

/** 跑一次 reg query；键或值不存在时返回 null（不抛错） */
function queryRegistry(args: string[]): string | null {
  if (process.platform !== 'win32') return null
  try {
    return execFileSync('reg', ['query', ...args], { encoding: 'utf8', timeout: 5000, windowsHide: true })
  } catch {
    return null
  }
}

/** 用注册表里的卸载命令构造卸载器信息（文件必须存在） */
function fromRegistryString(raw: string | null): UninstallCommand | null {
  if (!raw) return null
  const parsed = splitCommand(raw)
  if (!parsed || !existsSync(parsed.exe)) {
    if (parsed) log('注册表记录的卸载器不存在：' + parsed.exe)
    return null
  }
  return parsed
}

/** 安装目录（从安装时写入的 InstallLocation 或可执行文件目录推断） */
function resolveInstallDirs(): string[] {
  const dirs: string[] = []
  const fromRegistry = queryRegistry(['HKCU\\Software\\' + NSIS_APP_GUID, '/v', 'InstallLocation'])
  const location = fromRegistry ? pickRegistryValue(fromRegistry, 'InstallLocation') : null
  if (location) dirs.push(location)
  try {
    dirs.push(dirname(app.getPath('exe')))
  } catch {
    // 极端情况下取不到 exe 路径
  }
  return [...new Set(dirs.filter(Boolean))]
}

/** 在安装目录里找 Uninstall*.exe（文件名以可执行文件名为准，是 ASCII） */
function uninstallerInDir(dir: string): UninstallCommand | null {
  try {
    const files = readdirSync(dir)
    const exeName = (() => {
      try {
        return app.getPath('exe').split(/[\\/]/).pop()!.replace(/\.exe$/i, '')
      } catch {
        return 'StarflameWorkboard'
      }
    })()
    const name = pickUninstallerFile(files, exeName)
    if (name) return { exe: join(dir, name), args: [] }
  } catch {
    // 目录不可读，交给下一条路径
  }
  return null
}

/** 在注册表 Uninstall 根下按 DisplayName 枚举，找到本产品的卸载命令 */
function fromUninstallRoots(): UninstallCommand | null {
  const roots = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]
  for (const root of roots) {
    const listed = queryRegistry([root, '/s', '/v', 'DisplayName'])
    if (!listed) continue
    for (const key of pickUninstallKeys(listed, UNINSTALL_KEYWORDS)) {
      // 优先静默命令，避免卸载器弹出交互界面
      for (const valueName of ['QuietUninstallString', 'UninstallString']) {
        const raw = queryRegistry([key, '/v', valueName])
        const found = raw ? fromRegistryString(pickRegistryValue(raw, valueName)) : null
        if (found) return found
      }
    }
  }
  return null
}

/** 找到卸载程序；找不到返回 null */
export function locateUninstaller(): UninstallCommand | null {
  for (const dir of resolveInstallDirs()) {
    const found = uninstallerInDir(dir)
    if (found) return found
  }
  const fromRegistry = fromUninstallRoots()
  if (fromRegistry) return fromRegistry
  log('未找到卸载程序，已尝试目录：' + resolveInstallDirs().join(', '))
  return null
}

/**
 * 写一个临时脚本，由它延时后用 start 拉起卸载器。
 * 用脚本而不是拼 cmd 命令串，是为了彻底避开引号嵌套问题（路径里可能含空格与中文）。
 * 延时不能用 timeout.exe：本进程 stdio 全为 ignore、没有控制台，timeout 会立刻报
 * 「输入重定向不受支持」而秒退，卸载器就会在应用还活着时启动。ping 不需要控制台。
 */
function scheduleUninstaller(found: UninstallCommand, args: string[]): boolean {
  if (process.platform !== 'win32') return false
  const quoted = '"' + found.exe.replace(/"/g, '') + '"' + (args.length ? ' ' + args.join(' ') : '')
  const script = [
    '@echo off',
    'ping -n ' + String(DELAY_BEFORE_UNINSTALL_SEC + 1) + ' 127.0.0.1 >nul',
    'start "" ' + quoted,
    'del "%~f0" >nul 2>nul',
    '',
  ].join('\r\n')
  try {
    const scriptPath = join(app.getPath('temp'), 'starflame-uninstall-' + Date.now() + '.cmd')
    writeFileSync(scriptPath, script, 'utf8')
    const child = spawn('cmd.exe', ['/d', '/s', '/c', scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.on('error', (err) => log('拉起卸载脚本失败：' + String(err)))
    child.unref()
    return true
  } catch (err) {
    log('写卸载脚本失败：' + String(err))
    return false
  }
}

/** 静默卸载并退出应用 */
export function uninstallSelf(): UninstallResult {
  const found = locateUninstaller()
  if (!found) {
    // 把安装目录带回回执：后台设备页能直接看到这台机器上找的是哪个目录，便于排查
    let dir = ''
    try {
      dir = dirname(app.getPath('exe'))
    } catch {
      dir = ''
    }
    return { ok: false, message: ('未找到卸载程序，安装目录：' + dir).slice(0, 200) }
  }

  const args = buildSilentArgs(found.args)
  if (!process.env.SF_UNINSTALL_DRY_RUN) {
    if (!scheduleUninstaller(found, args)) {
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

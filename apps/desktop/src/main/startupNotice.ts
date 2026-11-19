import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * 启动时判断「这次是不是刚被静默更新过」，供渲染进程弹出「已更新到 x.y.z」提示。
 *
 * 判定依据（满足其一即可）：
 *   1. 进程参数带 --updated：electron-builder 的安装器在「升级安装」结束后就是用这个
 *      参数拉起新版本的（templates/nsis/common.nsh:126 StartApp）；静默安装时走
 *      installSection.nsh:106 的 isForceRun + Silent 分支，所以自动更新重启后必定带该参数。
 *   2. 上次记录的版本号与本次不同：覆盖手动安装新包、以及从没有本模块的旧版本升级过来的情况。
 *
 * 首次安装不提示：没有历史版本记录且不是 --updated 启动时，只写入当前版本。
 */
export interface SfStartupNotice {
  /** 更新前版本（无从得知时为 null） */
  from: string | null
  /** 当前版本，即「已更新到」的版本 */
  to: string
}

const STATE_FILE = 'version-state.json'
/** 超过这个时间还没被页面取走就不再提示（避免窗口一直没开、几小时后才弹） */
const NOTICE_GRACE_MS = 10 * 60 * 1000

let pending: SfStartupNotice | null = null
let consumed = false
const startedAt = Date.now()

function userDataFile(name: string): string {
  return join(app.getPath('userData'), name)
}

function readRecordedVersion(): string | null {
  try {
    const file = userDataFile(STATE_FILE)
    if (!existsSync(file)) return null
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown }
    return typeof raw.version === 'string' && raw.version ? raw.version : null
  } catch {
    return null
  }
}

function writeRecordedVersion(version: string): void {
  try {
    const file = userDataFile(STATE_FILE)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ version, at: new Date().toISOString() }), 'utf8')
  } catch {
    // 记录失败只影响下次能否识别版本变化，不影响启动
  }
}

/** 应用启动早期调用一次：算出本轮是否要提示，并记录当前版本 */
export function detectStartupNotice(): void {
  pending = null
  consumed = false
  const current = app.getVersion()
  const previous = readRecordedVersion()
  const launchedByUpdater = process.argv.some((arg) => arg === '--updated')

  if (previous !== current && (launchedByUpdater || previous !== null)) {
    pending = { from: previous, to: current }
  }
  writeRecordedVersion(current)
}

/** 渲染进程取一次（取过即清空，避免多页面之间来回跳转反复弹窗） */
export function takeStartupNotice(): SfStartupNotice | null {
  if (consumed || !pending || Date.now() - startedAt > NOTICE_GRACE_MS) return null
  consumed = true
  const notice = pending
  pending = null
  return notice
}

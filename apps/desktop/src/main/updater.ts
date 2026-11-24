import { appendFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { statfs } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, powerMonitor } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { APP_VERSION_CODE } from './env'
import { getMainWindow } from './window'
import { setQuitting } from './appState'
import {
  evaluateUpdateWindow,
  setUpdateScheduleChangeListener,
  setUpdateScheduleLogger,
} from './updateSchedule'

export type UpdateState =
  | 'idle'
  | 'disabled'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

export interface UpdateStatus {
  state: UpdateState
  version?: string
  percent?: number
  message?: string
}

/** 启动后首次检查的延迟：避开首屏加载抢带宽 */
const FIRST_CHECK_DELAY_MS = 6 * 1000
/** 常驻轮询间隔：5 分钟一次，新版本上线后最多 5 分钟就能被教室机器发现 */
const CHECK_INTERVAL_MS = 5 * 60 * 1000
/** 检查/下载出错后的重试间隔 */
const RETRY_DELAY_MS = 60 * 1000
/** 连续失败超过这个次数就不再主动重试（等下一轮 5 分钟轮询），避免打爆接口 */
const MAX_RETRIES = 5
/** 下载完成后稍等一会再退出安装：给渲染进程落盘与 IPC 收尾的时间 */
const INSTALL_DELAY_MS = 2000
/** 下载进度超过这个时间没有变化就判定卡死，重新下载 */
const STALL_TIMEOUT_MS = 3 * 60 * 1000
/** quitAndInstall 之后进程仍未退出的兜底判定时间 */
const INSTALL_WATCHDOG_MS = 20 * 1000
/** 更新日志文件上限：超过就重建，避免常年累月无限增长 */
const LOG_MAX_BYTES = 512 * 1024
/**
 * 静默安装前要求安装分区至少还有这么多可用空间。
 *
 * NSIS 更新流程是「旧版本先被卸载 → 7z 解压到临时目录 → 复制回 $INSTDIR」，
 * 中间同时占用「安装包 + 解压结果」，实测一个 86MB 的包峰值要 2 倍以上空间。
 * 空间不足时复制阶段反复失败，旧版本已被删而新版本写不进去，
 * 用户看到的就是「更新之后应用消失了」。所以在退出前先拦住这种必然失败的安装。
 */
const MIN_FREE_BYTES = 700 * 1024 * 1024
/** 因磁盘空间不足跳过安装后，隔多久再试一次（只做 statfs，不重新下载） */
const SPACE_RETRY_MS = 15 * 60 * 1000

let status: UpdateStatus = { state: 'idle' }

/**
 * 数字版本号检测（自 v1.2.1 起启用）。
 *
 * 背景：electron-updater 只比较 semver，`latest.yml` 里的 version 与已装版本相同时会直接判「无更新」
 * （见 AppUpdater.isUpdateAvailable：`semver.eq(latestVersion, currentVersion) => false`），
 * 所以「只换安装包、不改显示版本号」的覆盖发布会永远推不下去。
 * 现在打包脚本会往 `latest.yml` 里写自定义字段 `versionCode`（来自 APP_VERSION_CODE），
 * 这里优先按数字版本号比较；文件里没有这个字段（老服务端 / 手工改坏的清单）时退回原来的 semver 比较。
 * isUpdateAvailable 在 electron-updater 的类型声明里标了 private，但运行时是实例方法，可以直接覆盖，
 * 覆盖需要这个结构类型。
 */
interface UpdateAvailabilityChecker {
  isUpdateAvailable: (info: UpdateInfo) => Promise<boolean>
  isUpdateSupported: (info: UpdateInfo) => boolean | Promise<boolean>
  isUserWithinRollout: (info: UpdateInfo) => boolean | Promise<boolean>
}

function readVersionCode(info: UpdateInfo): number | null {
  const raw = (info as UpdateInfo & { versionCode?: unknown }).versionCode
  const parsed =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw.trim(), 10) : Number.NaN
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.trunc(parsed)
}

let intervalTimer: ReturnType<typeof setInterval> | null = null
let firstTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let installTimer: ReturnType<typeof setTimeout> | null = null
let spaceTimer: ReturnType<typeof setTimeout> | null = null
let stallTimer: ReturnType<typeof setTimeout> | null = null
/** 上课时段推迟更新的定时器：到点再检查一次闸门 */
let pauseTimer: ReturnType<typeof setTimeout> | null = null
let statusListener: ((next: UpdateStatus) => void) | null = null

/** 一次性状态标记：防止并发检查、重复下载、重复安装 */
let checking = false
let downloading = false
let installStarted = false
let retries = 0
let currentPercent = -1

let logPath = ''

/** 未知异常的文案提取（strict 模式下 catch 变量是 unknown） */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(err)
}

/**
 * 更新链路的本地日志。
 *
 * 静默更新全程没有界面，出问题只能靠日志排查：把 electron-updater 的事件与错误
 * 追加写到 userData/update.log（超过 512KB 自动重建），
 * 现场机器出问题时直接看这个文件即可。
 */
function ensureLogPath(): string {
  if (logPath) return logPath
  try {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    logPath = join(dir, 'update.log')
    if (existsSync(logPath) && statSync(logPath).size > LOG_MAX_BYTES) rmSync(logPath, { force: true })
  } catch {
    logPath = ''
  }
  return logPath
}

function log(level: 'info' | 'warn' | 'error', message: unknown): void {
  const text = typeof message === 'string' ? message : errorMessage(message)
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${text}\n`
  try {
    const file = ensureLogPath()
    if (file) appendFileSync(file, line)
  } catch {
    // 日志失败不能影响更新本身
  }
  if (level === 'error') console.error('[update]', text)
  else console.log('[update]', text)
}

function push(next: UpdateStatus): void {
  status = next
  log('info', `state=${next.state}${next.version ? ' v' + next.version : ''}${next.percent != null ? ' ' + next.percent + '%' : ''}${next.message ? ' ' + next.message : ''}`)
  const win = getMainWindow()
  if (win && !win.isDestroyed()) win.webContents.send('sf:update:status', next)
  if (statusListener) statusListener(next)
}

/** 托盘菜单需要跟着更新状态刷新文案 */
export function setUpdateStatusListener(fn: ((next: UpdateStatus) => void) | null): void {
  statusListener = fn
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

/**
 * 关闭 electron-updater 内置的 Authenticode 校验。
 *
 * 我们用的是自签名证书（CN=焰火工作室），用户机器没把这个根证书装进「受信任的根证书颁发机构」，
 * Windows 的 Get-AuthenticodeSignature 会返回非 Valid 状态，electron-updater 随即以
 * ERR_UPDATER_INVALID_SIGNATURE 拒绝安装——这正是 1.0.0 → 1.1.0 更新报错的原因。
 * 更新包的完整性由 latest.yml 里的 sha512 + HTTPS 保证，签名只用于标识发布者，
 * 所以这里直接跳过该校验，避免要求每台教室机器都手工导入根证书。
 */
function disableSignatureCheck(): void {
  const updater = autoUpdater as unknown as {
    verifyUpdateCodeSignature?: (publisherNames: string[], file: string) => Promise<string | null>
  }
  updater.verifyUpdateCodeSignature = async () => null
}

/** 下载卡死检测：进度长时间不动就取消重来，不让机器永远停在 43% */
function armStallTimer(): void {
  if (stallTimer) clearTimeout(stallTimer)
  stallTimer = setTimeout(() => {
    stallTimer = null
    if (!downloading) return
    log('warn', `下载进度停在 ${currentPercent}%，重新下载`)
    downloading = false
    push({ state: 'error', message: '下载超时，稍后自动重试', percent: currentPercent })
    void startDownload()
  }, STALL_TIMEOUT_MS)
}

function disarmStallTimer(): void {
  if (stallTimer) {
    clearTimeout(stallTimer)
    stallTimer = null
  }
}

/**
 * 上课时段闸门：把「稍后再更新」挂到一个定时器上。
 *
 * 只有在真正处在上课时段时才推迟；已经下课或没配置课表时什么都不做，
 * 调用方直接走原来的下载 / 安装流程。
 */
function scheduleResume(): void {
  const gate = evaluateUpdateWindow()
  if (!gate.paused || gate.resumeAt == null) return
  if (pauseTimer) clearTimeout(pauseTimer)
  const delay = Math.max(1000, gate.resumeAt - Date.now())
  log('info', `${gate.reason}（约 ${Math.max(1, Math.round(delay / 60000))} 分钟后重试）`)
  pauseTimer = setTimeout(() => {
    pauseTimer = null
    const next = evaluateUpdateWindow()
    if (next.paused) {
      scheduleResume()
      return
    }
    log('info', '下课已满 5 分钟，继续静默更新')
    if (installStarted) return
    if (status.state === 'downloaded' || status.state === 'installing') scheduleInstall(status.version)
    else if (status.state === 'available') void startDownload()
    else void checkForUpdates()
  }, delay)
}

/** 时间表在设置里被改动后重新评估：上课中就继续推迟，已经下课就马上接着更新 */
function onScheduleChanged(): void {
  if (installStarted || downloading) return
  if (pauseTimer) {
    clearTimeout(pauseTimer)
    pauseTimer = null
  }
  if (status.state !== 'available' && status.state !== 'downloaded' && status.state !== 'installing') return
  const gate = evaluateUpdateWindow()
  if (gate.paused) {
    scheduleResume()
    return
  }
  log('info', '作息时间已更新，当前不在上课时段，继续静默更新')
  if (status.state === 'downloaded' || status.state === 'installing') scheduleInstall(status.version)
  else void startDownload()
}

/** 下载闸门：上课时段不下载（不抢教室网络），下课 5 分钟后再来 */
function maybeDownload(version?: string): void {
  if (!app.isPackaged || downloading || installStarted) return
  const gate = evaluateUpdateWindow()
  if (gate.paused) {
    log('info', `已发现新版本，${gate.reason}`)
    push({ state: 'available', version, message: '上课时段，已推迟更新' })
    scheduleResume()
    return
  }
  void startDownload()
}

/** 主动下载（autoDownload 之外再兜一层，某些代理/镜像配置下不会自动触发） */
async function startDownload(): Promise<void> {
  if (!app.isPackaged || downloading || installStarted) return
  downloading = true
  currentPercent = -1
  armStallTimer()
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    downloading = false
    disarmStallTimer()
    push({ state: 'error', message: errorMessage(err) })
    scheduleRetry()
  }
}

/**
 * 下载完成 → 静默安装。
 *
 * quitAndInstall(true, true) 会用 `/S --force-run --updated` 启动 NSIS 安装包：
 * 全程无界面、覆盖原目录、装完自动把应用重新拉起来，所以用户不需要点任何东西。
 */
function scheduleInstall(version?: string): void {
  if (installStarted) return
  const gate = evaluateUpdateWindow()
  if (gate.paused) {
    // 已下载完成也先不装：静默安装会退出并重启应用，上课中途不能打断大屏
    log('info', `安装已推迟：${gate.reason}`)
    push({ state: 'downloaded', version, message: '上课时段，下课后 5 分钟自动安装' })
    scheduleResume()
    return
  }
  installStarted = true
  disarmStallTimer()
  downloading = false
  push({ state: 'installing', version })
  if (installTimer) clearTimeout(installTimer)
  installTimer = setTimeout(() => {
    installTimer = null
    void performInstall(version)
  }, INSTALL_DELAY_MS)
}

/**
 * 安装分区剩余空间检查。
 *
 * 返回 false 时不要调用 quitAndInstall：NSIS 会先删旧版本再解压，
 * 空间不够等于把用户的应用删掉却装不回新版本。
 */
async function hasEnoughDiskSpace(): Promise<{ ok: boolean; freeMb: number; installDir: string }> {
  const installDir = dirname(app.getPath('exe'))
  try {
    const info = await statfs(installDir)
    const freeBytes = Number(info.bavail) * Number(info.bsize)
    return { ok: freeBytes >= MIN_FREE_BYTES, freeMb: Math.round(freeBytes / 1024 / 1024), installDir }
  } catch (err) {
    // 拿不到分区信息就不阻塞更新，只记日志
    log('warn', `读取磁盘剩余空间失败：${errorMessage(err)}`)
    return { ok: true, freeMb: -1, installDir }
  }
}

async function performInstall(version?: string): Promise<void> {
  log('info', `开始静默安装 v${version ?? status.version ?? '?'}`)
  const space = await hasEnoughDiskSpace()
  if (!space.ok) {
    // 保留旧版本不动：只占位等待空间，不重新下载，也不让别的检查把流程打乱
    log('error', `安装分区空间不足：${space.installDir} 仅剩 ${space.freeMb}MB，已取消本次静默安装（需要 700MB）`)
    push({ state: 'error', message: `磁盘剩余空间不足（${space.freeMb}MB），已暂停更新，请清理磁盘`, version })
    if (spaceTimer) clearTimeout(spaceTimer)
    spaceTimer = setTimeout(() => {
      spaceTimer = null
      void performInstall(version)
    }, SPACE_RETRY_MS)
    return
  }
  log('info', `安装分区 ${space.installDir} 剩余 ${space.freeMb}MB，开始静默安装`)
  try {
    // 先标记退出：否则「关闭即收进托盘」的逻辑会把退出拦下来
    setQuitting(true)
    autoUpdater.quitAndInstall(true, true)
  } catch (err) {
    installStarted = false
    setQuitting(false)
    push({ state: 'error', message: errorMessage(err) })
    scheduleRetry()
    return
  }
  // 兜底：万一安装包没能拉起来，进程会在 20 秒后仍存活。此时恢复运行状态，
  // 依靠 autoInstallOnAppQuit 在下次退出时完成安装，避免机器一直「假死」。
  setTimeout(() => {
    if (!app.isReady()) return
    installStarted = false
    setQuitting(false)
    log('error', '安装程序未能启动，改为退出应用时安装')
    push({ state: 'downloaded', version, message: '安装程序未能启动，退出应用时会自动完成安装' })
  }, INSTALL_WATCHDOG_MS)
}

function scheduleRetry(): void {
  if (retryTimer || installStarted) return
  if (retries >= MAX_RETRIES) {
    log('warn', `连续失败 ${retries} 次，等待下一轮常规轮询`)
    return
  }
  retries += 1
  retryTimer = setTimeout(() => {
    retryTimer = null
    void checkForUpdates()
  }, RETRY_DELAY_MS)
}

/** 只在打包后的正式版本启用；开发态没有 app-update.yml，检查会直接报错 */
export function setupAutoUpdate(): void {
  if (!app.isPackaged) {
    status = { state: 'disabled', message: '开发模式不检查更新' }
    return
  }
  disableSignatureCheck()
  setUpdateScheduleLogger((level, message) => log(level, message))
  setUpdateScheduleChangeListener(() => onScheduleChanged())
  // 全静默链路：自动检查 → 自动下载 → 自动静默安装 → 自动重启
  // autoDownload 关掉：改由 maybeDownload() 统一走上课时段闸门后再下载
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.autoRunAppAfterInstall = true
  autoUpdater.disableWebInstaller = true
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = { info: (m) => log('info', m), warn: (m) => log('warn', m), error: (m) => log('error', m), debug: () => undefined }

  // 「有更新吗」这一步改为数字版本号优先（见 readVersionCode 注释）。
  // isUpdateAvailable 在 electron-updater 的类型声明里是 private，但运行时是实例方法，可直接覆盖。
  const updaterInternals = autoUpdater as unknown as UpdateAvailabilityChecker
  const semverIsUpdateAvailable = updaterInternals.isUpdateAvailable.bind(autoUpdater)
  updaterInternals.isUpdateAvailable = async (info: UpdateInfo): Promise<boolean> => {
    const remoteCode = readVersionCode(info)
    if (remoteCode === null) return semverIsUpdateAvailable(info)
    if (remoteCode <= APP_VERSION_CODE) {
      // 数字版本号没涨：交回原来的 semver 判断，避免「漏 bump 数字版本号」时把正常的版本升级也拦掉
      return semverIsUpdateAvailable(info)
    }
    log('info', `数字版本号比较：本机 ${APP_VERSION_CODE}，服务端 ${remoteCode}（显示版本 ${app.getVersion()} → ${info.version}）`)
    // 数字版本号只能判断新旧，系统兼容性与灰度这两道检查仍沿用 electron-updater 的
    if (!(await Promise.resolve(updaterInternals.isUpdateSupported(info)))) return false
    return await Promise.resolve(updaterInternals.isUserWithinRollout(info))
  }

  log('info', `自动更新启动：当前 v${app.getVersion()}，安装目录 ${app.getPath('exe')}`)

  autoUpdater.on('checking-for-update', () => {
    checking = true
    push({ state: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    checking = false
    retries = 0
    push({ state: 'available', version: info.version })
    maybeDownload(info.version)
  })
  autoUpdater.on('update-not-available', (info) => {
    checking = false
    retries = 0
    push({ state: 'not-available', version: info.version })
  })
  autoUpdater.on('download-progress', (p) => {
    currentPercent = Math.round(p.percent)
    armStallTimer()
    push({ state: 'downloading', percent: currentPercent })
  })
  autoUpdater.on('update-downloaded', (info) => {
    push({ state: 'downloaded', version: info.version })
    scheduleInstall(info.version)
  })
  autoUpdater.on('error', (err) => {
    const message = errorMessage(err)
    log('error', message)
    checking = false
    downloading = false
    disarmStallTimer()
    push({ state: 'error', message })
    scheduleRetry()
  })

  // 启动 6 秒后先查一次，之后每 5 分钟轮询
  firstTimer = setTimeout(() => {
    firstTimer = null
    void checkForUpdates()
  }, FIRST_CHECK_DELAY_MS)
  intervalTimer = setInterval(() => {
    void checkForUpdates()
  }, CHECK_INTERVAL_MS)

  // 唤醒/合上盖子打开后立刻补一次：教室机器经常整夜休眠，醒来时正好拿到新版本
  try {
    powerMonitor.on('resume', () => {
      void checkForUpdates()
    })
  } catch {
    // 某些平台不支持 powerMonitor，忽略
  }
}

export function stopAutoUpdate(): void {
  if (firstTimer) clearTimeout(firstTimer)
  if (intervalTimer) clearInterval(intervalTimer)
  if (installTimer) clearTimeout(installTimer)
  if (retryTimer) clearTimeout(retryTimer)
  if (spaceTimer) clearTimeout(spaceTimer)
  if (pauseTimer) clearTimeout(pauseTimer)
  disarmStallTimer()
  firstTimer = null
  intervalTimer = null
  installTimer = null
  retryTimer = null
  spaceTimer = null
  pauseTimer = null
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged || checking || downloading || installStarted) return status
  checking = true
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    checking = false
    push({ state: 'error', message: errorMessage(err) })
    scheduleRetry()
  }
  return status
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  maybeDownload(status.version)
  return status
}

/** 界面上手动点「立即安装」也走静默安装，保持行为一致 */
export function installUpdate(): void {
  if (!app.isPackaged) return
  scheduleInstall(status.version)
}

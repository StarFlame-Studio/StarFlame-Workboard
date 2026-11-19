import { reactive } from 'vue'
import { apiBase, setReachableHook } from '@/lib/api'
import { captureSnapshot, ds, flushPending, isLocalMode, setOfflineActive } from '@/lib/dataSource'
import { countPending, getActiveClassId, hasSnapshot } from '@/lib/localCache'

/** 自动离线模式的持久化键 */
export const OFFLINE_KEY = 'sf.offline.v1'
/** 连通性探测超时（手机弱网首包常需 3～6s，过短会误判离线） */
export const PROBE_TIMEOUT_MS = 8000
/** 定期探测间隔 */
export const PROBE_INTERVAL_MS = 30000
/** 连续多少次探测失败判定「伪在线」 */
export const PROBE_FAIL_THRESHOLD = 2
/** 自动回放最多尝试轮数 */
export const MAX_FLUSH_ATTEMPTS = 5
/** 回放成功提示停留时长 */
const SYNCED_HINT_MS = 3000

export type OfflineStatus = 'online' | 'offline' | 'syncing' | 'synced'

export interface OfflineFlushSummary {
  synced: number
  dropped: number
  failed: number
  remaining: number
  conflicts: number
}

interface OfflineState {
  version: 1
  auto: boolean
  active: boolean
  since: string | null
  lastFlushAt: string | null
  lastFlushResult: OfflineFlushSummary | null
}

/** 供顶栏与设置页直接绑定的离线状态 */
export const offlineUi = reactive({
  status: 'online' as OfflineStatus,
  since: null as string | null,
  attempt: 0,
  syncedCount: 0,
  needsManualRetry: false,
  message: '',
})

type NotifyFn = (text: string, color?: string) => void
type ReloadFn = () => void

let notify: NotifyFn | null = null
let reloadHandler: ReloadFn | null = null
let flushing = false
let flushingStartedAt = 0
/** 回放卡死保护：超过这个时长仍未结束就允许下一轮重新接管 */
const FLUSH_WATCHDOG_MS = 120000
let probeFailures = 0
/**
 * 最近一次「任意接口请求成功」的时间戳。
 * 只要 60s 内有成功的接口返回，就绝不能因为一次探测失败切成离线——
 * 这正是"网络明明正常却显示离线"的根因（探测超时 ≠ 服务不可达）。
 */
let lastReachableAt = 0
/** 成功请求后的离线保护窗口 */
const REACHABLE_GRACE_MS = 60000
let timer: ReturnType<typeof setInterval> | null = null
let hintTimer: ReturnType<typeof setTimeout> | null = null
let recheckTimer: ReturnType<typeof setTimeout> | null = null
let graceTimer: ReturnType<typeof setTimeout> | null = null
let started = false

function emptyState(): OfflineState {
  return { version: 1, auto: true, active: false, since: null, lastFlushAt: null, lastFlushResult: null }
}

function readState(): OfflineState {
  try {
    const raw = localStorage.getItem(OFFLINE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as OfflineState
    if (!parsed || parsed.version !== 1) return emptyState()
    return {
      version: 1,
      auto: parsed.auto !== false,
      active: Boolean(parsed.active),
      since: parsed.since ?? null,
      lastFlushAt: parsed.lastFlushAt ?? null,
      lastFlushResult: parsed.lastFlushResult ?? null,
    }
  } catch {
    return emptyState()
  }
}

function saveState(patch: Partial<OfflineState>): void {
  try {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify({ ...readState(), ...patch }))
  } catch {
    // 容量异常忽略
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function backoff(attempt: number): number {
  const delays = [3000, 9000, 27000, 81000, 243000]
  return delays[Math.min(Math.max(attempt, 1) - 1, delays.length - 1)]
}

function say(text: string, color = 'warning'): void {
  offlineUi.message = text
  if (notify) notify(text, color)
}

/** 注册界面提示回调（顶栏 snackbar） */
export function setOfflineNotify(fn: NotifyFn | null): void {
  notify = fn
}

/** 注册「数据需要重新加载」回调（看板 store.refresh） */
export function setOfflineReloadHandler(fn: ReloadFn | null): void {
  reloadHandler = fn
}

/**
 * 探测服务器是否真的可达。
 * 用 /health：它没有限流（/public/time 是按 IP 限流 60 次/分，手机走运营商 NAT
 * 时同 IP 大量设备会共享配额，被 429 后会被误判成「离线」）。
 * 只要有 HTTP 响应（含 4xx/429）就说明网络与站点都通，只有 5xx 才认为服务不可用。
 */
export async function probeServer(): Promise<boolean> {
  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(apiBase + '/health', {
      cache: 'no-store',
      signal: controller.signal,
    })
    return response.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timerId)
  }
}

/**
 * 任意接口请求成功即视为服务器可达：立即清掉误判的离线态并回放队列。
 * 解决「网络正常但偶发一次探测超时后一直显示离线」的问题。
 */
export function noteServerReachable(): void {
  probeFailures = 0
  lastReachableAt = Date.now()
  if (offlineUi.status === 'syncing' || offlineUi.status === 'synced') return
  if (readState().active) {
    void flushAndRecover()
    return
  }
  if (offlineUi.status === 'offline') {
    offlineUi.status = 'online'
    offlineUi.needsManualRetry = false
  }
}

function reloadData(): void {
  if (reloadHandler) reloadHandler()
}

/** 进入自动离线模式 */
export async function enterOffline(reason = '网络不可用'): Promise<void> {
  if (readState().active) return
  // 保护窗口：最近 60s 内还有接口请求成功，说明网络与服务都可达，
  // 此时把一次探测失败当作离线就是误判（弱网/限流/后台标签页节流都会造成探测超时）。
  if (navigator.onLine && Date.now() - lastReachableAt < REACHABLE_GRACE_MS) return
  const since = new Date().toISOString()
  saveState({ active: true, since })
  setOfflineActive(true)
  offlineUi.status = 'offline'
  offlineUi.since = since
  offlineUi.attempt = 0
  offlineUi.needsManualRetry = false
  probeFailures = 0
  const classId = getActiveClassId()
  if (classId && hasSnapshot(classId)) {
    say('已自动切换到本地缓存模式：' + reason, 'warning')
  } else {
    say('已离线，但本机暂无缓存数据，请联网后首次加载一次', 'error')
  }
  reloadData()
  // 5s 后自动复查一次：网络其实正常时立刻回到在线，不必等 30s 轮询
  if (recheckTimer) clearTimeout(recheckTimer)
  recheckTimer = setTimeout(() => {
    recheckTimer = null
    void tick()
  }, 5000)
}

/** 退出自动离线模式（回到在线） */
function exitOffline(): void {
  saveState({ active: false, since: null })
  setOfflineActive(false)
  offlineUi.since = null
  offlineUi.needsManualRetry = false
  offlineUi.attempt = 0
  if (offlineUi.status === 'offline') offlineUi.status = 'online'
}

/** 回放本地队列；成功清空后回到在线并刷新快照 */
export async function flushAndRecover(): Promise<void> {
  if (flushing) return
  const classId = getActiveClassId()
  if (!classId) {
    // 尚未确定班级（如首屏探测先失败）：直接回到在线，避免离线态卡死
    exitOffline()
    reloadData()
    return
  }
  if (countPending(classId) === 0) {
    exitOffline()
    await captureSnapshot()
    offlineUi.status = 'online'
    reloadData()
    return
  }
  flushing = true
  flushingStartedAt = Date.now()
  offlineUi.status = 'syncing'
  offlineUi.syncedCount = 0
  const summary: OfflineFlushSummary = { synced: 0, dropped: 0, failed: 0, remaining: 0, conflicts: 0 }
  try {
    for (let attempt = 1; attempt <= MAX_FLUSH_ATTEMPTS; attempt += 1) {
      offlineUi.attempt = attempt
      const result = await flushPending({ onlyReady: true })
      summary.synced += result.synced
      summary.dropped += result.dropped
      summary.failed += result.failed
      summary.conflicts += result.conflicts
      summary.remaining = result.remaining
      if (result.remaining === 0) break
      if (!navigator.onLine) break
      await sleep(backoff(attempt))
      if (!navigator.onLine) break
    }
    saveState({ lastFlushAt: new Date().toISOString(), lastFlushResult: summary })
    offlineUi.syncedCount = summary.synced

    if (summary.remaining === 0) {
      exitOffline()
      await captureSnapshot()
      offlineUi.status = 'synced'
      offlineUi.attempt = 0
      const parts: string[] = []
      if (summary.synced > 0) parts.push('已同步 ' + summary.synced + ' 项')
      if (summary.conflicts > 0) parts.push(summary.conflicts + ' 项按本地优先覆盖云端')
      if (summary.dropped > 0) parts.push(summary.dropped + ' 项已失效被丢弃')
      say(parts.length ? parts.join('，') : '网络已恢复', 'success')
      reloadData()
      if (hintTimer) clearTimeout(hintTimer)
      hintTimer = setTimeout(() => {
        if (offlineUi.status === 'synced') offlineUi.status = navigator.onLine ? 'online' : 'offline'
      }, SYNCED_HINT_MS)
      return
    }

    // 仍有条目无法上传：保持离线态，避免云端旧数据覆盖本地
    offlineUi.status = 'offline'
    offlineUi.needsManualRetry = true
    say('仍有 ' + summary.remaining + ' 条改动未能上传，已保留在队列中，可稍后重试', 'warning')
  } finally {
    flushing = false
    flushingStartedAt = 0
  }
}

/** 手动重试（设置页 / 顶栏按钮） */
export async function retryNow(): Promise<void> {
  if (flushing) return
  const ok = await probeServer()
  if (!ok) {
    say('仍无法连接服务器，请稍后重试', 'error')
    return
  }
  await flushAndRecover()
}

async function tick(): Promise<void> {
  // 回放卡死自愈：flushPending 内部若有请求悬挂，flushing 会永久为 true，
  // 导致后续探测与恢复全部被跳过（表现为「一直显示离线」）。
  if (flushing && Date.now() - flushingStartedAt > FLUSH_WATCHDOG_MS) {
    flushing = false
    flushingStartedAt = 0
  }
  if (flushing) return
  const state = readState()
  if (state.active) {
    if (!navigator.onLine) return
    // 已在离线态时不再用探测结论做门槛：探测本身可能因限流/抖动失败，
    // 一旦失败就永远回不到在线。直接尝试回放并回退在线（失败会自动重新进入离线）。
    await flushAndRecover()
    return
  }
  if (isLocalMode()) return
  if (!navigator.onLine) {
    await enterOffline('网络已断开')
    return
  }
  const ok = await probeServer()
  if (ok) {
    probeFailures = 0
    if (offlineUi.status === 'offline') offlineUi.status = 'online'
    return
  }
  probeFailures += 1
  if (probeFailures >= PROBE_FAIL_THRESHOLD) await enterOffline('无法连接服务器')
}

function onOnline(): void {
  probeFailures = 0
  if (graceTimer) {
    clearTimeout(graceTimer)
    graceTimer = null
  }
  void tick()
}

function onOffline(): void {
  if (isLocalMode() && !readState().active) return
  // navigator.onLine 常误报（换网、休眠唤醒、VPN 抖动）：给 1.5s 宽限，再用真实探测确认
  if (graceTimer) clearTimeout(graceTimer)
  graceTimer = setTimeout(() => {
    graceTimer = null
    void (async () => {
      if (await probeServer()) {
        probeFailures = 0
        if (offlineUi.status === 'offline') offlineUi.status = 'online'
        return
      }
      await enterOffline('网络已断开')
    })()
  }, 1500)
}

function onVisible(): void {
  if (document.visibilityState === 'visible') void tick()
}

/** 启动自动离线监听（幂等） */
export function initOffline(): void {
  if (started) return
  started = true
  const state = readState()
  if (state.active) {
    setOfflineActive(true)
    offlineUi.status = 'offline'
    offlineUi.since = state.since
  }
  setReachableHook(() => noteServerReachable())
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)
  timer = setInterval(() => {
    void tick()
  }, PROBE_INTERVAL_MS)
  if (!navigator.onLine) {
    void enterOffline('网络已断开')
  } else if (state.active) {
    // 上次会话留下的离线标记：先探一次，通了就立刻回放并回到在线，
    // 避免「明明有网，一打开就顶着离线芯片」。
    void (async () => {
      if (await probeServer()) {
        await flushAndRecover()
        return
      }
      await tick()
    })()
  } else {
    // 启动时立刻探一次，服务器不通就马上切本地缓存（不等 30s 轮询与失败阈值）
    void bootProbe()
  }
}

/** 启动探测：一次失败即切离线，避免首屏卡在骨架屏 */
async function bootProbe(): Promise<void> {
  if (isLocalMode()) return
  let ok = await probeServer()
  if (!ok) {
    // 移动网络首次握手常有 2～3s 抖动：再等 800ms 重试一次，避免误判为离线
    await sleep(800)
    ok = await probeServer()
  }
  if (!ok) await enterOffline(navigator.onLine ? '无法连接服务器' : '网络已断开')
}

export function stopOffline(): void {
  if (!started) return
  started = false
  setReachableHook(null)
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  document.removeEventListener('visibilitychange', onVisible)
  if (timer) clearInterval(timer)
  timer = null
  if (recheckTimer) clearTimeout(recheckTimer)
  recheckTimer = null
  if (graceTimer) clearTimeout(graceTimer)
  graceTimer = null
}

/** 待同步条数（供界面展示） */
export function pendingCount(): number {
  return ds.pending
}

export { countPending }

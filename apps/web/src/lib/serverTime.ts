import { apiBase } from './api'

/** 默认重新校准间隔（分钟），服务端可通过设置覆盖 */
const DEFAULT_INTERVAL_MIN = 5
const MIN_INTERVAL_MIN = 1
const MAX_INTERVAL_MIN = 60

/** 与服务器时间的差值：本地时钟 + offsetMs = 校准后时间 */
let offsetMs = 0
let synced = false
let started = false
let intervalId: number | undefined
let intervalMin = DEFAULT_INTERVAL_MIN
/** 当前生效的时间源：aliyun / local / custom */
let timeSource: 'aliyun' | 'local' | 'custom' = 'aliyun'
/** 当前看板对应的班级；带上后端才能读到该班级的时间同步设置 */
let classId = ''

interface TimeResponse {
  now?: number
  stale?: boolean
  configuredSource?: 'aliyun' | 'local' | 'custom'
  intervalMin?: number
}

function clampInterval(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return DEFAULT_INTERVAL_MIN
  return Math.min(MAX_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, Math.round(num)))
}

function scheduleTimer(): void {
  if (intervalId) window.clearInterval(intervalId)
  intervalId = window.setInterval(() => void syncOnce(), intervalMin * 60_000)
}

async function syncOnce(): Promise<void> {
  const startedAt = performance.now()
  try {
    const url = classId ? apiBase + '/public/time?classId=' + encodeURIComponent(classId) : apiBase + '/public/time'
    const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!res.ok) return
    const data = (await res.json()) as TimeResponse
    if (typeof data.now !== 'number' || !Number.isFinite(data.now)) return
    const nextInterval = clampInterval(data.intervalMin)
    if (nextInterval !== intervalMin) {
      intervalMin = nextInterval
      if (started) scheduleTimer()
    }
    timeSource = data.configuredSource === 'local' || data.configuredSource === 'custom' ? data.configuredSource : 'aliyun'
    if (timeSource === 'local') {
      // 本地时间源：不校准，直接用设备时钟
      offsetMs = 0
    } else {
      const rtt = performance.now() - startedAt
      // 以请求中点对齐，抵消一半网络往返
      offsetMs = data.now - (Date.now() - rtt / 2)
      if (data.stale) console.warn('[server-time] 服务器时间源已降级为系统时钟')
    }
    synced = true
  } catch {
    // 静默失败，保留上次校准结果
  }
}

function handleVisible(): void {
  if (document.visibilityState === 'visible') void syncOnce()
}

/** 启动同步：立即一次 + 定时 + 页面重新可见时 */
export function startTimeSync(): void {
  if (started) return
  started = true
  void syncOnce()
  scheduleTimer()
  document.addEventListener('visibilitychange', handleVisible)
}

export function stopTimeSync(): void {
  if (!started) return
  started = false
  if (intervalId) window.clearInterval(intervalId)
  intervalId = undefined
  document.removeEventListener('visibilitychange', handleVisible)
}

/** 看板加载到班级后调用；切换班级会立即重新校准 */
export function setTimeSyncClass(id: string): void {
  if (!id || id === classId) return
  classId = id
  if (started) void syncOnce()
}

/** 是否已经成功校准过 */
export function isTimeSynced(): boolean {
  return synced
}

/** 当前生效的时间源 */
export function currentTimeSource(): 'aliyun' | 'local' | 'custom' {
  return timeSource
}

/** 当前自动同步间隔（分钟） */
export function currentSyncIntervalMin(): number {
  return intervalMin
}

/** 校准后的当前毫秒时间戳 */
export function serverNowMs(): number {
  return Date.now() + offsetMs
}

/** 校准后的当前时间 */
export function serverNow(): Date {
  return new Date(serverNowMs())
}

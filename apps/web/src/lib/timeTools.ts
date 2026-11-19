import { reactive, watch } from 'vue'
import { playTone } from './soundPresets'

/** 倒计时 / 秒表的跨页面持久化状态：
 *  用绝对时间戳（endAt / startedAt）记账，所以关闭页面、刷新、切后台后
 *  重新打开时进度仍然是正确的（浏览器没有真正的后台进程，只能这样记账）。 */
export const TIME_TOOLS_KEY = 'sf.timetools.v1'
export const DEFAULT_TIMER_MS = 5 * 60 * 1000

export interface TimerState {
  running: boolean
  /** 是否已开始过（暂停状态也算，用于展示 remaining 而不是输入值） */
  armed: boolean
  endAt: number | null
  remainingMs: number
  durationMs: number
  finishedAt: number | null
}

export interface StopwatchState {
  running: boolean
  startedAt: number | null
  elapsedMs: number
}

export const timeTools = reactive({
  /** 全局心跳，驱动所有时间显示 */
  now: Date.now(),
  timer: {
    running: false,
    armed: false,
    endAt: null,
    remainingMs: DEFAULT_TIMER_MS,
    durationMs: DEFAULT_TIMER_MS,
    finishedAt: null,
  } as TimerState,
  stopwatch: { running: false, startedAt: null, elapsedMs: 0 } as StopwatchState,
})

export function timerRemainingMs(): number {
  const timer = timeTools.timer
  if (timer.running && timer.endAt !== null) return Math.max(0, timer.endAt - timeTools.now)
  return Math.max(0, timer.remainingMs)
}

export function stopwatchElapsedMs(): number {
  const stopwatch = timeTools.stopwatch
  if (stopwatch.running && stopwatch.startedAt !== null) {
    return Math.max(0, stopwatch.elapsedMs + (timeTools.now - stopwatch.startedAt))
  }
  return Math.max(0, stopwatch.elapsedMs)
}

export function startTimer(durationMs?: number): void {
  const timer = timeTools.timer
  if (timer.running) return
  if (typeof durationMs === 'number') {
    const ms = Math.max(0, Math.round(durationMs))
    timer.durationMs = ms
    timer.remainingMs = ms
    timer.armed = true
  }
  if (!timer.armed || timer.remainingMs <= 0) return
  timer.finishedAt = null
  timer.running = true
  timer.endAt = Date.now() + timer.remainingMs
  timeTools.now = Date.now()
}

export function pauseTimer(): void {
  const timer = timeTools.timer
  if (!timer.running) return
  timer.remainingMs = timerRemainingMs()
  timer.running = false
  timer.endAt = null
  timeTools.now = Date.now()
}

export function resetTimer(durationMs = DEFAULT_TIMER_MS): void {
  const timer = timeTools.timer
  const ms = Math.max(0, Math.round(durationMs))
  timer.running = false
  timer.armed = false
  timer.endAt = null
  timer.durationMs = ms
  timer.remainingMs = ms
  timer.finishedAt = null
  timeTools.now = Date.now()
}

export function startStopwatch(): void {
  const stopwatch = timeTools.stopwatch
  if (stopwatch.running) return
  stopwatch.running = true
  stopwatch.startedAt = Date.now()
  timeTools.now = Date.now()
}

export function pauseStopwatch(): void {
  const stopwatch = timeTools.stopwatch
  if (!stopwatch.running) return
  stopwatch.elapsedMs = stopwatchElapsedMs()
  stopwatch.running = false
  stopwatch.startedAt = null
  timeTools.now = Date.now()
}

export function resetStopwatch(): void {
  const stopwatch = timeTools.stopwatch
  stopwatch.running = false
  stopwatch.startedAt = null
  stopwatch.elapsedMs = 0
  timeTools.now = Date.now()
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** mm:ss 或 h:mm:ss */
export function formatClock(ms: number, withCentis = false): string {
  const total = Math.max(0, Math.floor(ms))
  const hours = Math.floor(total / 3600000)
  const minutes = Math.floor((total % 3600000) / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const centis = Math.floor((total % 1000) / 10)
  const base = hours > 0 ? hours + ':' + pad(minutes) + ':' + pad(seconds) : pad(minutes) + ':' + pad(seconds)
  return withCentis ? base + '.' + pad(centis) : base
}

/** 卡片角标用的紧凑格式：不足 1 小时 mm:ss，否则 h:mm */
export function formatBadge(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  if (hours > 0) return hours + ':' + pad(Math.floor((total % 3600) / 60))
  return pad(Math.floor(total / 60)) + ':' + pad(total % 60)
}

// ---------- 持久化 ----------
interface StoredShape {
  v: number
  timer: TimerState
  stopwatch: StopwatchState
}

function save(): void {
  try {
    const payload: StoredShape = {
      v: 1,
      timer: { ...timeTools.timer },
      stopwatch: { ...timeTools.stopwatch },
    }
    localStorage.setItem(TIME_TOOLS_KEY, JSON.stringify(payload))
  } catch {
    // 隐私模式写入失败时忽略
  }
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function load(): void {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(TIME_TOOLS_KEY)
  } catch {
    return
  }
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as Partial<StoredShape>
    const timer = parsed.timer
    if (timer) {
      timeTools.timer.running = Boolean(timer.running)
      timeTools.timer.armed = Boolean(timer.armed)
      timeTools.timer.endAt = typeof timer.endAt === 'number' ? timer.endAt : null
      timeTools.timer.durationMs = num(timer.durationMs, DEFAULT_TIMER_MS)
      timeTools.timer.remainingMs = num(timer.remainingMs, timeTools.timer.durationMs)
      timeTools.timer.finishedAt = typeof timer.finishedAt === 'number' ? timer.finishedAt : null
    }
    const stopwatch = parsed.stopwatch
    if (stopwatch) {
      timeTools.stopwatch.running = Boolean(stopwatch.running)
      timeTools.stopwatch.startedAt = typeof stopwatch.startedAt === 'number' ? stopwatch.startedAt : null
      timeTools.stopwatch.elapsedMs = num(stopwatch.elapsedMs, 0)
    }
  } catch {
    // 数据损坏时按默认值继续
  }
}

/** 计时到点：停止并提示 */
function finishTimer(): void {
  const timer = timeTools.timer
  timer.finishedAt = timer.endAt ?? Date.now()
  timer.running = false
  timer.armed = true
  timer.remainingMs = 0
  timer.endAt = null
  try {
    playTone('ding', 0.8, true)
  } catch {
    // 浏览器可能拦截自动播放
  }
  save()
}

function tick(): void {
  const now = Date.now()
  timeTools.now = now
  if (timeTools.timer.running && timeTools.timer.endAt !== null && timeTools.timer.endAt <= now) {
    finishTimer()
  }
}

load()
// 页面关闭期间到点的倒计时，恢复后立刻判定
if (timeTools.timer.running && timeTools.timer.endAt !== null && timeTools.timer.endAt <= Date.now()) {
  finishTimer()
} else {
  timeTools.now = Date.now()
}

watch(
  () => [timeTools.timer, timeTools.stopwatch],
  () => save(),
  { deep: true },
)

if (typeof window !== 'undefined') {
  window.setInterval(tick, 200)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick()
    else save()
  })
  window.addEventListener('pagehide', save)
}

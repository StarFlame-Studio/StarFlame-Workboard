import { DEVICE_TOKEN_STORAGE_KEY } from '@starflame/shared'
import { postData } from './api'

/**
 * 设备在线心跳。
 *
 * 后台的「在线」判据是「最近 3 分钟内有活动」。之前只有作业看板挂载时发一次心跳，
 * 之后完全依赖 Socket.IO 连接维持在线：一旦实时层断开（休眠唤醒、切换网络、服务端重启、
 * 代理掐断长连接）设备就再也刷不到 last_seen_at，3 分钟后被误判离线，而后台看起来就是
 * 「设备明明还在用却显示离线」。这里改为全站常驻的心跳：
 *   - 页面可见时每 45 秒一次（3 分钟窗口可容忍连续 4 次失败）；
 *   - 页面隐藏（最小化、切到后台标签）时降到 90 秒一次，设备仍在运行就不该被判离线；
 *   - 页面重新可见、网络恢复、窗口获得焦点时立即补一次（节流 15 秒）。
 * 心跳失败一律静默：它只影响后台的展示，不能干扰前台操作。
 */

/** 常规心跳间隔：小于服务端 3 分钟的在线窗口，留足丢包余量 */
const HEARTBEAT_INTERVAL_MS = 45 * 1000
/** 页面被隐藏（最小化、切到后台标签）时的间隔：设备仍在运行，只是不必那么密 */
const HIDDEN_BEAT_INTERVAL_MS = 90 * 1000
/** 事件触发的补发最小间隔，避免可见性/焦点抖动时连发 */
const MIN_TRIGGER_GAP_MS = 15 * 1000

let timer: number | undefined
let lastBeatAt = 0
let inflight = false
let started = false

function currentToken(): string {
  try {
    return localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

async function beat(force: boolean): Promise<void> {
  if (!currentToken()) return
  if (inflight) return
  const now = Date.now()
  if (force && now - lastBeatAt < MIN_TRIGGER_GAP_MS) return
  inflight = true
  lastBeatAt = now
  try {
    await postData('/device/heartbeat')
  } catch {
    // 心跳失败不阻塞界面；下一轮会自动重试
  } finally {
    inflight = false
  }
}

function onVisibilityChange(): void {
  // 页面重新可见立即补一次；隐藏时不停表，只降频（见 tick）
  if (document.hidden) return
  void beat(true)
  startTimer()
}

function onWakeUp(): void {
  if (document.hidden) return
  void beat(true)
  startTimer()
}

function startTimer(): void {
  if (timer !== undefined) return
  timer = window.setInterval(() => {
    // 隐藏状态下浏览器本来就会降频定时器，这里再按隐藏间隔判定一次：
    // 设备只是切到后台/最小化，它仍然在线，不该被 3 分钟窗口判成离线。
    const gap = document.hidden ? HIDDEN_BEAT_INTERVAL_MS : HEARTBEAT_INTERVAL_MS
    if (Date.now() - lastBeatAt < gap) return
    void beat(false)
  }, HEARTBEAT_INTERVAL_MS)
}

function stopTimer(): void {
  if (timer === undefined) return
  window.clearInterval(timer)
  timer = undefined
}

/** 启动全站心跳（幂等；未登录时什么都不做） */
export function startPresence(): void {
  if (started) return
  if (!currentToken()) return
  started = true
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('online', onWakeUp)
  window.addEventListener('focus', onWakeUp)
  void beat(true)
  startTimer()
}

/** 停止心跳（退出登录/卸载页面时调用） */
export function stopPresence(): void {
  if (!started) return
  started = false
  stopTimer()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('online', onWakeUp)
  window.removeEventListener('focus', onWakeUp)
}

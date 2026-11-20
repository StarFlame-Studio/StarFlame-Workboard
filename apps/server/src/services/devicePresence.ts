/**
 * 设备在线状态。
 *
 * 判据有三条，命中任意一条即算在线：
 * 1. 该设备令牌当前持有 Socket.IO 连接（实时层在线，最准）；
 * 2. 最近 DEVICE_ONLINE_WINDOW_MS 内该设备有过任意一次带令牌的接口请求（进程内活动表，
 *    不依赖数据库写入是否跟得上，接口一进来状态立刻变准）；
 * 3. 数据库 last_seen_at 在窗口内（进程重启后内存表为空，用它兜底）。
 *
 * 第 2 条是后加的：以前只靠「socket 在线」或「心跳刷新 last_seen_at」，
 * socket 被代理掐断、休眠唤醒、服务端重启之后设备就不再刷新，3 分钟一过被误判离线。
 *
 * 服务端是 pm2 fork 单进程，内存表即可承担；进程重启后设备的下一次请求会立刻重建。
 */

/** 判定「最近活跃」的时间窗 */
export const DEVICE_ONLINE_WINDOW_MS = 3 * 60 * 1000

/** 同一设备写库节流：接口可能一秒十几个，没必要每次都 UPDATE */
export const DEVICE_PRESENCE_TOUCH_MS = 30 * 1000

/** 内存活动表的清理阈值：超过窗口就没意义了 */
const ACTIVITY_TTL_MS = DEVICE_ONLINE_WINDOW_MS * 2

/** deviceId → 当前活跃 socket 连接数（同一设备可能多开页面） */
const socketCount = new Map<string, number>()

/** deviceId → 最近一次活动时间戳（ms） */
const lastActivity = new Map<string, number>()

/** 定时清理过期活动记录，避免长期运行后内存表无限增长 */
let lastSweep = 0
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [id, at] of lastActivity) {
    if (now - at > ACTIVITY_TTL_MS) lastActivity.delete(id)
  }
}

export function markDeviceSocketOpen(deviceId: string): void {
  socketCount.set(deviceId, (socketCount.get(deviceId) ?? 0) + 1)
  lastActivity.set(deviceId, Date.now())
}

export function markDeviceSocketClosed(deviceId: string): void {
  const next = (socketCount.get(deviceId) ?? 0) - 1
  if (next > 0) socketCount.set(deviceId, next)
  else socketCount.delete(deviceId)
}

export function isDeviceSocketOnline(deviceId: string): boolean {
  return (socketCount.get(deviceId) ?? 0) > 0
}

/**
 * 记录一次设备活动，返回「本次是否应该写库」。
 * 每个带设备令牌的请求都会调用它：内存表立即生效，数据库写入按 30 秒节流。
 */
export function touchDeviceActivity(deviceId: string, now = Date.now()): boolean {
  sweep(now)
  const previous = lastActivity.get(deviceId) ?? 0
  lastActivity.set(deviceId, now)
  return now - previous >= DEVICE_PRESENCE_TOUCH_MS
}

/** 设备被吊销/删除后清掉内存痕迹 */
export function forgetDeviceActivity(deviceId: string): void {
  lastActivity.delete(deviceId)
  socketCount.delete(deviceId)
}

export function isDeviceOnline(deviceId: string, lastSeenAt: Date | null, now = Date.now()): boolean {
  if (isDeviceSocketOnline(deviceId)) return true
  const activity = lastActivity.get(deviceId)
  if (activity !== undefined && now - activity < DEVICE_ONLINE_WINDOW_MS) return true
  if (!lastSeenAt) return false
  return now - lastSeenAt.getTime() < DEVICE_ONLINE_WINDOW_MS
}

/**
 * 内存里记录到的最近一次活动时间。
 * 管理端把它与 last_seen_at 取较新者展示，避免出现「显示在线但最近心跳是十几分钟前」的矛盾。
 */
export function deviceActivityAt(deviceId: string): number | null {
  // 维持着实时连接的设备此刻就在线，直接算作「刚刚活动」，
  // 否则会出现「状态在线但最近心跳是很久以前」的观感矛盾。
  if (isDeviceSocketOnline(deviceId)) return Date.now()
  return lastActivity.get(deviceId) ?? null
}

/** 当前在线设备数（socket 维度，供日志/调试用） */
export function socketOnlineCount(): number {
  return socketCount.size
}

/**
 * 设备在线状态。
 *
 * 判据有两条，命中任意一条即算在线：
 * 1. 该设备令牌当前持有 Socket.IO 连接（实时层在线，最准）；
 * 2. 最近 DEVICE_ONLINE_WINDOW_MS 内有过接口活动（last_seen_at），
 *    用于「只刷新页面、实时层断开」这类情况兜底。
 *
 * 服务端是 pm2 fork 单进程，内存表即可承担；进程重启后设备会自动重连，
 * 重新写入在线表，不会长期失真。
 */

/** 判定「最近活跃」的时间窗：看板每 60 秒刷新一次，3 分钟足够容忍两次丢包 */
export const DEVICE_ONLINE_WINDOW_MS = 3 * 60 * 1000

/** deviceId → 当前活跃 socket 连接数（同一设备可能多开页面） */
const socketCount = new Map<string, number>()

export function markDeviceSocketOpen(deviceId: string): void {
  socketCount.set(deviceId, (socketCount.get(deviceId) ?? 0) + 1)
}

export function markDeviceSocketClosed(deviceId: string): void {
  const next = (socketCount.get(deviceId) ?? 0) - 1
  if (next > 0) socketCount.set(deviceId, next)
  else socketCount.delete(deviceId)
}

export function isDeviceSocketOnline(deviceId: string): boolean {
  return (socketCount.get(deviceId) ?? 0) > 0
}

export function isDeviceOnline(deviceId: string, lastSeenAt: Date | null, now = Date.now()): boolean {
  if (isDeviceSocketOnline(deviceId)) return true
  if (!lastSeenAt) return false
  return now - lastSeenAt.getTime() < DEVICE_ONLINE_WINDOW_MS
}

/** 当前在线设备数（socket 维度，供日志/调试用） */
export function socketOnlineCount(): number {
  return socketCount.size
}

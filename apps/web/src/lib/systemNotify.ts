// 系统通知（浏览器/桌面通知）：通知到达时除了弹窗，还要发一条系统通知
export function systemNoticeSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/** 申请系统通知权限；返回是否已授权 */
export async function ensureNoticePermission(): Promise<boolean> {
  if (!systemNoticeSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch {
    return false
  }
}

/** 发送一条系统通知；未授权时静默跳过 */
export function sendSystemNotice(title: string, body: string, urgent = false): void {
  if (!systemNoticeSupported() || Notification.permission !== 'granted') return
  try {
    const notification = new Notification(title, {
      body,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: 'starflame-notice',
      requireInteraction: urgent,
      silent: false,
    })
    notification.onclick = () => {
      try {
        window.focus()
        notification.close()
      } catch {
        // 忽略
      }
    }
  } catch {
    // 部分环境（如 Android Chrome 非 PWA）不支持构造式通知
  }
}

/**
 * 生成可对外分发的链接时使用的「网页版地址」。
 *
 * 桌面端（Electron）用 app:// 自定义协议加载前端产物，window.location.origin
 * 是 app://local —— 直接拼出来的预配链接（app://local/bind?...）只能在本机
 * 打开，发给别的设备就是死链。所以生成分享链接时必须换成真正的网页域名。
 */
import { apiBase } from './api'

/** 兜底的生产网页地址 */
const FALLBACK_WEB_ORIGIN = 'https://zy.yanhuoyiyou.cn'

/** 本机地址不算可分发的网页地址 */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  )
}

/**
 * 从 API 地址反推网页地址：zyapi.example.com -> zy.example.com，api.example.com -> example.com。
 * 开发环境 apiBase 是相对路径（/api），new URL 会抛错，这里返回 null。
 */
function deriveFromApiBase(): string | null {
  try {
    const url = new URL(apiBase)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    const host = url.hostname
    if (host.startsWith('zyapi.')) return url.protocol + '//zy.' + host.slice('zyapi.'.length)
    if (host.startsWith('api.')) return url.protocol + '//' + host.slice('api.'.length)
    return null
  } catch {
    return null
  }
}

/**
 * 解析网页版根地址（不带结尾斜杠）。
 * 优先级：VITE_WEB_URL 覆盖 > 当前页面地址（http/https 且非本机）> 由 API 域名反推 > 生产兜底。
 */
export function resolveWebOrigin(): string {
  const override = (import.meta.env.VITE_WEB_URL as string | undefined)?.trim()
  if (override) return override.replace(/\/+$/, '')
  if (typeof window !== 'undefined') {
    const { protocol, hostname, origin } = window.location
    if ((protocol === 'http:' || protocol === 'https:') && !isLocalHost(hostname)) return origin
  }
  return deriveFromApiBase() ?? FALLBACK_WEB_ORIGIN
}

/** 拼一个完整的网页地址，path 需以 / 开头 */
export function webUrl(path: string): string {
  const base = resolveWebOrigin()
  if (!path) return base
  return base + (path.startsWith('/') ? path : '/' + path)
}

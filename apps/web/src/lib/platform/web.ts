import type { SfAppInfo, SfUpdateStatus } from './desktop'

/** 网页端实现：无桌面能力，全部降级为浏览器 API 或空操作 */

const CACHE_PREFIX = 'sf.deskcache.'

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export async function writeCache(key: string, value: unknown): Promise<boolean> {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export async function removeCache(key: string): Promise<boolean> {
  try {
    localStorage.removeItem(CACHE_PREFIX + key)
    return true
  } catch {
    return false
  }
}

export async function listCache(): Promise<string[]> {
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k.slice(CACHE_PREFIX.length))
    }
  } catch {
    // 忽略隐私模式下的异常
  }
  return keys
}

export async function appInfo(): Promise<SfAppInfo | null> {
  return null
}

export async function toggleFullscreen(): Promise<boolean> {
  if (document.fullscreenElement) {
    await document.exitFullscreen()
    return false
  }
  await document.documentElement.requestFullscreen()
  return true
}

export async function checkForUpdates(): Promise<SfUpdateStatus | null> {
  return null
}

export async function installUpdate(): Promise<void> {
  // 网页端没有安装动作
}

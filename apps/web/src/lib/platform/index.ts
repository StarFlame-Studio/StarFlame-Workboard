import type { SfUpdateStatus } from './desktop'
import {
  appInfo as webAppInfo,
  checkForUpdates as webCheckForUpdates,
  installUpdate as webInstallUpdate,
  listCache as webListCache,
  readCache as webReadCache,
  removeCache as webRemoveCache,
  toggleFullscreen as webToggleFullscreen,
  writeCache as webWriteCache,
} from './web'
import {
  desktopBridge,
  type SfAppInfo,
  type SfClassPeriod,
  type SfStartupNotice,
  type SfUpdateSchedule,
} from './desktop'

export type { SfAppInfo, SfClassPeriod, SfStartupNotice, SfUpdateSchedule, SfUpdateStatus } from './desktop'

/** 当前运行平台：浏览器 or Electron 桌面端 */
export type PlatformKind = 'web' | 'desktop'

export const platformKind: PlatformKind = desktopBridge ? 'desktop' : 'web'
export const isDesktop = platformKind === 'desktop'

/** 桌面端缓存走主进程文件（userData/cache/<key>.json），网页端走 localStorage 前缀键 */
export function readCache<T>(key: string): Promise<T | null> {
  return desktopBridge ? desktopBridge.cache.read<T>(key) : webReadCache<T>(key)
}

export function writeCache(key: string, value: unknown): Promise<boolean> {
  return desktopBridge ? desktopBridge.cache.write(key, value) : webWriteCache(key, value)
}

export function removeCache(key: string): Promise<boolean> {
  return desktopBridge ? desktopBridge.cache.remove(key) : webRemoveCache(key)
}

export function listCache(): Promise<string[]> {
  return desktopBridge ? desktopBridge.cache.list() : webListCache()
}

/** 刚被静默更新过时返回一次提示（网页端恒为 null） */
export function startupNotice(): Promise<SfStartupNotice | null> {
  return desktopBridge ? desktopBridge.app.startupNotice() : Promise.resolve(null)
}

export function appInfo(): Promise<SfAppInfo | null> {
  return desktopBridge ? desktopBridge.app.info() : webAppInfo()
}

/** 全屏切换：桌面端交给原生窗口，网页端用 Fullscreen API */
export function toggleFullscreen(): Promise<boolean> {
  return desktopBridge ? desktopBridge.window.toggleFullscreen() : webToggleFullscreen()
}

export function checkForUpdates(): Promise<SfUpdateStatus | null> {
  return desktopBridge ? desktopBridge.update.check() : webCheckForUpdates()
}

export function downloadUpdate(): Promise<SfUpdateStatus | null> {
  return desktopBridge ? desktopBridge.update.download() : Promise.resolve(null)
}

export function installUpdate(): Promise<void> {
  return desktopBridge ? desktopBridge.update.install() : webInstallUpdate()
}

export function onUpdateStatus(cb: (status: SfUpdateStatus) => void): () => void {
  return desktopBridge ? desktopBridge.update.onStatus(cb) : () => {}
}

/** 把作息时间表推给桌面主进程；网页端恒为 false（没有静默更新） */
export function setUpdateSchedule(config: SfUpdateSchedule): Promise<boolean> {
  return desktopBridge ? desktopBridge.update.setSchedule(config) : Promise.resolve(false)
}

/** 后台远程卸载桌面端；网页端没有可卸载的安装包，直接返回失败 */
export function uninstallApp(): Promise<{ ok: boolean; message?: string }> {
  return desktopBridge
    ? desktopBridge.app.uninstall()
    : Promise.resolve({ ok: false, message: '网页端不支持远程卸载' })
}

export function openExternal(url: string): void {
  if (desktopBridge) void desktopBridge.app.openExternal(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
}

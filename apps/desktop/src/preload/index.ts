import { contextBridge, ipcRenderer } from 'electron'

/** 暴露给渲染进程的白名单 API：只走 IPC，不放开 Node 能力 */
const api = {
  isDesktop: true as const,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  app: {
    info: () => ipcRenderer.invoke('sf:app:info'),
    startupNotice: () => ipcRenderer.invoke('sf:app:startupNotice'),
    quit: () => ipcRenderer.invoke('sf:app:quit'),
    relaunch: () => ipcRenderer.invoke('sf:app:relaunch'),
    openExternal: (url: string) => ipcRenderer.invoke('sf:app:openExternal', url),
    tray: () => ipcRenderer.invoke('sf:app:tray') as Promise<{ enabled: boolean }>,
    show: () => ipcRenderer.invoke('sf:app:show') as Promise<boolean>,
    autostart: () => ipcRenderer.invoke('sf:app:autostart') as Promise<{ openAtLogin: boolean }>,
    setAutostart: (value: boolean) =>
      ipcRenderer.invoke('sf:app:setAutostart', value) as Promise<{ openAtLogin: boolean }>,
  },
  window: {
    state: () => ipcRenderer.invoke('sf:window:state'),
    toggleFullscreen: () => ipcRenderer.invoke('sf:window:toggleFullscreen'),
    setFullscreen: (value: boolean) => ipcRenderer.invoke('sf:window:setFullscreen', value),
    minimize: () => ipcRenderer.invoke('sf:window:minimize'),
    maximize: () => ipcRenderer.invoke('sf:window:maximize'),
    close: () => ipcRenderer.invoke('sf:window:close'),
  },
  cache: {
    read: (key: string) => ipcRenderer.invoke('sf:cache:read', key),
    write: (key: string, value: unknown) => ipcRenderer.invoke('sf:cache:write', key, value),
    remove: (key: string) => ipcRenderer.invoke('sf:cache:remove', key),
    list: () => ipcRenderer.invoke('sf:cache:list'),
  },
  update: {
    status: () => ipcRenderer.invoke('sf:update:status'),
    check: () => ipcRenderer.invoke('sf:update:check'),
    download: () => ipcRenderer.invoke('sf:update:download'),
    install: () => ipcRenderer.invoke('sf:update:install'),
    setSchedule: (config: unknown) => ipcRenderer.invoke('sf:update:schedule', config) as Promise<boolean>,
    onStatus: (cb: (status: unknown) => void) => {
      const handler = (_e: unknown, status: unknown): void => cb(status)
      ipcRenderer.on('sf:update:status', handler)
      return () => ipcRenderer.removeListener('sf:update:status', handler)
    },
    rollback: (version: string) => ipcRenderer.invoke('sf:update:rollback', version),
    onRollback: (cb: (progress: unknown) => void) => {
      const handler = (_e: unknown, progress: unknown): void => cb(progress)
      ipcRenderer.on('sf:update:rollback', handler)
      return () => ipcRenderer.removeListener('sf:update:rollback', handler)
    },
  },
  print: {
    page: () => ipcRenderer.invoke('sf:print:page'),
  },
}

contextBridge.exposeInMainWorld('sfDesktop', api)

export type SfDesktopApi = typeof api
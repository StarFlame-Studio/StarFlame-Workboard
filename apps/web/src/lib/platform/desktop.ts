/**
 * 桌面端（Electron）桥接类型与实现。
 * 主进程通过 contextBridge 暴露 window.sfDesktop，网页端不存在该对象。
 */
export interface SfUpdateStatus {
  state:
    | 'idle'
    | 'disabled'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'error'
  version?: string
  percent?: number
  message?: string
}

/** 回退版本的下载进度（主进程 sf:update:rollback 事件） */
export interface SfRollbackProgress {
  version: string
  state: 'downloading' | 'launching' | 'done' | 'error'
  percent: number
  received: number
  total: number
  message?: string
}

export interface SfRollbackResult {
  ok: boolean
  message?: string
  file?: string
}

export interface SfAppInfo {
  channel: string
  /** 安装包真实版本（主进程 app.getVersion()） */
  version: string
  /** 编译进主进程的数字版本号（APP_VERSION_CODE），旧版主进程可能没有该字段 */
  versionCode?: number
  electron: string
  chrome: string
  node: string
  packaged: boolean
  locale: string
}

/** 静默更新重启后主进程给出的一次性提示 */
export interface SfStartupNotice {
  /** 更新前版本（无从得知时为 null） */
  from: string | null
  /** 当前版本，即「已更新到」的版本 */
  to: string
}

/** 每天的一节课程：用于「上课时段暂停静默更新」 */
export interface SfClassPeriod {
  name: string
  start: string
  end: string
}

/** 推给桌面主进程的作息时间表（web 端由 updateScheduleSync.ts 组装） */
export interface SfUpdateSchedule {
  /** 总开关，默认开启 */
  pauseDuringClass: boolean
  /** 每天的上学 → 放学整段（某天没配节次时回退） */
  weekly: Record<string, { start: string; end: string } | null>
  /** 每天的上课节次，优先于 weekly */
  periods: Record<string, SfClassPeriod[]>
}

export interface SfDesktopBridge {
  isDesktop: true
  platform: string
  versions: { electron: string; chrome: string; node: string }
  app: {
    info(): Promise<SfAppInfo>
    /** 刚被自动更新过时返回一次提示，否则 null */
    startupNotice(): Promise<SfStartupNotice | null>
    quit(): Promise<void>
    relaunch(): Promise<void>
    /** 后台远程卸载：启动系统卸载程序并退出；返回是否成功发起 */
    uninstall(): Promise<{ ok: boolean; message?: string }>
    openExternal(url: string): Promise<boolean>
  }
  window: {
    state(): Promise<{ maximized: boolean; fullscreen: boolean; focused: boolean }>
    toggleFullscreen(): Promise<boolean>
    setFullscreen(on: boolean): Promise<boolean>
    minimize(): Promise<void>
    maximize(): Promise<void>
    close(): Promise<void>
  }
  cache: {
    read<T>(key: string): Promise<T | null>
    write(key: string, value: unknown): Promise<boolean>
    remove(key: string): Promise<boolean>
    list(): Promise<string[]>
  }
  update: {
    status(): Promise<SfUpdateStatus>
    check(): Promise<SfUpdateStatus>
    download(): Promise<SfUpdateStatus>
    install(): Promise<void>
    /** 上课时段暂停静默更新的时间表 */
    setSchedule(config: SfUpdateSchedule): Promise<boolean>
    onStatus(cb: (status: SfUpdateStatus) => void): () => void
    /** 回退到指定历史版本：下载安装包并启动安装程序 */
    rollback(version: string): Promise<SfRollbackResult>
    onRollback(cb: (progress: SfRollbackProgress) => void): () => void
  }
  print: { page(): Promise<void> }
}

declare global {
  interface Window {
    sfDesktop?: SfDesktopBridge
  }
}

export function getDesktopBridge(): SfDesktopBridge | null {
  return typeof window !== 'undefined' && window.sfDesktop ? window.sfDesktop : null
}

export const desktopBridge = getDesktopBridge()

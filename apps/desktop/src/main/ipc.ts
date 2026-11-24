import { app, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE_DIR } from './paths'
import { APP_VERSION_CODE, CHANNEL } from './env'
import { getMainWindow } from './window'
import { takeStartupNotice } from './startupNotice'
import { checkForUpdates, downloadUpdate, getUpdateStatus, installUpdate } from './updater'
import { rollbackToVersion } from './rollback'
import { registerUpdateScheduleIpc } from './updateSchedule'
import { destroyTray, hasTray, showMainWindow } from './tray'
import { setQuitting } from './appState'
import { uninstallSelf } from './uninstall'

const MAX_CACHE_BYTES = 4 * 1024 * 1024
const EXTRA_HOSTS = ['yanhuoyiyou.cn']

function cacheFile(key: string): string | null {
  if (!/^[\w.@-]{1,80}$/.test(key)) return null
  return join(CACHE_DIR, key + '.json')
}

function canOpenExternal(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    return EXTRA_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h))
  } catch {
    return false
  }
}

function withWindow<T>(fn: (win: NonNullable<ReturnType<typeof getMainWindow>>) => T): T | null {
  const win = getMainWindow()
  if (!win) return null
  return fn(win)
}

export function registerIpcHandlers(): void {
  ipcMain.handle('sf:app:info', () => ({
    channel: CHANNEL,
    // 以安装包内 package.json 的真实版本为准（与版本徽标、更新检查一致）
    version: app.getVersion(),
    versionCode: APP_VERSION_CODE,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    packaged: app.isPackaged,
    locale: app.getLocale(),
  }))

  // 静默更新重启后的「已更新到 x.y.z」提示；取过一次即为 null
  ipcMain.handle('sf:app:startupNotice', () => takeStartupNotice())

  ipcMain.handle('sf:app:quit', () => {
    setQuitting(true)
    app.quit()
    return true
  })

  ipcMain.handle('sf:app:relaunch', () => {
    setQuitting(true)
    app.relaunch()
    app.exit(0)
    return true
  })

  // 托盘常驻：关闭窗口只是隐藏，需要显式退出时走 sf:app:quit
  ipcMain.handle('sf:app:tray', () => ({ enabled: hasTray() }))
  ipcMain.handle('sf:app:show', () => {
    showMainWindow()
    return true
  })
  ipcMain.handle('sf:app:hideTray', () => {
    destroyTray()
    return true
  })

  // 开机自启动：写入当前用户的 Run 项（与安装器里的勾选同一个开关）
  ipcMain.handle('sf:app:autostart', () => {
    try {
      return { openAtLogin: app.getLoginItemSettings().openAtLogin }
    } catch {
      return { openAtLogin: false }
    }
  })
  ipcMain.handle('sf:app:setAutostart', (_e, value: unknown) => {
    const open = value === true
    try {
      app.setLoginItemSettings({ openAtLogin: open, args: ['--autostart'] })
      return { openAtLogin: app.getLoginItemSettings().openAtLogin }
    } catch {
      return { openAtLogin: !open }
    }
  })

  // 后台远程卸载：静默运行卸载程序后退出，网页端不会走到这里
  ipcMain.handle('sf:app:uninstall', () => uninstallSelf())

  ipcMain.handle('sf:app:openExternal', async (_e, url: unknown) => {
    if (typeof url !== 'string' || !canOpenExternal(url)) return false
    await shell.openExternal(url)
    return true
  })

  ipcMain.handle('sf:window:state', () =>
    withWindow((win) => ({ fullscreen: win.isFullScreen(), maximized: win.isMaximized() })),
  )

  ipcMain.handle('sf:window:toggleFullscreen', () =>
    withWindow((win) => {
      win.setFullScreen(!win.isFullScreen())
      return win.isFullScreen()
    }),
  )

  ipcMain.handle('sf:window:setFullscreen', (_e, value: unknown) =>
    withWindow((win) => {
      win.setFullScreen(value === true)
      return win.isFullScreen()
    }),
  )

  ipcMain.handle('sf:window:minimize', () => withWindow((win) => { win.minimize(); return true }))
  ipcMain.handle('sf:window:maximize', () =>
    withWindow((win) => {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
      return win.isMaximized()
    }),
  )
  ipcMain.handle('sf:window:close', () =>
    withWindow((win) => {
      // 有托盘时关闭 = 收进托盘；没有托盘（极端情况）才真正关闭
      if (hasTray()) {
        win.hide()
        return true
      }
      setQuitting(true)
      win.close()
      return true
    }),
  )

  ipcMain.handle('sf:cache:read', (_e, key: unknown) => {
    if (typeof key !== 'string') return null
    const file = cacheFile(key)
    if (!file || !existsSync(file)) return null
    try {
      return JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      return null
    }
  })

  ipcMain.handle('sf:cache:write', (_e, key: unknown, value: unknown) => {
    if (typeof key !== 'string') return false
    const file = cacheFile(key)
    if (!file) return false
    try {
      const text = JSON.stringify(value)
      if (text.length > MAX_CACHE_BYTES) return false
      mkdirSync(CACHE_DIR, { recursive: true })
      writeFileSync(file, text, 'utf8')
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('sf:cache:remove', (_e, key: unknown) => {
    if (typeof key !== 'string') return false
    const file = cacheFile(key)
    if (!file) return false
    try {
      rmSync(file, { force: true })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('sf:cache:list', () => {
    try {
      if (!existsSync(CACHE_DIR)) return []
      return readdirSync(CACHE_DIR).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5))
    } catch {
      return []
    }
  })

  ipcMain.handle('sf:print:page', () => withWindow((win) => { win.webContents.print({}); return true }))

  // 渲染进程推送作息时间表（上课时段暂停静默更新）
  registerUpdateScheduleIpc()

  ipcMain.handle('sf:update:status', () => getUpdateStatus())
  ipcMain.handle('sf:update:check', () => checkForUpdates())
  ipcMain.handle('sf:update:download', () => downloadUpdate())
  ipcMain.handle('sf:update:install', () => { installUpdate(); return true })
  // 历史版本回退：下载对应通道的旧安装包并启动它（仅打包后的正式版本可用）
  ipcMain.handle('sf:update:rollback', (_e, version: unknown) =>
    typeof version === 'string' ? rollbackToVersion(version) : { ok: false, message: '版本号无效' },
  )
}
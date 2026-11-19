import { app, Menu, Tray } from 'electron'
import { ICON_PATH } from './paths'
import { createMainWindow, getMainWindow } from './window'
import { setQuitting } from './appState'
import { checkForUpdates, downloadUpdate, getUpdateStatus, installUpdate, setUpdateStatusListener } from './updater'

let tray: Tray | null = null

/** 显示并聚焦主窗口（托盘单击、二次启动、开机自启都会走这里） */
export function showMainWindow(): void {
  const win = getMainWindow()
  if (!win) {
    void createMainWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

function quitApp(): void {
  setQuitting(true)
  app.quit()
}

function buildMenu(): Menu {
  const status = getUpdateStatus()
  const updateLabel =
    status.state === 'downloading'
      ? '正在下载更新 ' + String(status.percent ?? 0) + '%'
      : status.state === 'downloaded'
        ? '重启并安装更新'
        : status.state === 'available'
          ? '发现新版本 v' + String(status.version ?? '')
          : '检查更新'

  return Menu.buildFromTemplate([
    { label: '打开星焰作业板', click: () => showMainWindow() },
    { type: 'separator' },
    {
      label: updateLabel,
      enabled: status.state !== 'downloading' && status.state !== 'checking',
      click: () => {
        if (status.state === 'downloaded') {
          setQuitting(true)
          installUpdate()
          return
        }
        if (status.state === 'available') {
          void downloadUpdate()
          return
        }
        void checkForUpdates()
      },
    },
    { label: '退出', click: () => quitApp() },
  ])
}

export function refreshTrayMenu(): void {
  if (!tray || tray.isDestroyed()) return
  tray.setContextMenu(buildMenu())
  const status = getUpdateStatus()
  tray.setToolTip(status.state === 'available' ? '星焰作业板 · 有新版本' : '星焰作业板')
}

export function hasTray(): boolean {
  return Boolean(tray && !tray.isDestroyed())
}

export function createTray(): Tray {
  if (tray && !tray.isDestroyed()) return tray
  tray = new Tray(ICON_PATH)
  tray.setToolTip('星焰作业板')
  tray.setContextMenu(buildMenu())
  // Windows 习惯：单击托盘图标直接回到看板
  tray.on('click', () => showMainWindow())
  tray.on('double-click', () => showMainWindow())
  // 更新状态变化时刷新菜单文案与提示
  setUpdateStatusListener(() => refreshTrayMenu())
  return tray
}

export function destroyTray(): void {
  if (!tray || tray.isDestroyed()) return
  tray.destroy()
  tray = null
}
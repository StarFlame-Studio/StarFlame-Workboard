import { app, BrowserWindow, protocol, shell } from 'electron'
import { createMainWindow } from './window'
import { registerAppProtocol } from './protocol'
import { registerIpcHandlers } from './ipc'
import { detectStartupNotice } from './startupNotice'
import { setupAutoUpdate } from './updater'
import { loadUpdateSchedule } from './updateSchedule'
import { runDevCapture } from './devcapture'
import { createTray, destroyTray, showMainWindow } from './tray'
import { setQuitting } from './appState'

const APP_USER_MODEL_ID = 'cn.yanhuoyiyou.starflame.workboard'

// 必须在 app ready 之前声明：standard + secure 才能像 https 一样使用 fetch/相对路径
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
])

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.setAppUserModelId(APP_USER_MODEL_ID)

  app.on('second-instance', () => {
    // 窗口可能已被收进托盘（hide 而非销毁），统一走 showMainWindow
    showMainWindow()
  })

  app.on('web-contents-created', (_event, contents) => {
    // 站外链接一律交给系统浏览器，绝不在应用内开新窗口
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (url.startsWith('app://')) return
      event.preventDefault()
      if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
    })
  })

  app.whenReady().then(async () => {
    registerAppProtocol()
    // 必须先算好「上一次是不是刚被自动更新过」，再建窗口给渲染进程取
    detectStartupNotice()
    registerIpcHandlers()
    const win = await createMainWindow()
    createTray()
    // 先读上次落盘的作息表，更新器启动后闸门立即生效
    loadUpdateSchedule()
    setupAutoUpdate()
    if (!app.isPackaged) void runDevCapture(win)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createMainWindow()
    })
  })

  // 关掉前台窗口后常驻托盘继续运行（大屏看板需要长时间挂着）；
  // 只有在托盘菜单「退出」或更新安装时 setQuitting 才真正结束进程。
  app.on('window-all-closed', () => {
    // 托盘还在就等于应用还在跑，这里什么都不做（退出统一走托盘菜单）
  })

  app.on('before-quit', () => {
    setQuitting(true)
    destroyTray()
  })
}
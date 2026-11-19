import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { APP_ENTRY_URL } from './protocol'

/**
 * 仅开发/验证用：SF_TOKEN 注入登录态，SF_SHOT 截图后退出。
 * 打包环境下永远不会执行（调用方用 app.isPackaged 拦住）。
 */
export async function runDevCapture(win: BrowserWindow): Promise<void> {
  win.webContents.on('console-message', (_event, level, message) => {
    console.log('[page:' + String(level) + '] ' + message)
  })
  win.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.warn('[devcapture] did-fail-load ' + code + ' ' + desc + ' ' + url)
  })

  const token = process.env.SF_TOKEN
  if (token) {
    const parts = ["localStorage.setItem('sf.deviceToken', " + JSON.stringify(token) + ')']
    if (process.env.SF_THEME) parts.push("localStorage.setItem('sf.themeMode', " + JSON.stringify(process.env.SF_THEME) + ')')
    if (process.env.SF_LAYOUT) parts.push("localStorage.setItem('sf.boardLayout', " + JSON.stringify(process.env.SF_LAYOUT) + ')')
    if (process.env.SF_SETTINGS) parts.push("localStorage.setItem('sf.settingsOpen', '1')")
    try {
      await win.webContents.executeJavaScript(parts.join(';') + ';true')
    } catch (err) {
      console.warn('[devcapture] 注入登录态失败', err)
    }
    // 注入后重新进入看板页（首次加载可能已被重定向到 welcome）
    const route = process.env.SF_ROUTE
    const target = route ? APP_ENTRY_URL.replace('index.html', route.replace(/^\//, '') + '.html') : APP_ENTRY_URL
    await win.loadURL(target).catch((err: unknown) => {
      console.warn('[devcapture] 重载被中断：', err instanceof Error ? err.message : err)
    })
    await new Promise((resolve) => setTimeout(resolve, 7000))

    // SF_SCROLL=bottom：把设置页主区滚到底，便于截到卡片下半部分
    if (process.env.SF_SCROLL === 'bottom') {
      try {
        await win.webContents.executeJavaScript(
          "(() => { const el = document.querySelector('.v-main .v-container') || document.querySelector('.v-main'); if (el) el.scrollTop = el.scrollHeight; window.scrollTo(0, document.body.scrollHeight); return true })()",
        )
        await new Promise((resolve) => setTimeout(resolve, 800))
      } catch (err) {
        console.warn('[devcapture] 滚动失败', err)
      }
    }

    // SF_CLICK：按文本点击一个元素（如设置页左侧抽屉里的「关于」），便于截到具体分页
    const clickText = process.env.SF_CLICK
    if (clickText) {
      try {
        const ok = await win.webContents.executeJavaScript(
          "(() => { const el = [...document.querySelectorAll('.v-list-item, .v-tab, button')].find((e) => e.textContent && e.textContent.trim() === " +
            JSON.stringify(clickText) +
            "); if (!el) return false; el.click(); return true })()",
        )
        console.log('[devcapture] click ' + clickText + ' → ' + String(ok))
        await new Promise((resolve) => setTimeout(resolve, 1500))
      } catch (err) {
        console.warn('[devcapture] 点击失败', err)
      }
    }
  }

  const shot = process.env.SF_SHOT
  if (shot) {
    try {
      const image = await win.webContents.capturePage()
      writeFileSync(shot, image.toPNG())
      console.log('[devcapture] saved ' + shot)
    } catch (err) {
      console.error('[devcapture] failed', err)
    }
    app.quit()
  }
}

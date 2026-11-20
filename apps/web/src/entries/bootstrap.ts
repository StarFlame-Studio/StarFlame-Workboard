import { createApp, h, type Component } from 'vue'
import { createPinia } from 'pinia'
import { VApp } from 'vuetify/components'
import vuetify from '@/plugins/vuetify'
import { initDesktopScale } from '@/lib/uiScale'
import { initDeviceMode } from '@/lib/deviceMode'
import { setUnauthorizedHandler } from '@/lib/api'
import { ROUTES } from '@/lib/nav'
import { applyStoredTheme } from '@/lib/theme'
import VersionBadge from '@/components/VersionBadge.vue'
import UpdateNoticeDialog from '@/components/UpdateNoticeDialog.vue'
import UpdateProgressDialog from '@/components/UpdateProgressDialog.vue'
import { initDataSource } from '@/lib/dataSource'
import { initOffline } from '@/lib/offline'
import { startPresence } from '@/lib/presence'
import { connectRealtime } from '@/lib/realtime'
import { startDeviceCommands } from '@/lib/deviceCommands'
import '@/styles/mdi-subset.css'
import '@/styles/main.scss'

initDesktopScale()
// 设备模式检测要在缩放之后：它用「未缩放逻辑宽度」判断手机/桌面
initDeviceMode()

/**
 * 白屏兜底：脚本报错或组件挂载抛异常时，#app 会留空，用户只看到一片空白。
 * 这里监听首屏错误并渲染一张「重新加载」卡片，同时避免错误被静默吞掉。
 */
function installBootErrorGuard(): void {
  const renderFallback = (detail: string): void => {
    const host = document.getElementById('app')
    if (!host || host.childElementCount > 0) return
    host.innerHTML =
      '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:16px;padding:24px;text-align:center;' +
      'font-family:\'Microsoft YaHei\',\'PingFang SC\',system-ui,sans-serif;color:#F7F6F4;background:#16130F">' +
      '<div style="font-size:20px;font-weight:700;letter-spacing:.04em">页面加载出错</div>' +
      '<div style="max-width:520px;font-size:13px;line-height:1.8;color:#B8AFA6">' +
      detail.replace(/</g, '&lt;') +
      '</div>' +
      '<button onclick="location.reload()" style="padding:10px 26px;border-radius:999px;border:0;cursor:pointer;' +
      'background:linear-gradient(135deg,#E2683C,#F0A44B);color:#16130F;font-weight:700;font-size:14px">' +
      '重新加载</button></div>'
  }

  window.addEventListener('error', (event) => {
    const message = event.error instanceof Error ? event.error.message : String(event.message || '')
    if (message) renderFallback(message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    renderFallback(reason instanceof Error ? reason.message : String(reason || ''))
  })
}

export function mountPage(PageComponent: Component, options?: { public?: boolean; versionBadge?: boolean }): void {
  const app = createApp({
    // 版本号徽标只在首页显示（首页入口传 versionBadge: true），其他页面不再挂它
    // UpdateNoticeDialog 只在桌面端且刚被自动更新过时弹一次
    render: () =>
      h(VApp, null, {
        default: () => [
          h(PageComponent),
          ...(options?.versionBadge ? [h(VersionBadge)] : []),
          h(UpdateNoticeDialog),
          h(UpdateProgressDialog),
        ],
      }),
  })
  app.use(createPinia())
  app.use(vuetify)

  // 令牌失效时跳到绑定页（多页面下不再用 hash 路由）
  setUnauthorizedHandler(() => {
    const localMode = localStorage.getItem('sf.datasource.mode') === 'local'
    localStorage.removeItem('sf.deviceToken')
    // 本地模式本来就没有登录：某个接口 401 不应该把用户踢回欢迎页
    if (localMode) return
    const current = window.location.pathname
    if (current !== ROUTES.welcome && current !== ROUTES.bind) {
      window.location.href = ROUTES.welcome
    }
  })

  // 非公开页面：无设备令牌时先进入欢迎页，由用户选择绑定或恢复
  // 手动本地模式（免登录）直接放行：即使本机还没有任何缓存，也能先生成空白看板使用
  const localReady = localStorage.getItem('sf.datasource.mode') === 'local'
  if (!options?.public && !localStorage.getItem('sf.deviceToken') && !localReady) {
    window.location.replace(ROUTES.welcome)
    return
  }

  installBootErrorGuard()

  // 挂载前先套用上次的主题，避免闪一帧默认色
  applyStoredTheme()
  // 数据源与离线模块失败不能连累整页：任何一个抛异常都会让 #app 保持空白
  try {
    initDataSource()
  } catch (err) {
    console.error('[boot] 数据源初始化失败：', err)
  }
  try {
    // 非公开页面启用断网自动切换到本地缓存
    if (!options?.public) initOffline()
  } catch (err) {
    console.error('[boot] 离线模块初始化失败：', err)
  }

  app.mount('#app')

  // 全站常驻心跳：后台的「在线」判据是最近 3 分钟内有活动，
  // 只靠看板页挂载时发一次会让休眠/切网/重连后的设备长期显示离线
  if (!options?.public) {
    try {
      startPresence()
    } catch (err) {
      console.error('[boot] 心跳启动失败：', err)
    }
    // 后台远程指令（如卸载）走实时连接下发，任何页面都要能收到：
    // 之前只有看板页建立连接，停在设置页/花名册时就收不到指令
    try {
      startDeviceCommands()
      connectRealtime()
    } catch (err) {
      console.error('[boot] 实时连接启动失败：', err)
    }
  }
}

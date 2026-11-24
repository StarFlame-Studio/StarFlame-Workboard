import { createApp, h, type Component } from 'vue'
import { createPinia } from 'pinia'
import { ACCESS_TOKEN_STORAGE_KEY } from '@starflame/shared'
import vuetify from '@/plugins/vuetify'
import { setLogoutHandler } from '@/lib/api'
import AdminShell from '@/layouts/AdminShell.vue'
import '@/styles/mdi-subset.css'
import '@/style.css'

const LOGIN_PAGE = '/login'

function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
  localStorage.removeItem('sf.refreshToken')
}

function hasToken(): boolean {
  return Boolean(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY))
}

function installLogoutHandler(): void {
  setLogoutHandler(() => {
    clearTokens()
    if (!window.location.pathname.startsWith(LOGIN_PAGE)) {
      window.location.replace(LOGIN_PAGE)
    }
  })
}

/**
 * 挂载一个后台页面（多页面站点：每个 HTML 对应一次独立启动）
 * 未登录直接跳登录页，不做前端路由拦截。
 */
const ADMIN_ONLY_ROLES = ['owner', 'admin']
const OWNER_ONLY_PAGES = ['users', 'audit']
const TEACHER_PAGES = ['classes']

export function mountAdminPage(page: Component, active: string, title: string): void {
  if (!hasToken()) {
    window.location.replace(LOGIN_PAGE)
    return
  }
  // 页面级准入：教师只能进班级页；用户与审计只有超级管理员能进；其余管理页 owner/admin 可用
  const cachedRole = localStorage.getItem('sf.userRole') ?? ''
  if (cachedRole !== '') {
    if (cachedRole === 'teacher' && !TEACHER_PAGES.includes(active)) {
      window.location.replace('/classes')
      return
    }
    if (OWNER_ONLY_PAGES.includes(active) && cachedRole !== 'owner') {
      window.location.replace(ADMIN_ONLY_ROLES.includes(cachedRole) ? '/' : '/classes')
      return
    }
  }
  document.title = '星焰作业板 · ' + title + ' · 管理后台'
  installLogoutHandler()
  const app = createApp({
    name: 'AdminPageRoot',
    render: () => h(AdminShell, { active }, { default: () => h(page) }),
  })
  app.use(createPinia())
  app.use(vuetify)
  app.mount('#app')
}

/** 挂载登录页：已登录则直接回概览 */
export function mountLoginPage(page: Component): void {
  if (hasToken()) {
    window.location.replace('/')
    return
  }
  document.title = '登录 · 星焰作业板管理后台'
  installLogoutHandler()
  const app = createApp(page)
  app.use(createPinia())
  app.use(vuetify)
  app.mount('#app')
}

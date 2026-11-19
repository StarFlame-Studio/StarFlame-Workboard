// 多页面导航：每个页面是独立入口，使用无 .html 后缀的地址（由 Nginx 重写）
export const ROUTES = {
  board: '/',
  welcome: '/welcome',
  bind: '/bind',
  settings: '/settings',
  list: '/list',
  exams: '/exams',
  templates: '/templates',
} as const

export type PageName = keyof typeof ROUTES

export function navigate(page: PageName): void {
  window.location.href = ROUTES[page]
}

export function navigateWithQuery(page: PageName, query: Record<string, string>): void {
  const params = new URLSearchParams(query)
  const base = ROUTES[page]
  window.location.href = base + (base.includes('?') ? '&' : '?') + params.toString()
}

export function back(): void {
  if (window.history.length > 1) window.history.back()
  else window.location.href = ROUTES.board
}

/**
 * 桌面端整体放大（前端网站 ≥960px 逻辑宽度时全站 zoom 1.15）。
 *
 * 为什么不用媒体查询：zoom 会改变 CSS 视口宽度，`@media (min-width: 960px)`
 * 与 zoom 互相影响，在 960–1104px 区间会来回切换。这里先用当前的缩放倍率
 * 把 innerWidth 还原成「未缩放的物理宽度」再判断，判断结果与是否已缩放无关，
 * 因此是稳定的；只有状态真正变化时才写 class 并派发一次 resize，让依赖
 * window.innerWidth 的组件（看板 isMobile、Vuetify useDisplay）重新计算。
 */
const DESKTOP_MIN_WIDTH = 960
const SCALE = 1.15
const CLASS = 'ui-scale-desktop'

let applied = false
let bound = false

function logicalWidth(): number {
  return window.innerWidth * (applied ? SCALE : 1)
}

/** 当前「未缩放的逻辑宽度」，供设备模式检测使用（zoom 会让 innerWidth 变小） */
export function logicalViewportWidth(): number {
  return logicalWidth()
}

export function applyDesktopScale(): void {
  const next = logicalWidth() >= DESKTOP_MIN_WIDTH
  if (next === applied) return
  applied = next
  document.documentElement.classList.toggle(CLASS, applied)
  window.dispatchEvent(new Event('resize'))
}

export function initDesktopScale(): void {
  applied = document.documentElement.classList.contains(CLASS)
  applyDesktopScale()
  if (bound) return
  bound = true
  window.addEventListener('resize', applyDesktopScale, { passive: true })
  window.addEventListener('orientationchange', applyDesktopScale, { passive: true })
}

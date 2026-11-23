/**
 * 液态玻璃的滚动降级。
 *
 * 为什么需要它：折射层的开销来自 `backdrop-filter: url(#…)` —— 浏览器必须为这块区域
 * 重新采样它背后的整片背景，再跑一遍 SVG 滤镜（3 次位移 + 2 次混合）。
 * 静止时一帧只算一次，滚动时每帧都要重算一遍，实测滚动帧率会掉到个位数，
 * 而这恰恰是用户最敏感的场景（滑一下整个看板都在抖）。
 *
 * 做法：只要页面（含内部滚动容器）在滚动，就给 <html> 挂上 `ct-glass-scrolling`，
 * 让折射层的 backdrop-filter 临时失效 —— 卡片仍然有霜层底色、135° 高光、描边和投影，
 * 看起来还是玻璃，只是运动过程中少了背景折射（滚动时也看不清那点折射）；
 * 停下 160ms 后自动恢复。
 *
 * 监听用 capture: true：scroll 事件不冒泡，但捕获阶段能从内层滚动容器收到。
 */
const CLASS = 'ct-glass-scrolling'
const IDLE_MS = 160

let installed = false
let idleTimer = 0
let rafId = 0

function clearScrolling(): void {
  window.clearTimeout(idleTimer)
  idleTimer = 0
  document.documentElement.classList.remove(CLASS)
}

function onScroll(): void {
  if (rafId) return
  rafId = window.requestAnimationFrame(() => {
    rafId = 0
    const root = document.documentElement
    if (!root.classList.contains(CLASS)) root.classList.add(CLASS)
    window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(clearScrolling, IDLE_MS)
  })
}

/** 主题切到液态玻璃时开始监听（重复调用无副作用） */
export function startGlassScrollDegrade(): void {
  if (installed) return
  installed = true
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })
}

/** 主题离开液态玻璃 / 页面卸载时停止监听并清掉类名 */
export function stopGlassScrollDegrade(): void {
  if (!installed) return
  installed = false
  window.removeEventListener('scroll', onScroll, { capture: true })
  if (rafId) {
    window.cancelAnimationFrame(rafId)
    rafId = 0
  }
  clearScrolling()
}

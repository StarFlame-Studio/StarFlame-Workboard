/**
 * 共享的 IntersectionObserver / ResizeObserver。
 *
 * 液态玻璃一屏十几张卡片，每个 <LiquidGlass> 与 <GlassSurface> 原来各自 new 一个
 * IntersectionObserver / ResizeObserver：十几份观察器做的是同一件事，浏览器每次
 * 布局或滚动都要逐个分发。这里改成模块级单例（IntersectionObserver 按 rootMargin
 * 分桶），用 target → 回调的 Map 分发，行为与「每个实例各建一个」完全一致。
 */

type VisibilityCallback = (visible: boolean) => void

const visibilityObservers = new Map<string, IntersectionObserver>()
const visibilityCallbacks = new Map<Element, VisibilityCallback>()

/** 观察元素是否进入（或接近）视口；不支持 IntersectionObserver 时直接当作可见 */
export function observeVisibility(el: Element, callback: VisibilityCallback, rootMargin = '0px'): void {
  if (typeof IntersectionObserver === 'undefined') {
    callback(true)
    return
  }
  let observer = visibilityObservers.get(rootMargin)
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const notify = visibilityCallbacks.get(entry.target)
          if (notify) notify(entry.isIntersecting)
        }
      },
      { rootMargin },
    )
    visibilityObservers.set(rootMargin, observer)
  }
  visibilityCallbacks.set(el, callback)
  observer.observe(el)
}

export function unobserveVisibility(el: Element): void {
  visibilityCallbacks.delete(el)
  for (const observer of visibilityObservers.values()) observer.unobserve(el)
}

type ResizeCallback = () => void

let resizeObserver: ResizeObserver | null = null
const resizeCallbacks = new Map<Element, ResizeCallback>()

export function observeResize(el: Element, callback: ResizeCallback): void {
  if (typeof ResizeObserver === 'undefined') return
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const notify = resizeCallbacks.get(entry.target)
        if (notify) notify()
      }
    })
  }
  resizeCallbacks.set(el, callback)
  resizeObserver.observe(el)
}

export function unobserveResize(el: Element): void {
  resizeCallbacks.delete(el)
  resizeObserver?.unobserve(el)
}

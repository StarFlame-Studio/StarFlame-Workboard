/**
 * 共享的 IntersectionObserver / ResizeObserver。
 *
 * 多张卡片共用观察器，通过目标元素分发回调。IntersectionObserver 按 rootMargin 复用。
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

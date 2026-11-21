import { cardThemeSetting } from './cardTheme'
import { backgroundSetting } from './settingsCompat'

/**
 * 液态玻璃的「环形透镜」。
 *
 * 设计（按需求）：
 *   1. 透镜带宽与包边接近、稍微宽一点点（卡片 4px / 胶囊 3px，用 --lg-lens 控制）；
 *   2. 以卡片中心为原点，向 12 个等分方向（每 30°）打到卡片边界，
 *      取**玻璃边界处**（即环带内缘，比外边界缩进 --lg-lens）的背景色 —— 这样环带的颜色
 *      就是中央玻璃那一圈背景的颜色，两边接得上；
 *   3. 用 conic-gradient 把这 12 个颜色铺在环带上 —— 每个颜色向两侧延伸，
 *      在相邻两者的中点处自然相接（相当于「遇到相邻的拉伸就停止」）。
 *
 * 颜色怎么来的：把背景图缩成一张 96px 宽的小图缓存成 ImageData，
 * 之后对每张卡片只做 6 次数组取色（O(1)，不需要 canvas 逐帧绘制）。
 *
 * 跨域限制：若背景图不允许被绘制到 canvas（getImageData 抛错），只是取不到这 6 个颜色，
 * 环带底层是 backdrop-filter 的真实背景，视觉上仍然成立（只是没有"沿边缘拉丝"的颜色）。
 */

/** 与 BoardPage 里 .bg-image 的 transform: scale(1.05) 保持一致 */
const PAGE_SCALE = 1.05
/** 缓存小图的宽度（越大取色越准，96 足够） */
const SAMPLE_WIDTH = 96
/** 环带取色的 12 个方向：从正上方开始顺时针每 30° 一个，与 conic-gradient 的 12 个色标一一对应 */
const EDGE_ANGLES = Array.from({ length: 12 }, (_, index) => index * 30)

const SURFACE_SELECTOR = [
  '.grid-item > .v-card',
  '.empty-subject-card',
  '.wall-card',
  '.time-card',
  '.hitokoto-card',
  '.home-actions .act',
  '.empty-buttons .empty-btn',
].join(', ')

interface NaturalSize {
  url: string
  width: number
  height: number
}

interface Mapping {
  left: number
  top: number
  width: number
  height: number
}

let active = false
let bound = false
let natural: NaturalSize | null = null
let pixels: ImageData | null = null
let mapping: Mapping | null = null
let frame = 0
let interval: number | undefined
let scrollTimer: number | undefined
let loadingUrl: string | null = null
let warned = false

function clampIndex(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(0, Math.round(value)))
}

/** 取小图上某点的颜色，并按遮罩不透明度压暗（与页面的 .bg-overlay 对齐）。
 *  颜色带 --lg-ring-alpha（默认 0.55）的透明度：环带底层已经是 blur 过的真实背景，
 *  采样色只作为叠加，浓一点像"拉丝色块"，淡一点更融进背景。 */
function sampleColor(u: number, v: number, scrim: number): string | null {
  if (!pixels) return null
  const x = clampIndex(u * (pixels.width - 1), pixels.width - 1)
  const y = clampIndex(v * (pixels.height - 1), pixels.height - 1)
  const offset = (y * pixels.width + x) * 4
  const data = pixels.data
  const r = Math.round((data[offset] ?? 0) * (1 - scrim))
  const g = Math.round((data[offset + 1] ?? 0) * (1 - scrim))
  const b = Math.round((data[offset + 2] ?? 0) * (1 - scrim))
  return 'rgba(' + r + ', ' + g + ', ' + b + ', var(--lg-ring-alpha, 0.55))'
}

/** 把背景图缩成小图并缓存像素；跨域失败时 pixels 保持为 null（走模糊兜底） */
function ensurePixels(url: string): void {
  if (natural?.url === url || loadingUrl === url) return
  loadingUrl = url
  natural = null
  pixels = null

  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.decoding = 'async'
  image.onload = () => {
    if (loadingUrl !== url) return
    const width = image.naturalWidth || 1
    const height = image.naturalHeight || 1
    natural = { url, width, height }

    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_WIDTH
    canvas.height = Math.max(1, Math.round((SAMPLE_WIDTH * height) / width))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      try {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
      } catch {
        // 跨域：画布被污染，读不了像素 → 用模糊兜底
        pixels = null
        if (!warned) {
          warned = true
          console.info('[liquid-glass] 背景图不允许读取像素（跨域），透镜改用模糊兜底')
        }
      }
    }
    measure()
  }
  image.onerror = () => {
    if (loadingUrl === url) loadingUrl = null
  }
  image.src = url
}

/** 计算背景图在视口中的实际位置（含 .bg-image 自己的 scale(1.05)） */
function resolveMapping(): Mapping | null {
  const layer = document.querySelector<HTMLElement>('.bg-image')
  if (!layer || !natural) return null
  const box = layer.getBoundingClientRect()
  if (box.width < 2 || box.height < 2) return null

  const base = Math.max(box.width / natural.width, box.height / natural.height)
  const rawWidth = natural.width * base
  const rawHeight = natural.height * base
  const rawLeft = box.left + (box.width - rawWidth) / 2
  const rawTop = box.top + (box.height - rawHeight) / 2
  const centerX = box.left + box.width / 2
  const centerY = box.top + box.height / 2

  return {
    left: centerX + (rawLeft - centerX) * PAGE_SCALE,
    top: centerY + (rawTop - centerY) * PAGE_SCALE,
    width: rawWidth * PAGE_SCALE,
    height: rawHeight * PAGE_SCALE,
  }
}

/** 每个元素最近一次写入的 12 个颜色：值没变就不写样式。
 *  这是闪屏的关键 —— 带 backdrop-filter 的元素只要样式被改写，浏览器就会重新采样背景并重绘；
 *  每 800ms 无条件写一遍变量，画面就会周期性"跳"一下。 */
const lastColors = new WeakMap<HTMLElement, string[]>()
/** 元素的 --lg-lens 是静态的，读一次就够，避免每轮都 getComputedStyle + 强制样式解析 */
const lensInsetCache = new WeakMap<HTMLElement, number>()

function lensInsetOf(element: HTMLElement): number {
  const cached = lensInsetCache.get(element)
  if (cached !== undefined) return cached
  const raw = parseFloat(getComputedStyle(element).getPropertyValue('--lg-lens'))
  const value = Number.isFinite(raw) && raw > 0 ? raw : 4
  lensInsetCache.set(element, value)
  return value
}

function measure(): void {
  if (!active) return
  const root = document.documentElement
  mapping = resolveMapping()
  if (!mapping) return

  const scrim = Number(root.style.getPropertyValue('--lg-scrim')) || 0
  const viewportHeight = window.innerHeight

  for (const element of document.querySelectorAll<HTMLElement>(SURFACE_SELECTOR)) {
    const rect = element.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    // 屏幕外的卡片不采样（省开销，也避免滚动时无意义的写入）
    if (rect.bottom < -240 || rect.top > viewportHeight + 240) continue

    const lensInset = lensInsetOf(element)

    // ---- 取色：从中心沿 12 个等分方向打到玻璃边界 ----
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const halfWidth = rect.width / 2
    const halfHeight = rect.height / 2

    const previous = lastColors.get(element) ?? []
    let changed = false

    EDGE_ANGLES.forEach((deg, index) => {
      const rad = (deg * Math.PI) / 180
      // 屏幕坐标：x 向右、y 向下；0° 指向正上方，顺时针递增
      const dx = Math.sin(rad)
      const dy = -Math.cos(rad)
      // 射线与矩形边界的交点距离（取先撞到的那条边）
      const toVertical = Math.abs(dx) < 1e-6 ? Infinity : halfWidth / Math.abs(dx)
      const toHorizontal = Math.abs(dy) < 1e-6 ? Infinity : halfHeight / Math.abs(dy)
      const distance = Math.min(toVertical, toHorizontal) - lensInset
      const radius = Math.max(1, distance)
      const px = centerX + dx * radius
      const py = centerY + dy * radius
      const u = (px - mapping!.left) / mapping!.width
      const v = (py - mapping!.top) / mapping!.height
      const color = sampleColor(u, v, scrim)
      if (!color || previous[index] === color) return
      previous[index] = color
      changed = true
      element.style.setProperty('--lg-c' + index, color)
    })

    if (changed) lastColors.set(element, previous)
  }
}

function schedule(): void {
  if (frame) return
  frame = window.requestAnimationFrame(() => {
    frame = 0
    measure()
  })
}

function onResize(): void {
  schedule()
}

function onScroll(): void {
  if (scrollTimer) window.clearTimeout(scrollTimer)
  // 滚动时卡片相对背景的位置在变，但取色很便宜；用 120ms 防抖避免每帧都算
  scrollTimer = window.setTimeout(schedule, 120)
}

function bind(): void {
  if (bound) return
  bound = true
  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('orientationchange', onResize, { passive: true })
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })
}

function startInterval(): void {
  if (interval !== undefined) return
  // 兜底：卡片可能晚于设置挂载（切日期、切换布局、教程插入等）。
  // 间隔给大一点：颜色没变时 measure() 不会写任何样式，不会引起重绘。
  interval = window.setInterval(schedule, 2000)
}

function stopInterval(): void {
  if (interval === undefined) return
  window.clearInterval(interval)
  interval = undefined
}

/** 由 BoardPage 的 watchEffect 调用；设置变化 / 切换布局都会重跑 */
export function syncGlassLens(settings: Record<string, unknown> | undefined): void {
  const root = document.documentElement
  const view = backgroundSetting(settings ?? {})
  const usable = cardThemeSetting(settings) === 'liquid' && view.enabled && Boolean(view.url)

  root.style.setProperty('--lg-scrim', String(Math.min(1, Math.max(0, view.opacity / 100))))

  if (!usable) {
    active = false
    stopInterval()
    return
  }

  active = true
  ensurePixels(view.url)
  bind()
  startInterval()
  schedule()
}

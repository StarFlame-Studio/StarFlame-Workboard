/**
 * 液态玻璃 SVG 滤镜的共享池。
 *
 * 每张液态玻璃卡片都需要一个「位移 + 模糊」的 SVG filter，再通过
 * `backdrop-filter: url(#id)` 引用它。原来每个 <GlassSurface> 实例都在自己的
 * DOM 里渲染一份 <svg><filter>，一屏十几张卡片就是十几份滤镜定义：每份都要
 * 单独解析、单独为 feImage 解码一张位移贴图，GPU 侧也按实例各建一份滤镜资源；
 * 而它们的差别其实只有「位移贴图尺寸」和几个数值参数。
 *
 * 这里把滤镜集中到一个挂在 <body> 上的隐藏 <svg> 里，按「参数签名」复用：
 * 参数完全相同的实例共享同一个 <filter>，引用计数归零时删除。
 * 渲染结果与原实现一致（同一份 filter 定义、同样的 feImage / 位移 / 模糊参数）。
 */
const SVG_NS = 'http://www.w3.org/2000/svg'
const HOST_ATTR = 'data-sf-glass-filters'

export interface GlassFilterSpec {
  /** 位移贴图缓存键（同键 = 同一张 data URL） */
  mapKey: string
  /** 位移贴图 data URL */
  mapUrl: string
  /** feDisplacementMap 的位移倍率 */
  scale: number
  xChannel: string
  yChannel: string
  /** feGaussianBlur 的 stdDeviation（背景模糊 + 散景合成后的半径） */
  displace: number
  /** feColorMatrix 的饱和度；1 = 不变 */
  saturate: number
}

interface FilterEntry {
  id: string
  refs: number
  node: SVGFilterElement
}

const entriesByKey = new Map<string, FilterEntry>()
const entriesById = new Map<string, FilterEntry>()
let host: SVGSVGElement | null = null
let defs: SVGDefsElement | null = null
let sequence = 0

function ensureHost(): SVGSVGElement | null {
  if (typeof document === 'undefined' || !document.body) return null
  if (host?.isConnected) return host
  const existing = document.querySelector<SVGSVGElement>(`svg[${HOST_ATTR}]`)
  if (existing) {
    host = existing
    return host
  }
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement
  svg.setAttribute(HOST_ATTR, '')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'
  const container = document.createElementNS(SVG_NS, 'defs') as SVGDefsElement
  svg.appendChild(container)
  document.body.appendChild(svg)
  host = svg
  defs = container
  return svg
}

/** 参数签名：签名相同的实例共享同一个 <filter> */
export function glassFilterSignature(spec: GlassFilterSpec): string {
  return [spec.mapKey, spec.scale, spec.xChannel, spec.yChannel, spec.displace, spec.saturate].join('|')
}

function createFilter(spec: GlassFilterSpec, id: string): SVGFilterElement {
  const filter = document.createElementNS(SVG_NS, 'filter') as SVGFilterElement
  filter.setAttribute('id', id)
  filter.setAttribute('color-interpolation-filters', 'sRGB')
  filter.setAttribute('x', '0%')
  filter.setAttribute('y', '0%')
  filter.setAttribute('width', '100%')
  filter.setAttribute('height', '100%')

  const image = document.createElementNS(SVG_NS, 'feImage')
  image.setAttribute('x', '0')
  image.setAttribute('y', '0')
  image.setAttribute('width', '100%')
  image.setAttribute('height', '100%')
  image.setAttribute('preserveAspectRatio', 'none')
  image.setAttribute('result', 'map')
  image.setAttribute('href', spec.mapUrl)

  const displacement = document.createElementNS(SVG_NS, 'feDisplacementMap')
  displacement.setAttribute('in', 'SourceGraphic')
  displacement.setAttribute('in2', 'map')
  displacement.setAttribute('result', 'displaced')
  displacement.setAttribute('scale', String(spec.scale))
  displacement.setAttribute('xChannelSelector', spec.xChannel)
  displacement.setAttribute('yChannelSelector', spec.yChannel)

  // 滤镜链：位移 → 模糊 → 饱和度。
  // 模糊和饱和度都放在这里，CSS 侧就只剩 backdrop-filter: url(#id) —— 不再叠加
  // CSS 的 blur()/saturate()。浏览器会把整条 SVG 滤镜链一次光栅化，比「SVG 滤镜
  // 之后再套一层 CSS 滤镜」少一遍全区域采样；实测滚动时 23.5fps → 28.3fps。
  // 参数为 0 / 1 时直接不加节点，省掉一次无意义的全图运算。
  const nodes: SVGElement[] = [image, displacement]
  let lastResult = 'displaced'

  const blurRadius = Math.max(0, spec.displace)
  if (blurRadius > 0.01) {
    const blur = document.createElementNS(SVG_NS, 'feGaussianBlur')
    blur.setAttribute('in', lastResult)
    blur.setAttribute('stdDeviation', String(blurRadius))
    blur.setAttribute('result', 'blurred')
    nodes.push(blur)
    lastResult = 'blurred'
  }

  if (Math.abs(spec.saturate - 1) > 0.01) {
    const saturate = document.createElementNS(SVG_NS, 'feColorMatrix')
    saturate.setAttribute('in', lastResult)
    saturate.setAttribute('type', 'saturate')
    saturate.setAttribute('values', String(spec.saturate))
    nodes.push(saturate)
  }

  filter.append(...nodes)
  return filter
}

/** 取一个共享滤镜的 id；没有 DOM（理论上不会发生）时返回 null，调用方退回内联滤镜 */
export function acquireGlassFilter(spec: GlassFilterSpec): string | null {
  const svg = ensureHost()
  if (!svg) return null
  const key = glassFilterSignature(spec)
  const existing = entriesByKey.get(key)
  if (existing) {
    existing.refs += 1
    return existing.id
  }
  sequence += 1
  const id = `sf-glass-filter-${sequence}`
  const node = createFilter(spec, id)
  if (!defs || !defs.isConnected) {
    const container = document.createElementNS(SVG_NS, 'defs') as SVGDefsElement
    svg.appendChild(container)
    defs = container
  }
  defs.appendChild(node)
  const entry: FilterEntry = { id, refs: 1, node }
  entriesByKey.set(key, entry)
  entriesById.set(id, entry)
  return id
}

/** 归还引用；最后一个引用释放时把 <filter> 从隐藏 svg 里摘掉 */
export function releaseGlassFilter(id: string | null | undefined): void {
  if (!id) return
  const entry = entriesById.get(id)
  if (!entry) return
  entry.refs -= 1
  if (entry.refs > 0) return
  entry.node.remove()
  entriesById.delete(id)
  for (const [key, value] of entriesByKey) {
    if (value === entry) {
      entriesByKey.delete(key)
      break
    }
  }
}

/**
 * 浏览器是否支持「SVG 滤镜版 backdrop-filter」。
 *
 * Safari（非 Chrome 内核）与 Firefox 不支持 `backdrop-filter: url(#filter)`，
 * 走这套折射会直接糊成一片，所以要探测。这是浏览器级常量，原实现每个
 * GlassSurface 实例都跑一遍 UA 正则 + createElement 探测（一屏十几张卡片就
 * 白做十几次），这里只算一次并缓存。
 */
let svgBackdropSupport: boolean | null = null

export function supportsGlassSvgFilter(): boolean {
  if (svgBackdropSupport !== null) return svgBackdropSupport
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    svgBackdropSupport = false
    return svgBackdropSupport
  }
  const ua = navigator.userAgent
  if ((/Safari/.test(ua) && !/Chrome/.test(ua)) || /Firefox/.test(ua)) {
    svgBackdropSupport = false
    return svgBackdropSupport
  }
  const probe = document.createElement('div')
  probe.style.backdropFilter = 'url(#sf-glass-probe)'
  svgBackdropSupport = probe.style.backdropFilter !== ''
  return svgBackdropSupport
}

import { LENS_SCALE } from './liquidGlassMap'

const SVG_NS = 'http://www.w3.org/2000/svg'

export interface GlassFilterSpec {
  map: { key: string; url: string }
  width: number
  height: number
  blur: number
  saturation: number
}

interface Entry {
  node: SVGFilterElement
  refs: number
}

const filters = new Map<string, Entry>()
let defs: SVGDefsElement | undefined
let sequence = 0

function svg<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
  return node
}

/** 取样与贴图共用滤镜区域。primitiveUnits 默认的百分比属于 SVG 视口，不能用于 feImage。 */
export function acquireGlassFilter(spec: GlassFilterSpec): { id: string; release: () => void } {
  const key = [spec.map.key, spec.width, spec.height, spec.blur, spec.saturation].join('|')
  let entry = filters.get(key)
  if (!entry) {
    if (!defs?.isConnected) {
      const root = svg('svg', {
        'data-sf-glass-filters': '', 'aria-hidden': 'true', width: 0, height: 0,
        style: 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none',
      })
      defs = svg('defs', {})
      root.append(defs)
      document.body.append(root)
    }
    const node = svg('filter', {
      id: 'sf-glass-filter-' + ++sequence, filterUnits: 'objectBoundingBox', primitiveUnits: 'userSpaceOnUse',
      x: '0%', y: '0%', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB',
    })
    node.append(svg('feImage', {
      x: 0, y: 0, width: spec.width, height: spec.height, preserveAspectRatio: 'none',
      href: spec.map.url, result: 'lens',
    }))
    node.append(svg('feDisplacementMap', {
      in: 'SourceGraphic', in2: 'lens', scale: LENS_SCALE, xChannelSelector: 'R', yChannelSelector: 'G',
    }))
    if (spec.blur > 0.01) node.append(svg('feGaussianBlur', { stdDeviation: spec.blur, edgeMode: 'duplicate' }))
    if (Math.abs(spec.saturation - 1) > 0.01) node.append(svg('feColorMatrix', { type: 'saturate', values: spec.saturation }))
    defs.append(node)
    entry = { node, refs: 0 }
    filters.set(key, entry)
  }
  const reference = entry
  reference.refs++
  return {
    id: reference.node.id,
    release() {
      if (--reference.refs === 0) {
        filters.delete(key)
        reference.node.remove()
      }
    },
  }
}

export function supportsGlassSvgFilter(): boolean {
  // Safari 与 Firefox 的语法探测可能接受 URL，但不支持 SVG 位移用于 backdrop-filter。
  return /(?:Chrome|Chromium)\//.test(navigator.userAgent) && CSS.supports('backdrop-filter', 'url(#sf-glass-probe)')
}

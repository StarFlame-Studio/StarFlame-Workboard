/** PR #1 的边缘透镜。R/G 存采样位移，卡片中心只写中性色。 */
export type Corner = readonly [x: number, y: number]
export type Corners = readonly [topLeft: Corner, topRight: Corner, bottomRight: Corner, bottomLeft: Corner]

export interface LensBox {
  width: number
  height: number
  corners: Corners
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** CSS 圆角相遇时按同一个比例收缩（包括不对称和百分比圆角）。 */
export function fitCorners(width: number, height: number, corners: Corners): Corners {
  const [tl, tr, br, bl] = corners
  const ratio = Math.min(1,
    width / (tl[0] + tr[0]), width / (bl[0] + br[0]),
    height / (tl[1] + bl[1]), height / (tr[1] + br[1]),
  )
  const fit = ([x, y]: Corner): Corner => x && y ? [x * ratio, y * ratio] : [0, 0]
  return [fit(tl), fit(tr), fit(br), fit(bl)]
}

/** 从 CSS 边框盒取圆角，再按四条边的厚度换算到折射层实际所在的内边缘。 */
export function innerCorners(style: CSSStyleDeclaration, width: number, height: number): Corners {
  const [top, right, bottom, left] = [style.borderTopWidth, style.borderRightWidth,
    style.borderBottomWidth, style.borderLeftWidth].map((value) => parseFloat(value) || 0) as [number, number, number, number]
  const outerWidth = width + left + right
  const outerHeight = height + top + bottom
  const length = (value: string, size: number) => (parseFloat(value) || 0) * (value.endsWith('%') ? size / 100 : 1)
  const radius = (value: string): Corner => {
    const [x = '0', y = x] = value.split(/\s+/)
    return [length(x, outerWidth), length(y, outerHeight)]
  }
  const [tl, tr, br, bl] = fitCorners(outerWidth, outerHeight, [
    radius(style.borderTopLeftRadius), radius(style.borderTopRightRadius),
    radius(style.borderBottomRightRadius), radius(style.borderBottomLeftRadius),
  ])
  const inset = ([x, y]: Corner, dx: number, dy: number): Corner => [Math.max(0, x - dx), Math.max(0, y - dy)]
  return fitCorners(width, height, [inset(tl, left, top), inset(tr, right, top), inset(br, right, bottom), inset(bl, left, bottom)])
}

export function cssCorners(corners: Corners): string {
  return corners.map(([x]) => x + 'px').join(' ') + ' / ' + corners.map(([, y]) => y + 'px').join(' ')
}

export const LENS_SCALE = 64

interface Edge {
  depth: number
  nx: number
  ny: number
}

/** 求当前像素到最近轮廓的距离及向内法线。圆弧使用同一套 CSS 椭圆半径。 */
function edgeAt(x: number, y: number, box: LensBox): Edge {
  const { width, height, corners: [tl, tr, br, bl] } = box
  let corner: Corner = tl
  let px = x
  let py = y
  let sx = 1
  let sy = 1
  if (x < tl[0] && y < tl[1]) corner = tl
  else if (width - x < tr[0] && y < tr[1]) { corner = tr; px = width - x; sx = -1 }
  else if (width - x < br[0] && height - y < br[1]) { corner = br; px = width - x; py = height - y; sx = -1; sy = -1 }
  else if (x < bl[0] && height - y < bl[1]) { corner = bl; py = height - y; sy = -1 }
  else {
    const depth = Math.min(x, width - x, y, height - y)
    return { depth, nx: depth === x ? 1 : depth === width - x ? -1 : 0,
      ny: depth === y ? 1 : depth === height - y ? -1 : 0 }
  }
  const [rx, ry] = corner
  const u = (rx - px) / rx
  const v = (ry - py) / ry
  const length = Math.hypot(u, v)
  const normalLength = Math.hypot(u / rx, v / ry)
  return {
    depth: (1 - length) * length / normalLength,
    nx: (u / rx) / normalLength * sx,
    ny: (v / ry) / normalLength * sy,
  }
}

const cache = new Map<string, string>()

/** 只沿边缘向内取样；中心的位移保持为零，轮廓外的像素由玻璃层裁掉。 */
export function buildLiquidGlassMap(box: LensBox, band: number, strength: number, softness: number) {
  const { width, height, corners } = box
  const key = [width, height, ...corners.flat(), band, strength, softness].join('|')
  const cached = cache.get(key)
  if (cached) {
    cache.delete(key)
    cache.set(key, cached)
    return { key, url: cached }
  }

  // 超宽卡仍需在短轴留下足够样本，长短轴各自限幅，避免边缘被整体缩成不到一个像素。
  const size = (length: number) => Math.max(2, Math.min(768, Math.ceil(length * Math.min(1, 9 / band))))
  const canvas = document.createElement('canvas')
  canvas.width = size(width)
  canvas.height = size(height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const image = ctx.createImageData(canvas.width, canvas.height)
  const maxShift = Math.min(24, band * strength)
  const exponent = 1 + clamp(softness / Math.max(2, band), 0, 1)
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const edge = edgeAt((x + 0.5) * width / canvas.width, (y + 0.5) * height / canvas.height, box)
      const t = clamp(1 - Math.max(0, edge.depth) / band, 0, 1)
      const blend = Math.pow(t * t * (3 - 2 * t), exponent)
      const offset = (255 / LENS_SCALE) * maxShift * blend
      const i = (y * canvas.width + x) * 4
      image.data[i] = 128 + Math.round(edge.nx * offset)
      image.data[i + 1] = 128 + Math.round(edge.ny * offset)
      image.data[i + 2] = 128
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  const url = canvas.toDataURL('image/png')
  cache.set(key, url)
  if (cache.size > 64) cache.delete(cache.keys().next().value!)
  return { key, url }
}

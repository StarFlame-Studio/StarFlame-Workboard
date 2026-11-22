/**
 * 液态玻璃 · 参数运行时
 *
 * 设置页里 `liquid.*` 那 27 个数值，在这里翻译成两样东西：
 *   1. 折射层参数 —— 交给 <LiquidGlass> 当 GlassSurface 的 props；
 *   2. 皮肤参数 —— 注入一个 <style>，把 `--lg-*` 变量写到 html 上（亮暗各一套，
 *      靠 CSS 选择器分流，所以切换深浅色不需要重算）。
 *
 * 默认值唯一来源是 settingDefs.ts（`LIQUID_GLASS_DEFAULTS` 直接从 getDefault 读），
 * 不在这里再抄一遍数字。
 */
import { ref } from 'vue'
import { getDefault } from './settingDefs'

export interface LiquidGlassConfig {
  /** 折射（组件 props） */
  distortionScale: number
  borderWidth: number
  refractBlur: number
  saturation: number
  brightness: number
  neutralOpacity: number
  displace: number
  redOffset: number
  greenOffset: number
  blueOffset: number
  backdropBlur: number
  /** 皮肤（CSS 变量，亮暗各一套） */
  frostLight: number
  frostDark: number
  rimLight: number
  rimDark: number
  sheenLight: number
  sheenDark: number
  thicknessLight: number
  thicknessDark: number
  glowLight: number
  glowDark: number
  outerLight: number
  outerDark: number
  pillFrostLight: number
  pillFrostDark: number
  pillSheenLight: number
  pillSheenDark: number
}

/** 每个字段对应的设置 key + 兜底值（兜底只在设置项被删掉时用得上） */
const PARAMS: Array<{ field: keyof LiquidGlassConfig; key: string; fallback: number }> = (
  [
    ['distortionScale', 'liquid.distortionScale', -180],
    ['borderWidth', 'liquid.borderWidth', 0.07],
    ['refractBlur', 'liquid.refractBlur', 4],
    ['saturation', 'liquid.saturation', 1.4],
    ['brightness', 'liquid.brightness', 50],
    ['neutralOpacity', 'liquid.neutralOpacity', 1],
    ['displace', 'liquid.displace', 0],
    ['redOffset', 'liquid.redOffset', 0],
    ['greenOffset', 'liquid.greenOffset', 10],
    ['blueOffset', 'liquid.blueOffset', 20],
    ['backdropBlur', 'liquid.backdropBlur', 3.5],
    ['frostLight', 'liquid.frostLight', 0.36],
    ['frostDark', 'liquid.frostDark', 0.3],
    ['rimLight', 'liquid.rimLight', 0.72],
    ['rimDark', 'liquid.rimDark', 0.26],
    ['sheenLight', 'liquid.sheenLight', 1],
    ['sheenDark', 'liquid.sheenDark', 1],
    ['thicknessLight', 'liquid.thicknessLight', 0.08],
    ['thicknessDark', 'liquid.thicknessDark', 0.28],
    ['glowLight', 'liquid.glowLight', 0.04],
    ['glowDark', 'liquid.glowDark', 0.12],
    ['outerLight', 'liquid.outerLight', 1],
    ['outerDark', 'liquid.outerDark', 1],
    ['pillFrostLight', 'liquid.pillFrostLight', 0.42],
    ['pillFrostDark', 'liquid.pillFrostDark', 0.46],
    ['pillSheenLight', 'liquid.pillSheenLight', 1],
    ['pillSheenDark', 'liquid.pillSheenDark', 1],
  ] as const
).map(([field, key, fallback]) => ({ field, key, fallback }))

function defaultOf(item: { key: string; fallback: number }): number {
  const value = getDefault(item.key)
  return typeof value === 'number' && Number.isFinite(value) ? value : item.fallback
}

export const LIQUID_GLASS_DEFAULTS: LiquidGlassConfig = PARAMS.reduce((acc, item) => {
  acc[item.field] = defaultOf(item)
  return acc
}, {} as LiquidGlassConfig)

/** 当前生效的配置：<LiquidGlass> 的 props 直接读它 */
export const liquidGlassConfig = ref<LiquidGlassConfig>({ ...LIQUID_GLASS_DEFAULTS })

export function readLiquidGlassConfig(settings: Record<string, unknown> | undefined | null): LiquidGlassConfig {
  const result = {} as LiquidGlassConfig
  for (const item of PARAMS) {
    const raw = Number(settings?.[item.key])
    result[item.field] = Number.isFinite(raw) ? raw : defaultOf(item)
  }
  return result
}

const STYLE_ID = 'sf-liquid-glass-vars'

function clampAlpha(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** 亮/暗同一套骨架，只有底色、墨色与外投影颜色不同 */
function varsBlock(config: LiquidGlassConfig, dark: boolean): string {
  const frost = dark ? config.frostDark : config.frostLight
  const pillFrost = dark ? config.pillFrostDark : config.pillFrostLight
  const rim = dark ? config.rimDark : config.rimLight
  const sheen = dark ? config.sheenDark : config.sheenLight
  const thickness = clampAlpha(dark ? config.thicknessDark : config.thicknessLight)
  const glow = clampAlpha(dark ? config.glowDark : config.glowLight)
  const outer = Math.max(0, dark ? config.outerDark : config.outerLight)

  const frostBase = dark ? '20, 17, 14' : '255, 255, 255'
  const pillBase = dark ? '34, 28, 23' : '255, 255, 255'
  const shadowInk = dark ? '0, 0, 0' : '17, 17, 26'

  // 高光渐变的 4 个色标，倍率作用在 alpha 上（暗色本身就更淡）
  const sheenStops = dark ? [0.16, 0.03, 0, 0.08] : [0.46, 0.08, 0.01, 0.22]
  const sheenAt = (index: number): number => round(clampAlpha(sheenStops[index]! * sheen))
  const pillStops = dark ? [0.16, 0.02, 0.08] : [0.5, 0.07, 0.22]
  const pillAt = (index: number): number =>
    round(clampAlpha(pillStops[index]! * sheen * (dark ? config.pillSheenDark : config.pillSheenLight)))

  return `
  --lg-frost: rgba(${frostBase}, ${round(clampAlpha(frost))});
  --lg-pill-frost: rgba(${pillBase}, ${round(clampAlpha(pillFrost))});
  --lg-rim: rgba(255, 255, 255, ${round(clampAlpha(rim))});
  --lg-blur: ${round(Math.max(0, config.backdropBlur))}px;
  --lg-sheen: linear-gradient(
    135deg,
    rgba(255, 255, 255, ${sheenAt(0)}) 0%,
    rgba(255, 255, 255, ${sheenAt(1)}) 36%,
    rgba(255, 255, 255, ${sheenAt(2)}) 62%,
    rgba(255, 255, 255, ${sheenAt(3)}) 100%
  );
  --lg-pill-sheen: linear-gradient(
    135deg,
    rgba(255, 255, 255, ${pillAt(0)}) 0%,
    rgba(255, 255, 255, ${pillAt(1)}) 45%,
    rgba(255, 255, 255, ${pillAt(2)}) 100%
  );
  --lg-shadow:
    inset 0 0 2px 1px rgba(${shadowInk}, ${thickness}),
    inset 0 0 10px 2px rgba(${shadowInk}, ${glow}),
    inset 0 1px 0 rgba(255, 255, 255, ${round(clampAlpha(rim))}),
    0 4px 16px rgba(${shadowInk}, ${round(0.05 * outer)}),
    0 8px 24px rgba(${shadowInk}, ${round(0.05 * outer)}),
    0 16px 56px rgba(${shadowInk}, ${round(0.05 * outer)});
  --lg-pill-shadow:
    inset 0 0 1px 1px rgba(${shadowInk}, ${thickness}),
    inset 0 0 6px 2px rgba(${shadowInk}, ${round(glow * 0.8)}),
    inset 0 1px 0 rgba(255, 255, 255, ${round(clampAlpha(rim * 0.9))}),
    0 3px 10px rgba(${shadowInk}, ${round(dark ? 0.24 : 0.06)}),
    0 6px 18px rgba(${shadowInk}, ${round((dark ? 0.18 : 0.05) * outer)});`
}

function buildCss(config: LiquidGlassConfig): string {
  // 选择器故意写两遍 .ct-liquid：注入的 <style> 一定要压过 styles/liquid-glass.scss 里
  // 那份静态默认值，不能依赖「谁的 <style> 更靠后」这种易碎的顺序。
  return (
    `html.ct-liquid.ct-liquid {${varsBlock(config, false)}\n}\n` +
    `html.ct-liquid.ct-liquid:is(.v-theme--dark, :has(.v-theme--dark)) {${varsBlock(config, true)}\n}\n`
  )
}

/**
 * 应用一份配置：更新响应式值（折射层会跟着重算 props）+ 重写皮肤变量。
 * 幂等，可以随时调用；settings 一变就调一次即可。
 */
export function applyLiquidGlassConfig(config: LiquidGlassConfig): void {
  liquidGlassConfig.value = config
  if (typeof document === 'undefined') return
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  const css = buildCss(config)
  if (style.textContent !== css) style.textContent = css
}

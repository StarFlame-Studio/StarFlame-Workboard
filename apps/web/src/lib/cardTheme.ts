/**
 * 卡片主题（看板的卡片与按钮外观）。
 *
 * 三个选项：
 * · 默认 —— Vuetify 原生卡片/按钮外观（有底色、投影）；
 * · 玻璃 —— 半透明底色 + 白色包边 + backdrop 模糊的毛玻璃，见 styles/glass.scss；
 * · 液态玻璃 —— vue-bits 的 GlassSurface 组件（贴边折射 + 玻璃厚度 + 135° 高光），
 *   组件在 components/ui/GlassSurface.vue，挂载见 components/ui/LiquidGlass.vue。
 *
 * 实现方式：往 <html> 上挂类名 + 一个响应式的当前模式；
 * 卡片里那层折射由 <LiquidGlass> 在读到这个模式后自己挂上，不需要 prop 穿透。
 */
import { ref } from 'vue'
import { localSettings } from './localSettings'
import { applyLiquidGlassConfig, readLiquidGlassConfig } from './liquidGlassSettings'

export type CardThemeMode = 'default' | 'glass' | 'liquid'

/** 挂在 <html> 上的开关类名，与 glass.scss / liquid-glass.scss 中的选择器一一对应 */
export const CARD_THEME_CLASS = 'ct-glass'
export const LIQUID_THEME_CLASS = 'ct-liquid'

/** 设置项 key：本机设置，只存 localStorage（见 lib/localSettings.ts） */
export const CARD_THEME_KEY = 'theme.card'

/** 默认卡片主题：新版默认给毛玻璃质感，用户可在设置 → 主题里改 */
export const DEFAULT_CARD_THEME: CardThemeMode = 'glass'

/** 当前卡片主题（响应式）：<LiquidGlass> 靠它决定要不要渲染折射层 */
export const cardThemeMode = ref<CardThemeMode>(DEFAULT_CARD_THEME)

/**
 * 从班级设置里读出卡片主题。
 * 历史值：改名前的「液态玻璃」写的就是 `liquid`，现在 `liquid` 是这套 GlassSurface 材质，
 * 老数据会自动升级（同一设计语言的正版实现），不会退回默认。
 * 其他非法值退回默认，避免脏数据把样式打崩。
 */
export function cardThemeSetting(settings: Record<string, unknown> | undefined | null): CardThemeMode {
  const raw = settings?.[CARD_THEME_KEY]
  // 显式选过就照用户的选择；没选过（新设备 / 从云端旧值迁移）用新的默认材质
  if (raw === 'default' || raw === 'glass' || raw === 'liquid') return raw
  return DEFAULT_CARD_THEME
}

/**
 * 首屏尽早套用本机卡片主题 + 液态玻璃参数，避免闪一帧默认材质。
 * 必须在 bootstrap 里、app.mount 之前调用（与 applyStoredTheme 同一时机）。
 */
export function applyStoredCardTheme(): void {
  applyCardTheme(cardThemeSetting(localSettings.value))
  applyLiquidGlassConfig(readLiquidGlassConfig(localSettings.value))
}

export function applyCardTheme(mode: CardThemeMode): void {
  cardThemeMode.value = mode
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(CARD_THEME_CLASS, mode === 'glass')
  document.documentElement.classList.toggle(LIQUID_THEME_CLASS, mode === 'liquid')
}

export const CARD_THEME_LABEL: Record<CardThemeMode, string> = {
  default: '默认',
  glass: '玻璃',
  liquid: '液态玻璃',
}

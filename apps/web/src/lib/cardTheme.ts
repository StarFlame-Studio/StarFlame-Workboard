/**
 * 卡片主题（学科卡片 + 底栏按钮的外观风格）。
 *
 * 存在的意义：Vuetify 的 light/dark 是「全局外观」，而卡片主题是「看板局部的材质」，
 * 两者正交——液态玻璃在亮色主题下是「透明白玻璃」，在暗色主题下是「透明黑玻璃」，
 * 颜色差异交给 styles/liquid-glass.scss 里的 `html.ct-liquid .v-theme--dark` 变量覆盖。
 *
 * 实现方式：只往 <html> 上挂一个类名，样式全部由 CSS 承担；
 * 这样任何页面（看板 / 设置页预览）都能复用同一份材质，不需要传 prop 穿透组件树。
 */
export type CardThemeMode = 'default' | 'liquid'

/** 挂在 <html> 上的开关类名，与 liquid-glass.scss 中的选择器一一对应 */
export const CARD_THEME_CLASS = 'ct-liquid'

/** 设置项 key：类班级设置，跟看板一起走云端 */
export const CARD_THEME_KEY = 'theme.card'

/** 从班级设置里读出卡片主题；非法值一律退回默认，避免历史脏数据把样式打崩 */
export function cardThemeSetting(settings: Record<string, unknown> | undefined | null): CardThemeMode {
  const raw = settings?.[CARD_THEME_KEY]
  return raw === 'liquid' ? 'liquid' : 'default'
}

export function applyCardTheme(mode: CardThemeMode): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(CARD_THEME_CLASS, mode === 'liquid')
}

export const CARD_THEME_LABEL: Record<CardThemeMode, string> = {
  default: '默认',
  liquid: '液态玻璃',
}
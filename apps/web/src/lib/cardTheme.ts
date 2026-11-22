/**
 * 卡片主题（看板的卡片与按钮外观）。
 *
 * 两个选项：
 * · 默认 —— Vuetify 原生卡片/按钮外观（有底色、投影）；
 * · 玻璃 —— 全透明 + 白色包边，没有任何模糊/折射/色带，见 styles/glass.scss。
 *
 * 实现方式：只往 <html> 上挂类名，样式全部由 CSS 承担；
 * 这样任何页面（看板 / 设置页预览）都能复用同一份材质，不需要传 prop 穿透组件树。
 */
export type CardThemeMode = 'default' | 'glass'

/** 挂在 <html> 上的开关类名，与 glass.scss 中的选择器一一对应 */
export const CARD_THEME_CLASS = 'ct-glass'

/** 设置项 key：类班级设置，跟看板一起走云端 */
export const CARD_THEME_KEY = 'theme.card'

/**
 * 从班级设置里读出卡片主题。
 * 历史值 `liquid`（改名前的「液态玻璃」）继续认，统一映射到 `glass`；
 * 其他非法值退回默认，避免脏数据把样式打崩。
 */
export function cardThemeSetting(settings: Record<string, unknown> | undefined | null): CardThemeMode {
  const raw = settings?.[CARD_THEME_KEY]
  return raw === 'glass' || raw === 'liquid' ? 'glass' : 'default'
}

export function applyCardTheme(mode: CardThemeMode): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(CARD_THEME_CLASS, mode === 'glass')
}

export const CARD_THEME_LABEL: Record<CardThemeMode, string> = {
  default: '默认',
  glass: '玻璃',
}

import vuetify from '@/plugins/vuetify'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'sf.themeMode'

/** 当前主题（响应式，来自 Vuetify 的 global.name） */
export function currentTheme(): ThemeMode {
  const name = vuetify.theme.global.name.value
  return name === 'light' ? 'light' : 'dark'
}

export function applyTheme(mode: ThemeMode): void {
  vuetify.theme.global.name.value = mode
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // 隐私模式下忽略
  }
  // 同步 html 背景色，避免滚动回弹区域露出白色
  document.documentElement.style.backgroundColor = mode === 'light' ? '#F7F6F4' : '#16130F'
}

/** 首屏尽早应用主题，避免闪白/闪黑 */
export function applyStoredTheme(): ThemeMode {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch {
    stored = null
  }
  const mode: ThemeMode = stored === 'light' ? 'light' : 'dark'
  applyTheme(mode)
  return mode
}

function withFallbackTransition(run: () => void): void {
  const root = document.documentElement
  root.classList.add('theme-transitioning')
  run()
  window.setTimeout(() => root.classList.remove('theme-transitioning'), 420)
}

/**
 * 切换主题。
 * 支持 View Transitions 的浏览器用圆形扩散动画（从点击位置展开），
 * 不支持的降级为全局颜色渐变过渡。
 */
export function toggleTheme(origin?: { x: number; y: number }): ThemeMode {
  const next: ThemeMode = currentTheme() === 'dark' ? 'light' : 'dark'
  const apply = (): void => applyTheme(next)

  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> }
  }

  if (typeof doc.startViewTransition !== 'function') {
    withFallbackTransition(apply)
    return next
  }

  const x = origin?.x ?? window.innerWidth - 80
  const y = origin?.y ?? 40
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))

  const transition = doc.startViewTransition(apply)
  transition.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + radius + 'px at ' + x + 'px ' + y + 'px)'],
        },
        {
          duration: 520,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )
    })
    .catch(() => {
      // 动画失败不影响主题已生效
    })

  return next
}

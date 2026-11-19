import { computed, ref } from 'vue'
import { logicalViewportWidth } from '@/lib/uiScale'

/**
 * 设备模式检测。
 *
 * 目标：一体机（教室大屏 / 触摸一体机）打开网站时自动进入「一体机模式」，
 * 即使它的 CSS 视口被浏览器缩放、或窗口没占满屏幕，也不会被误判成手机，
 * 从而始终使用桌面级布局（大字号、左右分栏、悬停提示、出勤侧栏等）。
 *
 * 判定顺序（先到先得）：
 * 1. 手动覆盖：URL `?mode=terminal|desktop|auto` 或 `?kiosk=1`，
 *    或 localStorage 里保存的 `sf.deviceMode`（设置页「强制使用一体机UI模式」也会写它）。
 * 2. iPad / iPhone / 安卓手机（UA 带 Mobile）：一律按平板或手机处理。
 * 3. 触摸设备且屏幕够大（短边 ≥ 900 且长边 ≥ 1280）：判为一体机。
 *    这里同时要求「触摸」是为了不把普通办公电脑误判一体机；
 *    教室一体机通常 1920×1080 / 3840×2160，满足阈值。
 * 4. 其余按视口宽度区分：< 960 逻辑像素 → 手机，否则桌面。
 *
 * 说明：判断用的是「未缩放的逻辑宽度」（见 @/lib/uiScale），
 * 桌面端整体放大 15% 之后 innerWidth 会变小，直接用 innerWidth 会把
 * 1366×768 的一体机误判成手机。
 */

export type DeviceMode = 'terminal' | 'tablet' | 'phone' | 'desktop'
export type DeviceModeOverride = 'auto' | 'terminal' | 'desktop'

/** 手机布局阈值（逻辑像素，与旧版 window.innerWidth < 960 一致） */
const MOBILE_MAX_WIDTH = 960
/** 一体机：屏幕短边下限 */
const TERMINAL_MIN_SHORT_SIDE = 900
/** 一体机：屏幕长边下限 */
const TERMINAL_MIN_LONG_SIDE = 1280
const OVERRIDE_KEY = 'sf.deviceMode'

export const DEVICE_MODE_LABEL: Record<DeviceMode, string> = {
  terminal: '一体机',
  tablet: '平板',
  phone: '手机',
  desktop: '桌面',
}

function readOverride(): DeviceModeOverride {
  if (typeof window === 'undefined') return 'auto'
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('kiosk') === '1') return 'terminal'
    const fromUrl = params.get('mode')
    if (fromUrl === 'terminal' || fromUrl === 'desktop' || fromUrl === 'auto') {
      if (fromUrl !== 'auto') localStorage.setItem(OVERRIDE_KEY, fromUrl)
      return fromUrl
    }
    const stored = localStorage.getItem(OVERRIDE_KEY)
    if (stored === 'terminal' || stored === 'desktop' || stored === 'auto') return stored
  } catch {
    /* 隐私模式下 localStorage 不可用，退回自动检测 */
  }
  return 'auto'
}

/**
 * 「主要输入方式是触摸」：一体机 / 平板的主指针是 coarse 且没有 hover；
 * 带触屏的笔记本（外接鼠标或触控板）主要指针仍是 fine，不会被判成一体机。
 */
function primaryTouch(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(
    window.matchMedia?.('(pointer: coarse)').matches ||
      window.matchMedia?.('(hover: none)').matches,
  )
}

function touchCapable(): boolean {
  if (typeof navigator === 'undefined') return false
  const points = navigator.maxTouchPoints ?? 0
  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)').matches)
  const noHover = Boolean(window.matchMedia?.('(hover: none)').matches)
  return points > 0 || coarse || noHover
}

function screenSides(): { short: number; long: number } {
  // 部分一体机 / 内嵌浏览器会把 screen 报成 800×600 之类的默认值，
  // 这里取 screen 与视口的较大值，避免大屏被误判成平板。
  const w = Math.max(window.screen?.width || 0, window.innerWidth || 0)
  const h = Math.max(window.screen?.height || 0, window.innerHeight || 0)
  const a = Math.min(w, h)
  const b = Math.max(w, h)
  // 部分一体机把 screen 报成物理像素，按 DPR 还原成 CSS 像素
  const dpr = window.devicePixelRatio || 1
  if (a > 2400 && dpr > 1) return { short: a / dpr, long: b / dpr }
  return { short: a, long: b }
}

function isAppleTablet(): boolean {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/i.test(ua)) return true
  // iPadOS 13+ 默认伪装成 Macintosh
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
}

function isMobileUa(): boolean {
  const ua = navigator.userAgent
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  if (uaData?.mobile) return true
  return /Android.+Mobile|iPhone|iPod|Windows Phone|Mobile Safari/i.test(ua)
}

export function detectDeviceMode(): DeviceMode {
  if (typeof window === 'undefined') return 'desktop'
  const override = overrideRef.value
  if (override !== 'auto') return override

  const touchPrimary = primaryTouch()
  const touch = touchPrimary || touchCapable()
  const { short, long } = screenSides()

  if (isAppleTablet()) return 'tablet'
  // 屏幕够大，或窗口本身就够宽（一体机常被浏览器缩放 / 窗口没占满）
  const bigScreen = short >= TERMINAL_MIN_SHORT_SIDE && long >= TERMINAL_MIN_LONG_SIDE
  const bigViewport = logicalViewportWidth() >= TERMINAL_MIN_LONG_SIDE
  if (touchPrimary && (bigScreen || bigViewport)) return 'terminal'
  if (touchPrimary || isMobileUa()) return short >= 600 ? 'tablet' : 'phone'
  if (touch && isMobileUa()) return 'tablet'
  return logicalViewportWidth() < MOBILE_MAX_WIDTH ? 'phone' : 'desktop'
}

/** 手动覆盖（auto / terminal / desktop），写 localStorage 后立即生效 */
export const overrideRef = ref<DeviceModeOverride>('auto')
export const autoModeRef = ref<DeviceMode>('desktop')
export const deviceMode = computed<DeviceMode>(() =>
  overrideRef.value === 'auto' ? autoModeRef.value : overrideRef.value,
)

/** 是否一体机模式（桌面级布局、大字号） */
export const isTerminal = computed(() => deviceMode.value === 'terminal')

/**
 * 是否使用「手机布局」：仅真正的窄屏手机/平板竖屏，
 * 一体机即使是窄窗口也不用手机布局。
 */
export const viewportWidthRef = ref(0)

export const isMobileUi = computed(() => {
  if (deviceMode.value === 'terminal') return false
  // 用响应式宽度，而不是直接调 logicalViewportWidth()，
  // 否则 resize 后 computed 不会失效（函数依赖不可追踪）。
  return viewportWidthRef.value < MOBILE_MAX_WIDTH
})

export function setDeviceModeOverride(next: DeviceModeOverride): void {
  overrideRef.value = next
  try {
    localStorage.setItem(OVERRIDE_KEY, next)
  } catch {
    /* 忽略写入失败 */
  }
  refreshDeviceMode()
}

function applyDomFlags(): void {
  const root = document.documentElement
  root.dataset.deviceMode = deviceMode.value
  root.classList.toggle('device-terminal', deviceMode.value === 'terminal')
  root.classList.toggle('device-desktop', deviceMode.value === 'desktop')
  root.classList.toggle('device-tablet', deviceMode.value === 'tablet')
  root.classList.toggle('device-phone', deviceMode.value === 'phone')
}

function refreshDeviceMode(): void {
  viewportWidthRef.value = logicalViewportWidth()
  autoModeRef.value = detectDeviceMode()
  applyDomFlags()
}

let bound = false

export function initDeviceMode(): void {
  overrideRef.value = readOverride()
  refreshDeviceMode()
  if (bound) return
  bound = true
  window.addEventListener('resize', refreshDeviceMode, { passive: true })
  window.addEventListener('orientationchange', refreshDeviceMode, { passive: true })
  // 横竖屏切换、外接屏幕变化后指针能力可能改变
  window.matchMedia?.('(pointer: coarse)').addEventListener?.('change', refreshDeviceMode)
}

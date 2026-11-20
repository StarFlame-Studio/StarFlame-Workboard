/**
 * 新旧设置键兼容层。
 *
 * 历史原因，班级设置里同时存在两套键名：
 * - 旧扁平键（DEFAULT_BOARD_SETTINGS 里的 showTime / showHitokoto / fontScale / bgEnabled …），
 *   服务端 bootstrap 会为它们填充默认值，所以永远「有值」；
 * - 新的点分键（settingDefs.ts 里的 timeCard.enabled / hitokoto.enabled / font.size / background.* …），
 *   设置页只会写这一套。
 *
 * 读取侧统一走这里：新键优先，旧键兜底，都没有才用 fallback。这样老班级的历史设置不会丢，
 * 新设置的开关也能真正生效。
 */
export type SettingsMap = Record<string, unknown>

/** 新键 -> 旧扁平键（仅在这些键需要兜底时使用） */
const LEGACY_FALLBACK: Record<string, string> = {
  'timeCard.enabled': 'showTime',
  'hitokoto.enabled': 'showHitokoto',
  'display.emptySubjectDisplay': 'emptySubjectDisplay',
  'display.showRandomButton': 'showRandomPicker',
  'display.showQuickTools': 'showQuickTools',
  'edit.autoSave': 'autoSave',
  'edit.autoSavePromptText': 'autoSavePromptText',
  'edit.manualSavePromptText': 'manualSavePromptText',
  'background.enabled': 'bgEnabled',
  'background.url': 'bgUrl',
  'background.blur': 'bgBlur',
  'background.opacity': 'bgOpacity',
  'randomPicker.enabled': 'showRandomPicker',
  'randomPicker.excludeAbsent': 'randomExcludeAbsent',
}

function rawValue(settings: SettingsMap, key: string): unknown {
  const direct = settings[key]
  if (direct !== undefined && direct !== null && direct !== '') return direct
  const legacy = LEGACY_FALLBACK[key]
  if (legacy) {
    const value = settings[legacy]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase()
    if (text === 'true' || text === '1' || text === 'on' || text === 'yes') return true
    if (text === 'false' || text === '0' || text === 'off' || text === 'no') return false
  }
  return undefined
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => String(item)).join(',')
  return undefined
}

/** 读布尔开关：新键 -> 旧键 -> fallback */
export function boolSetting(settings: SettingsMap, key: string, fallback: boolean): boolean {
  const parsed = toBoolean(rawValue(settings, key))
  return parsed === undefined ? fallback : parsed
}

/** 读数字设置：新键 -> 旧键 -> fallback */
export function numberSetting(settings: SettingsMap, key: string, fallback: number): number {
  const parsed = toNumber(rawValue(settings, key))
  return parsed === undefined ? fallback : parsed
}

/** 读整数设置并夹紧到 [min, max] */
export function intSetting(
  settings: SettingsMap,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Math.round(numberSetting(settings, key, fallback))
  return Math.min(max, Math.max(min, value))
}

/** 读文本设置：新键 -> 旧键 -> fallback */
export function stringSetting(settings: SettingsMap, key: string, fallback: string): string {
  const parsed = toStringValue(rawValue(settings, key))
  return parsed === undefined || parsed === '' ? fallback : parsed
}

/** 正文字号：font.size（新键）优先，旧键 fontScale 是相对 28px 的倍数 */
export function fontSizeSetting(settings: SettingsMap): number {
  const direct = toNumber(settings['font.size'])
  if (direct !== undefined && direct > 0) return direct
  const scale = toNumber(settings.fontScale)
  if (scale !== undefined && scale > 0) return Math.round(scale * 28)
  return 28
}

/** 随机点名模式：randomPicker.mode（新键）优先，旧键 randomNameMode 是布尔 */
export function randomModeSetting(settings: SettingsMap): 'name' | 'number' {
  const mode = toStringValue(settings['randomPicker.mode'])
  if (mode === 'name' || mode === 'number') return mode
  const legacy = toBoolean(settings.randomNameMode)
  if (legacy !== undefined) return legacy ? 'name' : 'number'
  return 'name'
}

/** 随机点名是否排除请假学生 */
export function randomExcludeAbsentSetting(settings: SettingsMap): boolean {
  const direct = toBoolean(settings['randomPicker.excludeAbsent'])
  if (direct !== undefined) return direct
  const legacy = toBoolean(settings.randomExcludeAbsent)
  return legacy === undefined ? true : legacy
}

export interface BackgroundView {
  enabled: boolean
  url: string
  blur: number
  opacity: number
}

/** 背景设置：新键 background.* 优先，旧键 bgEnabled/bgUrl/bgBlur/bgOpacity 兜底 */
export function backgroundSetting(settings: SettingsMap): BackgroundView {
  const imageData = stringSetting(settings, 'background.imageData', '')
  const remoteUrl = stringSetting(settings, 'background.url', '')
  return {
    enabled: boolSetting(settings, 'background.enabled', false),
    url: imageData || remoteUrl,
    blur: Math.max(0, Math.min(40, numberSetting(settings, 'background.blur', 10))),
    opacity: Math.max(0, Math.min(90, numberSetting(settings, 'background.opacity', 30))),
  }
}

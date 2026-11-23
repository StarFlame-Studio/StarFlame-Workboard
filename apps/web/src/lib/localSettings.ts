/**
 * 本机设置（settingDefs 里标了 `local: true` 的项）。
 *
 * 卡片主题和液态玻璃参数属于「这台设备看起来怎样」，不是班级数据：
 * 不同设备的屏幕、亮度、显卡都不同，把一套参数同步到所有设备反而会互相覆盖。
 * 所以这类设置只写浏览器 localStorage，不进云端、也不进待同步队列。
 *
 * theme.mode（明亮/暗黑）是更早就本地化的设置，由 lib/theme.ts 用 `sf.themeMode` 单独管理，
 * 这里刻意跳过它，避免两份存储互相打架。
 */
import { ref } from 'vue'
import { SETTING_DEFS } from './settingDefs'

const PREFIX = 'sf.setting.'
/** 由 theme.ts 单独管理的本机设置，不参与这里的读写 */
const EXCLUDED = new Set(['theme.mode'])

function readAll(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const def of SETTING_DEFS) {
    if (!def.local || EXCLUDED.has(def.key)) continue
    try {
      const raw = localStorage.getItem(PREFIX + def.key)
      if (raw === null) continue
      out[def.key] = JSON.parse(raw) as unknown
    } catch {
      // 隐私模式或脏数据：忽略，退回设置项默认值
    }
  }
  return out
}

function hasStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

/** 当前本机设置（响应式）：设置页写入、看板读取，切页面不丢 */
export const localSettings = ref<Record<string, unknown>>(hasStorage() ? readAll() : {})

/** 这个 key 是否是本机设置（由 settingDefs 的 local 标记决定） */
export function isLocalSettingKey(key: string): boolean {
  if (EXCLUDED.has(key)) return false
  return SETTING_DEFS.some((def) => def.local && def.key === key)
}

/** 写一项本机设置：同时更新响应式值和 localStorage */
export function writeLocalSetting(key: string, value: unknown): void {
  localSettings.value = { ...localSettings.value, [key]: value }
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // 存不下就算了，本次会话内仍然生效
  }
}

/** 重新从 localStorage 读取（切换账号/清缓存后用） */
export function reloadLocalSettings(): void {
  localSettings.value = hasStorage() ? readAll() : {}
}

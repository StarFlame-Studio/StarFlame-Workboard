import { patchData } from './api'
import { localSettings, writeLocalSetting } from './localSettings'
import { settingsCloudSyncEnabled } from './settingsScope'

/**
 * 保存一批设置改动。
 * - 一体机：写进班级设置（云端），同班所有大屏同步生效；
 * - 手机 / 平板 / 老师电脑：只写本机 localStorage，不覆盖班级大屏的配置。
 * 返回是否写入了云端。
 */
export async function saveSettingsPatch(patch: Record<string, unknown>): Promise<boolean> {
  if (settingsCloudSyncEnabled.value) {
    await patchData('/board/settings', { settings: patch })
    return true
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    writeLocalSetting(key, value)
  }
  return false
}

/** 读取设置时的底稿：非一体机用本机值覆盖云端值，保证刷新后自己的改动还在 */
export function mergeLocalSettings<T extends Record<string, unknown>>(remote: T | undefined | null): Record<string, unknown> {
  const base = (remote ?? {}) as Record<string, unknown>
  if (settingsCloudSyncEnabled.value) return base
  return { ...base, ...localSettings.value }
}

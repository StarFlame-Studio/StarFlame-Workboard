import { patchData } from './api'
import { isLocalSettingKey, writeLocalSetting } from './localSettings'
import { settingsCloudSyncEnabled } from './settingsScope'

/**
 * 把预配链接里的设置快照应用过来。
 * - 一体机（有写权限）：写进班级设置（云端），同班大屏同步生效；
 * - 手机 / 平板 / 老师电脑：只写本机，不碰云端设置。
 * 只读设备（家长 / 学生 / 游客）不落云端，避免每台只读设备都去改一遍班级设置。
 */
export async function applyProvisionSettings(snapshot: Record<string, unknown>): Promise<boolean> {
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) continue
    // 作业模板体积大且不适合从链接带入
    if (key === 'homeworkTemplate') continue
    // 本机设置（主题、背景等）不进云端
    if (isLocalSettingKey(key)) {
      if (settingsCloudSyncEnabled.value) continue
      writeLocalSetting(key, value)
      continue
    }
    payload[key] = value
  }
  if (!settingsCloudSyncEnabled.value) return true
  if (Object.keys(payload).length === 0) return false
  await patchData('/board/settings', { settings: payload })
  return true
}

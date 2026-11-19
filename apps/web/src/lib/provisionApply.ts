import { patchData } from './api'
import { getDef } from './settingDefs'

/**
 * 把预配链接里的设置快照写进班级设置（云端）。
 * 只有写权限设备（老师 / 一体机）能落库；只读设备（家长 / 学生 / 游客）跳过，
 * 避免每台只读设备打开链接都去改一遍云端设置。
 */
export async function applyProvisionSettings(snapshot: Record<string, unknown>): Promise<boolean> {
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) continue
    // 作业模板体积大且不适合从链接带入
    if (key === 'homeworkTemplate') continue
    // 本机设置（主题等）不进云端
    if (getDef(key)?.local) continue
    payload[key] = value
  }
  if (Object.keys(payload).length === 0) return false
  await patchData('/board/settings', { settings: payload })
  return true
}

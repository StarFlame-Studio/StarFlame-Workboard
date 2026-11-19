/**
 * 设置变更标记：设置页写完云端后打一个标记，
 * 看板回到前台时若发现标记就强制刷新一次，确保新设置真正生效。
 */
export const SETTINGS_DIRTY_KEY = 'sf.settingsDirtyAt'

/** 标记「云端设置刚被改过」 */
export function markSettingsDirty(): void {
  try {
    localStorage.setItem(SETTINGS_DIRTY_KEY, String(Date.now()))
  } catch {
    // 忽略隐私模式下不可写的场景
  }
}

/** 取走标记：有标记返回 true 并清除，避免重复刷新 */
export function consumeSettingsDirty(): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_DIRTY_KEY)
    if (!raw) return false
    localStorage.removeItem(SETTINGS_DIRTY_KEY)
    return true
  } catch {
    return false
  }
}

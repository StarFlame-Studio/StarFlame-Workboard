import { computed } from 'vue'
import { isSmallDeviceMode, isTerminal } from '@/lib/deviceMode'
import { useSessionStore } from '@/stores/session'

/**
 * 云端设置同步范围。
 *
 * 只有「一体机」参与班级设置的云端同步：一体机上的改动写进班级设置，同一班级的所有大屏同步生效。
 * 手机 / 平板 / 老师办公室电脑等设备打开时仍会读取一次班级设置作为底稿，
 * 但之后的改动只保存在本机（localStorage），不会推送到云端 ——
 * 避免在手机上误改一个开关就把整个班级的大屏一起改掉。
 *
 * 判定「一体机」有两条依据，命中任意一条即可：
 * 1. 设备模式是一体机（自动识别，或在「关于 → 设备模式」里手动指定）；
 * 2. 绑定身份是一体机（用一体机授权码绑定的教室大屏；即使屏幕被浏览器缩放、外接投影，
 *    自动识别成了桌面模式，也应该继续参与云端同步）。
 */
const terminalRole = computed(() => {
  try {
    return useSessionStore().role === 'terminal'
  } catch {
    // Pinia 还没装好（极早期调用）：按非一体机处理，避免误写云端
    return false
  }
})

/**
 * 当前设备是否参与班级设置的云端同步（响应式）。
 *
 * 手机 / 平板模式下一律不参与（即使用一体机授权码绑定）；
 * 一体机模式参与；另有终端授权身份时，只要不是手机 / 平板模式也参与
 * （防止个别一体机被浏览器缩放误判成桌面模式后失去同步）。
 */
export const settingsCloudSyncEnabled = computed(
  () => isTerminal.value || (terminalRole.value && !isSmallDeviceMode.value),
)

/** 当前设备是否参与班级设置的云端同步（普通函数里用） */
export function canSyncSettingsToCloud(): boolean {
  return settingsCloudSyncEnabled.value
}

/** 当前是否手机 / 平板模式：这两种模式下一体机模式被强制关闭（实现见 lib/deviceMode.ts） */
export { isSmallDeviceMode }

/**
 * 后台下发的设备指令处理（目前只有远程卸载）。
 * 指令通过实时连接（socket.io）送达，只在非公开页面注册；
 * 网页端没有卸载能力，收到指令后只在控制台记录，不影响使用。
 */
import { onDeviceCommand, type DeviceCommand } from './realtime'
import { isDesktop } from './platform'
import { uninstallApp } from './platform'

const UNINSTALL_CONFIRM =
  '管理员已远程卸载本设备上的星焰作业板。\n\n应用即将退出并自动卸载，卸载后需要重新安装才能继续使用。\n\n是否立即卸载？'

let started = false
let running = false

/** 执行远程卸载：桌面端调用主进程卸载程序，网页端无法卸载 */
async function handleUninstall(): Promise<void> {
  if (running) return
  running = true
  try {
    if (!isDesktop) {
      console.warn('[device] 当前运行在网页端，无法执行远程卸载指令')
      return
    }
    const confirmed = window.confirm(UNINSTALL_CONFIRM)
    if (!confirmed) {
      console.warn('[device] 用户取消远程卸载')
      return
    }
    await uninstallApp()
  } catch (err) {
    console.error('[device] 远程卸载失败：', err)
  } finally {
    running = false
  }
}

function handleCommand(command: DeviceCommand): void {
  if (!command || typeof command.type !== 'string') return
  if (command.type === 'uninstall') {
    void handleUninstall()
  }
}

/** 注册指令监听（幂等） */
export function startDeviceCommands(): void {
  if (started) return
  started = true
  onDeviceCommand(handleCommand)
}

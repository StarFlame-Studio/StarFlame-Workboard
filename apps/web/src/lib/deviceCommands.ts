/**
 * 后台下发的设备指令处理（目前只有远程卸载）。
 * 指令通过实时连接（socket.io）送达，只在非公开页面注册。
 *
 * 远程卸载是「零人工」的：桌面端收到指令后直接调用主进程的卸载程序并退出，
 * 设备上不需要任何人点确认；网页端没有卸载能力，只回执「不支持」，让服务端清掉在途队列。
 * 执行结果通过 POST /device/command-ack 回执，服务端据此把「卸载待送达」标记摘掉。
 */
import { postData } from './api'
import { onDeviceCommand, type DeviceCommand } from './realtime'
import { isDesktop, uninstallApp } from './platform'

let started = false
let running = false

/** 上报回执：尽力而为，失败不影响设备本身的动作 */
function reportAck(command: DeviceCommand, status: 'done' | 'unsupported' | 'failed', message?: string): void {
  void postData('/device/command-ack', {
    id: typeof command.id === 'string' ? command.id : undefined,
    type: command.type,
    status,
    ...(message ? { message: message.slice(0, 200) } : {}),
  }).catch(() => {
    // 回执丢失也不阻塞；服务端的在途队列会按 24 小时过期
  })
}

/** 执行远程卸载：桌面端直接调用主进程的卸载程序，不需要任何人工确认 */
async function handleUninstall(command: DeviceCommand): Promise<void> {
  if (running) return
  running = true
  try {
    if (!isDesktop) {
      console.warn('[device] 当前运行在网页端，无法执行远程卸载指令')
      reportAck(command, 'unsupported', '网页端不支持远程卸载')
      return
    }
    const result = await uninstallApp()
    if (result?.ok) {
      reportAck(command, 'done')
    } else {
      reportAck(command, 'failed', result?.message ?? '卸载程序启动失败')
    }
  } catch (err) {
    console.error('[device] 远程卸载失败：', err)
    reportAck(command, 'failed', err instanceof Error ? err.message : '卸载失败')
  } finally {
    running = false
  }
}

function handleCommand(command: DeviceCommand): void {
  if (!command || typeof command.type !== 'string') return
  if (command.type === 'uninstall') {
    void handleUninstall(command)
  }
}

/** 注册指令监听（幂等） */
export function startDeviceCommands(): void {
  if (started) return
  started = true
  onDeviceCommand(handleCommand)
}

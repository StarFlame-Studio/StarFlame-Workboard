import { io, type Socket } from 'socket.io-client'
import { DEVICE_TOKEN_STORAGE_KEY } from '@starflame/shared'
import { apiBase } from './api'

export type BoardScope = 'homework' | 'notice' | 'exam' | 'students' | 'settings' | 'attendance'

export interface BoardChangeEvent {
  scope: BoardScope
  action: 'create' | 'update' | 'delete'
  actor: string
  at: number
}

/** 后台下发的设备指令（目前只有远程卸载） */
export interface DeviceCommand {
  type: string
  at?: number
  [key: string]: unknown
}

type Listener = (event: BoardChangeEvent) => void
type CommandListener = (command: DeviceCommand) => void

let socket: Socket | null = null
const listeners = new Set<Listener>()
const commandListeners = new Set<CommandListener>()

/** 断开与重连时对外通知 */
const statusListeners = new Set<(connected: boolean) => void>()
let connected = false

function setConnected(value: boolean): void {
  if (connected === value) return
  connected = value
  for (const fn of statusListeners) fn(value)
}

function resolveSocketUrl(): string {
  // apiBase 生产为 https://zyapi.yanhuoyiyou.cn/api，开发为 /api
  if (apiBase.startsWith('http')) {
    return apiBase.replace(/\/api\/?$/, '')
  }
  // 开发环境走 Vite 代理，同源即可
  return window.location.origin
}

/** 网络延迟（毫秒），null 表示未知或探测失败 */
let latency: number | null = null
const latencyListeners = new Set<(ms: number | null) => void>()
let latencyTimer: number | undefined
let probing = false

function setLatency(value: number | null): void {
  if (latency === value) return
  latency = value
  for (const fn of latencyListeners) fn(value)
}

async function probeLatency(): Promise<void> {
  if (probing || document.hidden) return
  probing = true
  const started = performance.now()
  try {
    const base = apiBase.startsWith('http') ? apiBase : window.location.origin + apiBase
    const res = await fetch(base.replace(/\/$/, '') + '/health', { cache: 'no-store' })
    setLatency(res.ok ? Math.max(1, Math.round(performance.now() - started)) : null)
  } catch {
    setLatency(null)
  } finally {
    probing = false
  }
}

function startLatencyProbe(): void {
  if (latencyTimer !== undefined) return
  void probeLatency()
  latencyTimer = window.setInterval(() => {
    void probeLatency()
  }, 10000)
}

function stopLatencyProbe(): void {
  if (latencyTimer !== undefined) {
    window.clearInterval(latencyTimer)
    latencyTimer = undefined
  }
  setLatency(null)
}

export function getLatency(): number | null {
  return latency
}

export function onLatency(listener: (ms: number | null) => void): () => void {
  latencyListeners.add(listener)
  listener(latency)
  return () => latencyListeners.delete(listener)
}

export function connectRealtime(): Socket | null {
  if (socket) return socket

  const token = localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY)
  if (!token) return null

  socket = io(resolveSocketUrl(), {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { deviceToken: token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  })

  startLatencyProbe()

  socket.on('connect', () => setConnected(true))
  socket.on('disconnect', () => setConnected(false))
  socket.on('connect_error', () => setConnected(false))

  socket.on('board.changed', (payload: BoardChangeEvent) => {
    for (const fn of listeners) {
      try {
        fn(payload)
      } catch {
        // 单个监听器异常不影响其他
      }
    }
  })

  socket.on('device.command', (payload: DeviceCommand) => {
    for (const fn of commandListeners) {
      try {
        fn(payload)
      } catch {
        // 单个监听器异常不影响其他
      }
    }
  })

  return socket
}

export function disconnectRealtime(): void {
  if (!socket) return
  socket.removeAllListeners()
  socket.disconnect()
  socket = null
  stopLatencyProbe()
  setConnected(false)
}

export function onBoardChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 订阅后台下发的设备指令；返回取消订阅函数 */
export function onDeviceCommand(listener: CommandListener): () => void {
  commandListeners.add(listener)
  return () => commandListeners.delete(listener)
}

export function onRealtimeStatus(listener: (connected: boolean) => void): () => void {
  statusListeners.add(listener)
  listener(connected)
  return () => statusListeners.delete(listener)
}

export function isRealtimeConnected(): boolean {
  return connected
}

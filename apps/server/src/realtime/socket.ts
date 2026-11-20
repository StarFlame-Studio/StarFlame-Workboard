import type { Server as HttpServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Server } from 'socket.io'
import { eq } from 'drizzle-orm'
import { HEADER_DEVICE_TOKEN } from '@starflame/shared'
import { db } from '../db/index.js'
import { classes, devices, users } from '../db/schema.js'
import { sha256, verifyAccessToken } from '../lib/tokens.js'
import { logger } from '../logger.js'
import { markDeviceSocketClosed, markDeviceSocketOpen } from '../services/devicePresence.js'

export interface BoardEventPayload {
  classId: string
  scope: 'homework' | 'notice' | 'exam' | 'students' | 'settings' | 'attendance'
  action?: 'create' | 'update' | 'delete'
  actor?: string
}

let io: Server | null = null

/** 从 socket 握手信息里取客户端 IP（与 HTTP 侧的 clientIp 同一套优先级） */
function socketClientIp(socket: {
  handshake: { headers: Record<string, unknown>; address?: string }
}): string | null {
  const headers = socket.handshake.headers
  const cf = headers['cf-connecting-ip']
  if (typeof cf === 'string' && cf.trim()) return cf.trim().slice(0, 64)
  const forwarded = headers['x-forwarded-for']
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
  if (typeof raw === 'string' && raw.trim()) {
    const first = raw.split(',')[0]?.trim()
    if (first) return first.slice(0, 64)
  }
  const address = socket.handshake.address
  return address ? address.slice(0, 64) : null
}

/** 房间名：按班级隔离 */
export function classRoom(classId: string): string {
  return 'class:' + classId
}

/**
 * 解析连接凭证：优先设备令牌，其次用户 JWT。
 * 返回该凭证能访问的 classId 列表。
 */
async function resolveAccess(handshake: {
  auth?: Record<string, unknown>
  headers: Record<string, unknown>
}): Promise<{ classIds: string[]; label: string; deviceId?: string } | null> {
  const auth = handshake.auth ?? {}
  const deviceToken = (auth.deviceToken as string | undefined)
    ?? (handshake.headers[HEADER_DEVICE_TOKEN] as string | undefined)
  const accessToken = (auth.accessToken as string | undefined)

  // 1) 设备令牌：只能看自己班级
  if (deviceToken) {
    const rows = await db
      .select({ id: devices.id, classId: devices.classId, status: devices.status })
      .from(devices)
      .where(eq(devices.tokenHash, sha256(deviceToken)))
      .limit(1)
    const device = rows[0]
    if (!device || device.status !== 'active') return null
    return { classIds: [device.classId], label: 'device', deviceId: device.id }
  }

  // 2) 用户 JWT：owner/admin 可看全部班级，teacher 只看自己的
  if (accessToken) {
    try {
      const payload = verifyAccessToken(accessToken)
      const userRows = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
      const user = userRows[0]
      if (!user || user.status !== 'active') return null

      if (user.role === 'owner' || user.role === 'admin') {
        const all = await db.select({ id: classes.id }).from(classes)
        return { classIds: all.map((item) => item.id), label: 'user' }
      }
      const owned = await db.select({ id: classes.id }).from(classes).where(eq(classes.ownerId, user.id))
      return { classIds: owned.map((item) => item.id), label: 'user' }
    } catch {
      return null
    }
  }

  return null
}

export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    path: '/socket.io',
    cors: { origin: true, credentials: true },
    serveClient: false,
  })

  io.use(async (socket, next) => {
    try {
      const access = await resolveAccess({
        auth: socket.handshake.auth as Record<string, unknown>,
        headers: socket.handshake.headers as unknown as Record<string, unknown>,
      })
      if (!access || access.classIds.length === 0) {
        next(new Error('unauthorized'))
        return
      }
      socket.data.classIds = access.classIds
      socket.data.label = access.label
      socket.data.deviceId = access.deviceId ?? ''
      next()
    } catch (error) {
      logger.warn({ err: error }, 'socket auth failed')
      next(new Error('unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    const classIds = (socket.data.classIds as string[]) ?? []
    for (const classId of classIds) socket.join(classRoom(classId))

    // 设备令牌连接 → 记为在线，并刷新 last_seen_at（管理面板据此显示在线状态）
    const deviceId = (socket.data.deviceId as string) || ''
    if (deviceId) {
      markDeviceSocketOpen(deviceId)
      socket.data.deviceTracked = true
      const lastIp = socketClientIp(socket)
      void db
        .update(devices)
        .set({ lastSeenAt: new Date(), ...(lastIp ? { lastIp } : {}) })
        .where(eq(devices.id, deviceId))
        .catch((error) => logger.warn({ err: error }, 'device presence update failed'))
    }

    socket.emit('board.connected', { classIds, at: Date.now() })

    // 设备上次离线时挂起的指令（如远程卸载）在这里补发：设备一上线就执行，不需要人工重试
    if (deviceId) flushPendingCommands(deviceId)

    socket.on('board.ping', (payload: { at?: number } | undefined, ack?: (v: unknown) => void) => {
      if (typeof ack === 'function') ack({ at: payload?.at ?? Date.now(), serverTime: Date.now() })
    })

    socket.on('disconnect', () => {
      // 离开房间由 socket.io 自动处理
      if (socket.data.deviceTracked) markDeviceSocketClosed(deviceId)
    })
  })

  logger.info('Socket.IO 实时层已挂载')
  return io
}

/**
 * 广播班级数据变更。
 * 若 io 未初始化（例如单元测试环境），静默跳过。
 */
export function broadcastChange(payload: BoardEventPayload): void {
  if (!io) return
  io.to(classRoom(payload.classId)).emit('board.changed', {
    scope: payload.scope,
    action: payload.action ?? 'update',
    actor: payload.actor ?? '',
    at: Date.now(),
  })
}

/**
 * 强制断开指定设备已建立的实时连接（吊销设备时调用，使其立即掉线）。
 * 返回被断开的连接数；io 未初始化时静默返回 0。
 */
export function disconnectDeviceSockets(deviceIds: string[]): number {
  if (!io || deviceIds.length === 0) return 0
  const targets = new Set(deviceIds)
  let closed = 0
  for (const socket of io.sockets.sockets.values()) {
    const deviceId = (socket.data.deviceId as string) || ''
    if (!deviceId || !targets.has(deviceId)) continue
    socket.disconnect(true)
    closed += 1
  }
  return closed
}

/**
 * 向指定设备的实时连接下发一条指令（如远程卸载）。
 * 与 disconnectDeviceSockets 不同，这里不主动断开连接，由客户端自行处理。
 * 返回送达的连接数；设备不在线时返回 0。
 */
export function sendDeviceCommand(
  deviceId: string,
  command: { type: string; [key: string]: unknown },
): number {
  if (!io || !deviceId) return 0
  // 每条指令都带唯一 id：设备回执时带上它，便于排查「下发了几次、谁执行的」
  const payload = { ...withCommandId(command), at: Date.now() }
  let sent = 0
  for (const socket of io.sockets.sockets.values()) {
    const targetId = (socket.data.deviceId as string) || ''
    if (targetId !== deviceId) continue
    socket.emit('device.command', payload)
    sent += 1
  }
  return sent
}

/**
 * 在途设备指令：设备当前不在线时先挂起，等它下次连上实时层自动补发。
 * 后台「远程卸载」用这条路径，保证离线设备联网后也会被执行，不需要人工再点一次。
 * key = deviceId，value = { command, at }。
 */
const PENDING_COMMAND_TTL_MS = 24 * 60 * 60 * 1000
const pendingCommands = new Map<string, { command: { type: string; [key: string]: unknown }; at: number }>()

function sweepPendingCommands(now = Date.now()): void {
  for (const [deviceId, entry] of pendingCommands) {
    if (now - entry.at > PENDING_COMMAND_TTL_MS) pendingCommands.delete(deviceId)
  }
}

/** 挂起一条设备指令，等设备上线后补发 */
export function queueDeviceCommand(deviceId: string, command: { type: string; [key: string]: unknown }): void {
  if (!deviceId) return
  sweepPendingCommands()
  pendingCommands.set(deviceId, { command: withCommandId(command), at: Date.now() })
}

/** 下发指令时带上唯一 id，便于客户端回执 */
function withCommandId(command: { type: string; [key: string]: unknown }): { type: string; id: string } {
  return { ...command, id: command.id ? String(command.id) : randomUUID() } as { type: string; id: string }
}

/** 设备是否有在途指令（后台列表据此显示「指令待送达」） */
export function hasPendingDeviceCommand(deviceId: string): boolean {
  if (!deviceId) return false
  const entry = pendingCommands.get(deviceId)
  if (!entry) return false
  if (Date.now() - entry.at > PENDING_COMMAND_TTL_MS) {
    pendingCommands.delete(deviceId)
    return false
  }
  return true
}

/** 设备连接建立后补发在途指令；返回补发条数 */
function flushPendingCommands(deviceId: string): number {
  const entry = pendingCommands.get(deviceId)
  if (!entry) return 0
  if (Date.now() - entry.at > PENDING_COMMAND_TTL_MS) {
    pendingCommands.delete(deviceId)
    return 0
  }
  const sent = sendDeviceCommand(deviceId, entry.command)
  if (sent > 0) {
    logger.info({ deviceId, type: entry.command.type }, 'pending device command flushed on connect')
  }
  return sent
}

/** 设备对指令的执行回执（目前只区分 done / unsupported / failed），仅用于清空在途队列与排查 */
const lastCommandAck = new Map<string, { status: string; at: number }>()

/** 记录设备回执：无论成功与否都清掉在途指令，避免设备重连后被反复下发 */
export function ackDeviceCommand(deviceId: string, status: string): void {
  if (!deviceId) return
  pendingCommands.delete(deviceId)
  lastCommandAck.set(deviceId, { status, at: Date.now() })
  logger.info({ deviceId, status }, 'device command ack')
}

/** 设备最近一次指令回执状态（没有回执返回 null） */
export function deviceCommandAck(deviceId: string): string | null {
  const entry = lastCommandAck.get(deviceId)
  return entry ? entry.status : null
}

export function getIo(): Server | null {
  return io
}

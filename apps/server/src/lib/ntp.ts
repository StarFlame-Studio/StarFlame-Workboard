import dgram from 'node:dgram'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { classes } from '../db/schema.js'
import { logger } from '../logger.js'

/** 阿里云公共 NTP 服务器，按顺序降级 */
const NTP_HOSTS = ['ntp.aliyun.com', 'ntp1.aliyun.com', 'time.pool.aliyun.com']
const NTP_PORT = 123
/** 1900-01-01 到 1970-01-01 的秒数 */
const NTP_EPOCH_DELTA = 2_208_988_800
const QUERY_TIMEOUT_MS = 1500
/** 缓存多久重新同步一次 */
const SYNC_TTL_MS = 60_000
/** 超过这个时间没同步成功就认为时间源不可用 */
const STALE_MS = 10 * 60_000
/** 班级时间同步设置的读取缓存 */
const CONFIG_TTL_MS = 30_000
/** 自定义主机 DNS 解析结果的缓存 */
const RESOLVE_TTL_MS = 5 * 60_000

const DEFAULT_INTERVAL_MIN = 5
const MAX_INTERVAL_MIN = 60

export type TimeSource = 'aliyun' | 'local' | 'custom'
type ActiveSource = 'ntp.aliyun.com' | 'custom' | 'system'

export interface ServerTimeSnapshot {
  now: number
  iso: string
  source: ActiveSource
  offsetMs: number
  stale: boolean
  /** 设置里选中的时间源 */
  configuredSource: TimeSource
  /** 实际使用的时间源主机；使用系统时钟时为空串 */
  host: string
  /** 前端据此设定的自动同步间隔（分钟） */
  intervalMin: number
}

interface TimeConfig {
  source: TimeSource
  customHost: string
  intervalMin: number
}

interface SyncResult {
  offsetMs: number
  syncedAt: number
  source: ActiveSource
  host: string
}

const DEFAULT_CONFIG: TimeConfig = { source: 'aliyun', customHost: '', intervalMin: DEFAULT_INTERVAL_MIN }

/** 每个「时间源配置」独立缓存校准结果，切换设置时不会互相污染 */
const syncCache = new Map<string, SyncResult>()
const inflight = new Map<string, Promise<SyncResult>>()
const configCache = new Map<string, { config: TimeConfig; at: number }>()
const resolveCache = new Map<string, { host: string | null; at: number }>()
const loggedFailure = new Set<string>()

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}

/** 统一按 +08:00 输出，避免服务器时区差异 */
function toIso(ms: number): string {
  const d = new Date(ms + 8 * 3600_000)
  return (
    d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
    'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) +
    '.' + pad(d.getUTCMilliseconds(), 3) + '+08:00'
  )
}

/** 只允许公网地址，避免自定义时间源被用来探测内网（SSRF） */
function isPublicIp(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) {
    const parts = ip.split('.').map(Number)
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
    const [a, b] = parts
    if (a === 0 || a === 10 || a === 127) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a >= 224) return false
    return true
  }
  if (version === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return false
    if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return false
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPublicIp(mapped[1])
    return true
  }
  return false
}

const HOST_RE = /^[A-Za-z0-9.-]+$/

/** 校验并解析自定义 NTP 主机名，返回可用主机或 null */
async function resolveCustomHost(raw: string): Promise<string | null> {
  const host = raw.trim().replace(/\.$/, '')
  if (!host || host.length > 100 || !HOST_RE.test(host)) return null
  if (host.startsWith('-') || host.endsWith('-') || host.includes('..')) return null
  const cached = resolveCache.get(host)
  if (cached && Date.now() - cached.at < RESOLVE_TTL_MS) return cached.host

  let resolved: string | null = null
  try {
    const addresses = await lookup(host, { all: true })
    if (addresses.length > 0 && addresses.every((item) => isPublicIp(item.address))) resolved = host
    else logger.warn({ host }, '自定义时间源不是公网地址，已拒绝')
  } catch {
    logger.warn({ host }, '自定义时间源无法解析，已回退阿里云 NTP')
  }
  resolveCache.set(host, { host: resolved, at: Date.now() })
  return resolved
}

function readConfig(settings: Record<string, unknown>): TimeConfig {
  const rawSource = settings['timeSync.source']
  const source: TimeSource = rawSource === 'local' || rawSource === 'custom' ? rawSource : 'aliyun'
  const rawHost = settings['timeSync.customHost']
  const customHost = typeof rawHost === 'string' ? rawHost.trim() : ''
  const rawInterval = Number(settings['timeSync.intervalMin'])
  const intervalMin = Number.isFinite(rawInterval) && rawInterval >= 1
    ? Math.min(MAX_INTERVAL_MIN, Math.round(rawInterval))
    : DEFAULT_INTERVAL_MIN
  return { source, customHost, intervalMin }
}

/** 读取班级的时间同步设置；classId 为空或读取失败时用默认配置（阿里云 NTP） */
async function loadConfig(classId: string): Promise<TimeConfig> {
  if (!classId) return DEFAULT_CONFIG
  const cached = configCache.get(classId)
  if (cached && Date.now() - cached.at < CONFIG_TTL_MS) return cached.config
  try {
    const rows = await db.select({ settings: classes.settings }).from(classes).where(eq(classes.id, classId)).limit(1)
    const settings = ((rows[0]?.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>
    const config = readConfig(settings)
    configCache.set(classId, { config, at: Date.now() })
    return config
  } catch (error) {
    logger.warn({ classId, error: String(error) }, '读取时间同步设置失败，回退默认时间源')
    return cached?.config ?? DEFAULT_CONFIG
  }
}

/** 单次 SNTP 查询，返回本机时钟与服务器时钟的差值 */
function queryOnce(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    const packet = Buffer.alloc(48)
    // LI=0, VN=3, Mode=3(client)
    packet[0] = 0x1b
    let settled = false
    const startedAt = Date.now()

    const finish = (error: Error | null, value = 0) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        /* ignore */
      }
      if (error) reject(error)
      else resolve(value)
    }

    const timer = setTimeout(() => finish(new Error('timeout')), QUERY_TIMEOUT_MS)

    socket.once('error', (error) => finish(error))
    socket.once('message', (msg) => {
      const receivedAt = Date.now()
      if (msg.length < 48) return finish(new Error('bad packet'))
      const seconds = msg.readUInt32BE(40)
      const fraction = msg.readUInt32BE(44)
      if (seconds === 0) return finish(new Error('bad timestamp'))
      const serverMs = (seconds - NTP_EPOCH_DELTA) * 1000 + Math.round((fraction * 1000) / 2 ** 32)
      // 用请求往返的中点估算网络延迟，抵消一半 RTT
      finish(null, serverMs - (startedAt + receivedAt) / 2)
    })

    socket.send(packet, 0, packet.length, NTP_PORT, host, (error) => {
      if (error) finish(error)
    })
  })
}

async function sync(hosts: string[], tag: 'ntp.aliyun.com' | 'custom', key: string): Promise<SyncResult> {
  for (const host of hosts) {
    try {
      const delta = await queryOnce(host)
      if (!Number.isFinite(delta) || Math.abs(delta) > 86_400_000) throw new Error('implausible offset')
      const result: SyncResult = { offsetMs: delta, syncedAt: Date.now(), source: tag, host }
      syncCache.set(key, result)
      loggedFailure.delete(key)
      return result
    } catch {
      // 换下一个服务器
    }
  }
  const result: SyncResult = { offsetMs: 0, syncedAt: Date.now(), source: 'system', host: '' }
  syncCache.set(key, result)
  if (!loggedFailure.has(key)) {
    loggedFailure.add(key)
    logger.warn(tag === 'custom' ? '自定义 NTP 同步失败，时间源降级为服务器系统时钟' : '阿里云 NTP 同步失败，时间源降级为服务器系统时钟')
  }
  return result
}

async function ensureSync(hosts: string[], tag: 'ntp.aliyun.com' | 'custom', key: string): Promise<SyncResult> {
  const cached = syncCache.get(key)
  if (cached && Date.now() - cached.syncedAt < SYNC_TTL_MS) return cached
  let pending = inflight.get(key)
  if (!pending) {
    pending = sync(hosts, tag, key).finally(() => inflight.delete(key))
    inflight.set(key, pending)
  }
  return pending
}

/** classId 可选：不传时使用默认时间源（阿里云 NTP） */
export async function getServerTime(classId = ''): Promise<ServerTimeSnapshot> {
  const cfg = await loadConfig(classId)

  // 本地时间源：不发起任何网络查询，直接用服务器系统时钟
  if (cfg.source === 'local') {
    const now = Date.now()
    return {
      now,
      iso: toIso(now),
      source: 'system',
      offsetMs: 0,
      stale: false,
      configuredSource: 'local',
      host: '',
      intervalMin: cfg.intervalMin,
    }
  }

  let hosts = NTP_HOSTS
  let tag: 'ntp.aliyun.com' | 'custom' = 'ntp.aliyun.com'
  if (cfg.source === 'custom') {
    const resolved = await resolveCustomHost(cfg.customHost)
    if (resolved) {
      hosts = [resolved]
      tag = 'custom'
    }
    // 校验失败则回退阿里云 NTP
  }

  const key = tag + ':' + hosts.join(',')
  const result = await ensureSync(hosts, tag, key)
  // 同步失败（降级为系统时钟）或太久没成功同步，都按 stale 处理，前端据此提示
  const stale = result.source === 'system' || Date.now() - result.syncedAt > STALE_MS
  const now = Math.round(Date.now() + (stale ? 0 : result.offsetMs))
  return {
    now,
    iso: toIso(now),
    source: stale ? 'system' : result.source,
    offsetMs: stale ? 0 : Math.round(result.offsetMs),
    stale,
    configuredSource: cfg.source,
    host: stale ? '' : result.host,
    intervalMin: cfg.intervalMin,
  }
}

/** 启动时预热一次，避免首个请求等 UDP 超时 */
export function warmupTimeSync(): void {
  void getServerTime().catch(() => undefined)
}

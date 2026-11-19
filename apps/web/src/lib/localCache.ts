import type { BoardBootstrap } from '@starflame/shared'

/** 本地缓存存储键（快照 + 待同步队列） */
export const CACHE_KEY = 'sf.cache.v1'
/** 最多缓存多少个班级 */
export const MAX_CLASSES = 20
/** 单班最多堆积多少条待同步写入 */
export const MAX_PENDING = 200

export type WriteMethod = 'post' | 'put' | 'patch' | 'delete'
export type PendingKind =
  | 'homework'
  | 'notice'
  | 'attendance'
  | 'settings'
  | 'subject'
  | 'exam'
  | 'teacher'
  | 'student'
  | 'studentList'
  | 'customCard'
  | 'other'

export interface PendingWrite {
  id: string
  kind: PendingKind
  method: WriteMethod
  url: string
  body?: unknown
  /** 人类可读描述，供「待同步」列表展示 */
  label: string
  createdAt: string
  tries: number
  /** 离线新建产生的本地临时 ID（local_xxx），回放拿到真实 ID 后用于重映射后续写入 */
  tempId?: string
  /** 回放遇到 409 版本冲突时是否强制覆盖云端（本地优先） */
  force?: boolean
  /** 指数退避：下次允许重试的时间（ISO） */
  nextRetryAt?: string
  /** settings 类专用：这条待同步对应哪个设置 key（用于「一项设置只算一条」合并） */
  settingKey?: string
}

export interface ClassCache {
  className: string
  updatedAt: string
  snapshot: BoardBootstrap | null
  attendance: unknown
  pending: PendingWrite[]
  /** 集合类接口（students / teachers / lists / exams / custom-cards）的最近一次读取副本，供离线读取 */
  extras?: Record<string, unknown>
}

export interface CacheFile {
  version: 1
  activeClassId: string | null
  classes: Record<string, ClassCache>
}

function emptyFile(): CacheFile {
  return { version: 1, activeClassId: null, classes: {} }
}

export function readCache(): CacheFile {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return emptyFile()
    const parsed = JSON.parse(raw) as CacheFile
    if (!parsed || parsed.version !== 1 || !parsed.classes || typeof parsed.classes !== 'object') {
      return emptyFile()
    }
    return {
      version: 1,
      activeClassId: parsed.activeClassId ?? null,
      classes: parsed.classes as Record<string, ClassCache>,
    }
  } catch {
    return emptyFile()
  }
}

export function readCacheFile(): CacheFile {
  return readCache()
}

/** 取某班快照（只读引用，不复制） */
export function getCacheClassSnapshot(classId: string): BoardBootstrap | null {
  const entry = readCache().classes[classId]
  return entry ? entry.snapshot : null
}

export function writeCache(file: CacheFile): void {
  const ids = Object.keys(file.classes)
  if (ids.length > MAX_CLASSES) {
    ids
      .sort((a, b) => (file.classes[a].updatedAt < file.classes[b].updatedAt ? -1 : 1))
      .slice(0, ids.length - MAX_CLASSES)
      .forEach((id) => delete file.classes[id])
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(file))
  } catch {
    // 容量溢出时静默失败，界面仍可用内存态
  }
}

export function getActiveClassId(): string | null {
  return readCache().activeClassId
}

export function setActiveClassId(classId: string): void {
  const file = readCache()
  file.activeClassId = classId
  writeCache(file)
}

function ensureClass(file: CacheFile, classId: string, className?: string): ClassCache {
  const existing = file.classes[classId]
  if (existing) {
    if (className) existing.className = className
    if (!Array.isArray(existing.pending)) existing.pending = []
    return existing
  }
  const created: ClassCache = {
    className: className ?? '',
    updatedAt: new Date().toISOString(),
    snapshot: null,
    attendance: null,
    pending: [],
  }
  file.classes[classId] = created
  return created
}

export function getClassCache(classId: string): ClassCache | null {
  return readCache().classes[classId] ?? null
}

export function saveSnapshot(classId: string, className: string, snapshot: BoardBootstrap): void {
  const file = readCache()
  const entry = ensureClass(file, classId, className)
  entry.className = className || entry.className
  entry.snapshot = snapshot
  entry.updatedAt = new Date().toISOString()
  file.activeClassId = classId
  writeCache(file)
}

export function saveAttendance(classId: string, attendance: unknown): void {
  const file = readCache()
  const entry = ensureClass(file, classId)
  entry.attendance = attendance
  writeCache(file)
}

export function readAttendance(classId: string): unknown {
  const entry = readCache().classes[classId]
  return entry ? entry.attendance : null
}

/** 就地修改某班快照并落盘，返回修改后的快照 */
export function mutateSnapshot(
  classId: string,
  mutator: (snapshot: BoardBootstrap) => void,
): BoardBootstrap | null {
  const file = readCache()
  const entry = file.classes[classId]
  if (!entry || !entry.snapshot) return null
  mutator(entry.snapshot)
  entry.updatedAt = new Date().toISOString()
  writeCache(file)
  return entry.snapshot
}

export function makePendingId(): string {
  return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function enqueuePending(classId: string, item: Omit<PendingWrite, 'id' | 'createdAt' | 'tries'>): number {
  const file = readCache()
  const entry = ensureClass(file, classId)
  entry.pending.push({ ...item, id: makePendingId(), createdAt: new Date().toISOString(), tries: 0 })
  if (entry.pending.length > MAX_PENDING) {
    entry.pending.splice(0, entry.pending.length - MAX_PENDING)
  }
  writeCache(file)
  return entry.pending.length
}

export function listPending(classId: string): PendingWrite[] {
  const entry = readCache().classes[classId]
  return entry ? [...entry.pending] : []
}

export function countPending(classId: string | null): number {
  if (!classId) return 0
  const entry = readCache().classes[classId]
  return entry ? entry.pending.length : 0
}

export function removePending(classId: string, id: string): void {
  const file = readCache()
  const entry = file.classes[classId]
  if (!entry) return
  entry.pending = entry.pending.filter((item) => item.id !== id)
  writeCache(file)
}

export function bumpPendingTries(classId: string, id: string): number {
  const file = readCache()
  const entry = file.classes[classId]
  if (!entry) return 0
  const target = entry.pending.find((item) => item.id === id)
  if (!target) return 0
  target.tries += 1
  writeCache(file)
  return target.tries
}

export function clearPending(classId: string): void {
  const file = readCache()
  const entry = file.classes[classId]
  if (!entry) return
  entry.pending = []
  writeCache(file)
}

export function hasSnapshot(classId: string): boolean {
  const entry = readCache().classes[classId]
  return Boolean(entry && entry.snapshot)
}

/** 局部更新一条待同步写入（force / nextRetryAt 等） */
export function updatePending(classId: string, id: string, patch: Partial<PendingWrite>): void {
  const file = readCache()
  const entry = file.classes[classId]
  if (!entry) return
  const target = entry.pending.find((item) => item.id === id)
  if (!target) return
  Object.assign(target, patch)
  writeCache(file)
}

function replaceDeep(value: unknown, fromId: string, toId: string): unknown {
  if (typeof value === 'string') return value.includes(fromId) ? value.split(fromId).join(toId) : value
  if (Array.isArray(value)) return value.map((item) => replaceDeep(item, fromId, toId))
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(source)) out[key] = replaceDeep(source[key], fromId, toId)
    return out
  }
  return value
}

/** 把队列里所有引用某个临时 ID 的 url / body 换成真实 ID（离线新建回放后重映射） */
export function remapPendingIds(classId: string, fromId: string, toId: string): void {
  if (!fromId || !toId || fromId === toId) return
  const file = readCache()
  const entry = file.classes[classId]
  if (!entry) return
  for (const item of entry.pending) {
    if (item.url.includes(fromId)) item.url = item.url.split(fromId).join(toId)
    if (item.body !== undefined) item.body = replaceDeep(item.body, fromId, toId)
  }
  writeCache(file)
}

/** 快照里的临时 ID 也换成真实 ID，避免刷新后新旧两条并存 */
export function remapSnapshotIds(classId: string, fromId: string, toId: string): void {
  if (!fromId || !toId || fromId === toId) return
  mutateSnapshot(classId, (snapshot) => {
    const next = replaceDeep(snapshot, fromId, toId) as BoardBootstrap
    Object.assign(snapshot, next)
  })
}

export function setExtra(classId: string, key: string, value: unknown): void {
  const file = readCache()
  const entry = ensureClass(file, classId)
  if (!entry.extras) entry.extras = {}
  entry.extras[key] = value
  writeCache(file)
}

export function getExtra(classId: string, key: string): unknown {
  const entry = readCache().classes[classId]
  return entry?.extras ? entry.extras[key] : undefined
}

/** 按 url 前缀找最近一次缓存的集合响应（参数不同也复用，离线兜底用） */
export function findExtra(classId: string, url: string): unknown {
  const entry = readCache().classes[classId]
  const extras = entry?.extras
  if (!extras) return undefined
  const exact = extras[url + '|{}']
  if (exact !== undefined) return exact
  for (const key of Object.keys(extras)) {
    if (key.startsWith(url + '|')) return extras[key]
  }
  return undefined
}

/** 就地修改缓存里同一 url 的所有集合副本（离线写入后让列表页刷新可见） */
export function mutateExtras(classId: string, url: string, mutator: (value: Record<string, unknown>) => void): void {
  const file = readCache()
  const entry = file.classes[classId]
  if (!entry?.extras) return
  let changed = false
  for (const key of Object.keys(entry.extras)) {
    if (!key.startsWith(url + '|')) continue
    const value = entry.extras[key]
    if (value && typeof value === 'object') {
      mutator(value as Record<string, unknown>)
      changed = true
    }
  }
  if (changed) writeCache(file)
}

/** 集合副本里的临时 ID 也换成真实 ID */
export function remapExtraIds(classId: string, fromId: string, toId: string): void {
  if (!fromId || !toId || fromId === toId) return
  const file = readCache()
  const entry = file.classes[classId]
  if (!entry?.extras) return
  for (const key of Object.keys(entry.extras)) {
    entry.extras[key] = replaceDeep(entry.extras[key], fromId, toId)
  }
  writeCache(file)
}

/** 设置类待同步：同一设置 key 只保留一条，后续修改覆盖其值 */
export function upsertSettingsPending(
  classId: string,
  settingKey: string,
  body: unknown,
  label: string,
): void {
  const file = readCache()
  const entry = ensureClass(file, classId)
  const existing = entry.pending.find((item) => item.kind === 'settings' && item.settingKey === settingKey)
  if (existing) {
    existing.body = body
    existing.label = label
    existing.tries = 0
    existing.nextRetryAt = undefined
    writeCache(file)
    return
  }
  entry.pending.push({
    id: makePendingId(),
    kind: 'settings',
    method: 'patch',
    url: '/board/settings',
    body,
    label,
    createdAt: new Date().toISOString(),
    tries: 0,
    settingKey,
  })
  if (entry.pending.length > MAX_PENDING) {
    entry.pending.splice(0, entry.pending.length - MAX_PENDING)
  }
  writeCache(file)
}

import { reactive } from 'vue'
import {
  DEFAULT_BOARD_SETTINGS,
  DEFAULT_SUBJECTS,
  type BoardBootstrap,
  type ExamItem,
  type HomeworkItem,
  type NoticeItem,
  type StudentItem,
  type SubjectInfo,
} from '@starflame/shared'
import {
  deleteData,
  getData,
  patchData,
  postData,
  putData,
  setLocalReadHook,
  setLocalWriteHook,
  setReadNoteHook,
} from '@/lib/api'
import type { PendingKind, PendingWrite, WriteMethod } from '@/lib/localCache'
import { getDef, getDefault } from '@/lib/settingDefs'
import {
  bumpPendingTries,
  clearPending,
  countPending,
  enqueuePending,
  findExtra,
  getActiveClassId,
  getCacheClassSnapshot,
  getClassCache,
  listPending,
  mutateExtras,
  mutateSnapshot,
  readAttendance,
  readCacheFile,
  remapExtraIds,
  remapPendingIds,
  remapSnapshotIds,
  removePending,
  saveAttendance,
  saveSnapshot,
  setExtra,
  updatePending,
  upsertSettingsPending,
} from '@/lib/localCache'

export type DataSourceMode = 'starflame' | 'local'

export const MODE_KEY = 'sf.datasource.mode'
export const PROVIDER_API = 'starflame-api'
export const PROVIDER_LOCAL = 'local-cache'

export interface FlushResult {
  synced: number
  dropped: number
  failed: number
  remaining: number
  /** 本次回放中因版本冲突被强制覆盖的条数 */
  conflicts: number
}

/** 全局数据源状态，供顶栏与设置页直接读取 */
export const ds = reactive({
  mode: 'starflame' as DataSourceMode,
  classId: null as string | null,
  pending: 0,
  usingCache: false,
  needsOnlineLoad: false,
  /** 断网自动切换态；不覆盖用户手动选择的 mode */
  offline: false,
})

/** 响应结构为 { items: [] } 的集合类接口，离线时用最近一次读取的副本兜底 */
const COLLECTION_PATHS = ['/board/students', '/board/teachers', '/board/lists', '/board/exams', '/board/custom-cards']

/** 首屏 bootstrap 超时：弱网/冷启动时首包常在 6～10s，过短会误判为服务器不通 */
export const BOOTSTRAP_TIMEOUT_MS = 12000
/** 首屏失败后的自动重试间隔（ms），次数 = 数组长度 */
export const BOOTSTRAP_RETRY_DELAYS = [1000, 3000]
/** 指数退避：3s → 9s → 27s → 81s → 243s */
const RETRY_DELAYS = [3000, 9000, 27000, 81000, 243000]

function retryDelay(tries: number): number {
  const index = Math.min(Math.max(tries, 1) - 1, RETRY_DELAYS.length - 1)
  return RETRY_DELAYS[index]
}

function readStoredMode(): DataSourceMode {
  try {
    const raw = localStorage.getItem(MODE_KEY)
    return raw === 'local' ? 'local' : 'starflame'
  } catch {
    return 'starflame'
  }
}

function storeMode(mode: DataSourceMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // 忽略存储异常
  }
}

export function providerToMode(provider: unknown): DataSourceMode {
  return provider === PROVIDER_LOCAL ? 'local' : 'starflame'
}

export function modeToProvider(mode: DataSourceMode): string {
  return mode === 'local' ? PROVIDER_LOCAL : PROVIDER_API
}

export function getMode(): DataSourceMode {
  return ds.mode
}

/** 手动本地模式或断网自动离线，都走本地读写钩子 */
export function isLocalMode(): boolean {
  return ds.mode === 'local' || ds.offline
}

/** 仅切换本机模式，不写云端设置 */
export function setMode(mode: DataSourceMode): void {
  ds.mode = mode
  storeMode(mode)
  applyHooks()
  const classId = activeClassId()
  if (classId) {
    mutateSnapshot(classId, (snapshot) => {
      snapshot.settings = { ...snapshot.settings, 'server.provider': modeToProvider(mode) }
    })
  }
  refreshPending()
}

/** 断网自动离线开关（不写 MODE_KEY，也不改云端设置） */
export function setOfflineActive(active: boolean): void {
  if (ds.offline === active) return
  ds.offline = active
  applyHooks()
  refreshPending()
}

function applyHooks(): void {
  const local = isLocalMode()
  setLocalWriteHook(local ? handleLocalWrite : null)
  setLocalReadHook(local ? handleLocalRead : null)
}

function activeClassId(): string | null {
  return ds.classId ?? getActiveClassId()
}

/** 本地独立模式使用的虚拟班级：未登录、且本机从未联网加载过任何班级时用它兜底 */
export const LOCAL_CLASS_ID = 'local-standalone'
export const LOCAL_CLASS_NAME = '本地模式班级'

/** 本机是否已经有任何可用于只读浏览的缓存快照 */
export function hasCachedSnapshot(): boolean {
  const file = readCacheFile()
  return Object.values(file.classes).some((entry) => Boolean(entry?.snapshot))
}

/** 造一份空白看板：默认科目 + 默认设置，纯本机数据 */
function emptyBootstrap(): BoardBootstrap {
  return {
    class: { id: LOCAL_CLASS_ID, name: LOCAL_CLASS_NAME, grade: null, school: null, status: 'active' },
    settings: { ...DEFAULT_BOARD_SETTINGS } as Record<string, unknown>,
    date: todayString(),
    subjects: DEFAULT_SUBJECTS.map((item, index) => ({
      id: 'local-subject-' + item.code,
      code: item.code,
      name: item.name,
      color: item.color,
      icon: item.icon,
      sortIndex: index,
      enabled: true,
    })) as SubjectInfo[],
    homework: [],
    exams: [],
    notices: [],
    students: [],
    stats: { studentCount: 0, homeworkCount: 0, hasAttendanceToday: false },
  }
}

/**
 * 保证本地模式下一定有一份可读可写的看板。
 * 场景：从未登录过、本机也没有任何缓存 → 直接生成空白看板，
 * 让用户纯本机也能浏览与编辑（写入照常进待同步队列）。
 */
export function ensureLocalBoard(): BoardBootstrap {
  const active = getActiveClassId()
  const cached = active ? getCacheClassSnapshot(active) : null
  if (cached) {
    ds.classId = active
    ds.usingCache = true
    ds.needsOnlineLoad = false
    refreshPending()
    return cached
  }
  const board = emptyBootstrap()
  saveSnapshot(LOCAL_CLASS_ID, LOCAL_CLASS_NAME, board)
  ds.classId = LOCAL_CLASS_ID
  ds.usingCache = true
  ds.needsOnlineLoad = false
  refreshPending()
  return board
}

export function refreshPending(): void {
  ds.pending = countPending(activeClassId())
}

function todayString(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

/** 在线抓一份快照并写入缓存（切到本地模式前调用） */
export async function captureSnapshot(): Promise<BoardBootstrap | null> {
  try {
    const data = await getData<BoardBootstrap>('/board/bootstrap', { date: todayString() })
    saveSnapshot(data.class.id, data.class.name, data)
    ds.classId = data.class.id
    refreshPending()
    return data
  } catch {
    return null
  }
}

/** 把数据提供者写入云端设置（不受本地队列影响，始终直连） */
export async function saveProviderToCloud(provider: string): Promise<void> {
  const wasLocal = isLocalMode()
  if (wasLocal) {
    setLocalWriteHook(null)
    setLocalReadHook(null)
  }
  try {
    await patchData('/board/settings', { settings: { 'server.provider': provider } })
  } finally {
    if (wasLocal) applyHooks()
  }
}

/** 读取看板数据：本地模式只读快照，在线模式网络优先、失败降级快照 */
export async function loadBoard(date?: string): Promise<BoardBootstrap> {
  const target = date ?? todayString()

  if (isLocalMode()) {
    const classId = activeClassId()
    const entry = classId ? getClassCache(classId) : null
    if (!entry || !entry.snapshot) {
      // 手动本地模式：从未登录、本机也没有缓存时也要能用 → 生成空白看板继续
      if (ds.mode === 'local') {
        const board = ensureLocalBoard()
        return JSON.parse(JSON.stringify(board)) as BoardBootstrap
      }
      ds.needsOnlineLoad = true
      ds.usingCache = false
      refreshPending()
      throw new Error('本机暂无缓存数据，请联网后首次加载一次')
    }
    ds.classId = classId
    ds.usingCache = true
    ds.needsOnlineLoad = false
    refreshPending()
    return JSON.parse(JSON.stringify(entry.snapshot)) as BoardBootstrap
  }

  // 首屏失败不立刻判死：小屏/一体机冷启动首包偶尔会超时，自动重试两次再降级
  let lastError: unknown = null
  for (let attempt = 0; attempt <= BOOTSTRAP_RETRY_DELAYS.length; attempt += 1) {
    try {
      const data = await getData<BoardBootstrap>('/board/bootstrap', { date: target }, {
        timeout: BOOTSTRAP_TIMEOUT_MS,
      })
      ds.classId = data.class.id
      ds.usingCache = false
      ds.needsOnlineLoad = false
      saveSnapshot(data.class.id, data.class.name, data)
      refreshPending()
      return data
    } catch (error) {
      lastError = error
      const delay = BOOTSTRAP_RETRY_DELAYS[attempt]
      if (delay === undefined) break
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  try {
    throw lastError ?? new Error('加载失败')
  } catch (error) {
    const classId = activeClassId()
    const entry = classId ? getClassCache(classId) : null
    if (entry && entry.snapshot) {
      ds.classId = classId
      ds.usingCache = true
      // 服务器不通时不必等后台探测：直接标记自动离线，界面立刻进入本地缓存态
      ds.offline = true
      applyHooks()
      refreshPending()
      return JSON.parse(JSON.stringify(entry.snapshot)) as BoardBootstrap
    }
    ds.usingCache = false
    throw error
  }
}

// ---------------- 集合类副本（离线读取兜底） ----------------

/** 在线读取成功后把集合响应存一份，供断网时读取 */
export function noteRead(url: string, params: Record<string, unknown> | undefined, data: unknown): void {
  const path = url.split('?')[0]
  // 任意页面读到 bootstrap 都顺手刷新快照，保证断网时一定有缓存可读
  if (path === '/board/bootstrap') {
    const payload = data as BoardBootstrap | undefined
    if (payload?.class?.id) {
      saveSnapshot(payload.class.id, payload.class.name, payload)
      ds.classId = payload.class.id
      refreshPending()
    }
    return
  }
  if (!COLLECTION_PATHS.includes(path)) return
  const classId = activeClassId()
  if (!classId) return
  try {
    setExtra(classId, url + '|' + JSON.stringify(params ?? {}), data)
  } catch {
    // 忽略容量异常
  }
}

// ---------------- 本地写入 ----------------

function kindOf(url: string): PendingKind {
  if (url.startsWith('/board/homework')) return 'homework'
  if (url.startsWith('/board/notices')) return 'notice'
  if (url.startsWith('/board/attendance')) return 'attendance'
  if (url.startsWith('/board/settings')) return 'settings'
  if (url.startsWith('/board/subjects')) return 'subject'
  if (url.startsWith('/board/teachers')) return 'teacher'
  if (url.startsWith('/board/students')) return 'student'
  if (url.startsWith('/board/lists')) return 'studentList'
  if (url.startsWith('/board/custom-cards')) return 'customCard'
  if (url.startsWith('/board/exams')) return 'exam'
  return 'other'
}

function labelOf(kind: PendingKind, method: WriteMethod): string {
  const verb = method === 'post' ? '新增' : method === 'delete' ? '删除' : '修改'
  const name: Record<PendingKind, string> = {
    homework: '作业',
    notice: '通知',
    attendance: '考勤',
    settings: '设置',
    subject: '科目',
    exam: '考试',
    teacher: '教师',
    student: '学生',
    studentList: '名单',
    customCard: '卡片',
    other: '数据',
  }
  return verb + name[kind]
}

const TEMP_PREFIX: Record<PendingKind, string> = {
  homework: 'hw',
  notice: 'nt',
  attendance: 'at',
  settings: 'st',
  subject: 'sj',
  exam: 'ex',
  teacher: 'tc',
  student: 'su',
  studentList: 'ls',
  customCard: 'cc',
  other: 'gen',
}

function newTempId(kind: PendingKind): string {
  return 'local_' + TEMP_PREFIX[kind] + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

interface LocalBody {
  [key: string]: unknown
}

function targetIdOf(url: string): string {
  const segments = url.split('?')[0].split('/').filter(Boolean)
  return segments[2] ?? ''
}

/** 把一次写入应用到本地快照，保证刷新后仍能看到改动 */
function applySnapshotMutation(
  snapshot: BoardBootstrap,
  method: WriteMethod,
  url: string,
  body: unknown,
  tempId?: string,
): void {
  const payload = (body ?? {}) as LocalBody
  const path = url.split('?')[0]
  const targetId = targetIdOf(url)

  if (path === '/board/homework' && method === 'put') {
    const subjectId = String(payload.subjectId ?? '')
    const content = String(payload.content ?? '')
    const existing = snapshot.homework.find((item) => item.subjectId === subjectId)
    const next: HomeworkItem = {
      id: existing?.id ?? newTempId('homework'),
      subjectId,
      content,
      dueDate: String(payload.date ?? snapshot.date),
      status: 'published',
      version: (existing?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    }
    snapshot.homework = [...snapshot.homework.filter((item) => item.subjectId !== subjectId), next]
    return
  }

  if (path === '/board/homework/batch' && method === 'put') {
    const date = String(payload.date ?? snapshot.date)
    const items = Array.isArray(payload.items) ? (payload.items as LocalBody[]) : []
    for (const item of items) {
      const subjectId = String(item.subjectId ?? '')
      const existing = snapshot.homework.find((row) => row.subjectId === subjectId)
      const next: HomeworkItem = {
        id: existing?.id ?? newTempId('homework'),
        subjectId,
        content: String(item.content ?? ''),
        dueDate: date,
        status: 'published',
        version: (existing?.version ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      }
      snapshot.homework = [...snapshot.homework.filter((row) => row.subjectId !== subjectId), next]
    }
    return
  }

  if (path.startsWith('/board/notices')) {
    if (method === 'post') {
      const notice: NoticeItem = {
        id: tempId ?? newTempId('notice'),
        title: String(payload.title ?? ''),
        content: String(payload.content ?? ''),
        level: payload.level === 'urgent' ? 'urgent' : 'info',
        pinned: Boolean(payload.pinned),
        publishAt: new Date().toISOString(),
        expireAt: (payload.expireAt as string | null) ?? null,
      }
      snapshot.notices = [notice, ...snapshot.notices]
    } else if (method === 'patch') {
      snapshot.notices = snapshot.notices.map((item) =>
        item.id === targetId ? { ...item, ...(payload as Partial<NoticeItem>) } : item,
      )
    } else if (method === 'delete') {
      snapshot.notices = snapshot.notices.filter((item) => item.id !== targetId)
    }
    return
  }

  if (path === '/board/settings' && method === 'patch') {
    snapshot.settings = { ...snapshot.settings, ...((payload.settings as Record<string, unknown>) ?? {}) }
    return
  }

  if (path === '/board/subjects-order' && method === 'patch') {
    const items = Array.isArray(payload.items) ? (payload.items as LocalBody[]) : []
    for (const item of items) {
      const id = String(item.id ?? '')
      const sortIndex = Number(item.sortIndex ?? 0)
      snapshot.subjects = snapshot.subjects.map((subject) =>
        subject.id === id ? { ...subject, sortIndex } : subject,
      )
    }
    snapshot.subjects = [...snapshot.subjects].sort((a, b) => a.sortIndex - b.sortIndex)
    return
  }

  if (path.startsWith('/board/subjects')) {
    if (method === 'post') {
      const subject: SubjectInfo = {
        id: tempId ?? newTempId('subject'),
        code: String(payload.code ?? payload.name ?? ''),
        name: String(payload.name ?? ''),
        color: (payload.color as string | null) ?? null,
        icon: (payload.icon as string | null) ?? null,
        sortIndex: snapshot.subjects.length,
        enabled: true,
      }
      snapshot.subjects = [...snapshot.subjects, subject]
    } else if (method === 'patch') {
      snapshot.subjects = snapshot.subjects.map((item) =>
        item.id === targetId ? { ...item, ...(payload as Partial<SubjectInfo>) } : item,
      )
    } else if (method === 'delete') {
      snapshot.subjects = snapshot.subjects.filter((item) => item.id !== targetId)
    }
    return
  }

  if (path.startsWith('/board/exams')) {
    if (method === 'post') {
      const exam: ExamItem = {
        id: tempId ?? newTempId('exam'),
        title: String(payload.title ?? ''),
        note: (payload.note as string | null) ?? null,
        status: 'planned',
        subjects: [],
      }
      snapshot.exams = [exam, ...snapshot.exams]
    } else if (method === 'patch') {
      snapshot.exams = snapshot.exams.map((item) =>
        item.id === targetId ? { ...item, ...(payload as Partial<ExamItem>) } : item,
      )
    } else if (method === 'delete') {
      snapshot.exams = snapshot.exams.filter((item) => item.id !== targetId)
    }
    return
  }

  if (path.startsWith('/board/custom-cards')) {
    const holder = snapshot as unknown as { customCards?: Array<Record<string, unknown>> }
    const cards = Array.isArray(holder.customCards) ? holder.customCards : []
    if (method === 'post') {
      cards.push({ id: tempId ?? newTempId('customCard'), title: String(payload.title ?? ''), content: '', sortIndex: cards.length })
    } else if (method === 'patch') {
      for (const card of cards) {
        if (String(card.id) === targetId) Object.assign(card, payload)
      }
    } else if (method === 'delete') {
      holder.customCards = cards.filter((card) => String(card.id) !== targetId)
      return
    }
    holder.customCards = cards
    return
  }

  if (path.startsWith('/board/students')) {
    if (method === 'post' && path.endsWith('/import')) {
      const text = String(payload.text ?? '')
      const names = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
      for (const name of names) {
        const student: StudentItem = {
          id: newTempId('student'),
          name: name.slice(0, 32),
          studentNo: null,
          status: 'active',
          sortIndex: snapshot.students.length,
        }
        snapshot.students = [...snapshot.students, student]
      }
      return
    }
    if (method === 'post') {
      const student: StudentItem = {
        id: tempId ?? newTempId('student'),
        name: String(payload.name ?? ''),
        studentNo: (payload.studentNo as string | null) ?? null,
        status: 'active',
        sortIndex: snapshot.students.length,
      }
      snapshot.students = [...snapshot.students, student]
    } else if (method === 'patch') {
      snapshot.students = snapshot.students.map((item) =>
        item.id === targetId ? { ...item, ...(payload as Partial<StudentItem>) } : item,
      )
    } else if (method === 'delete') {
      snapshot.students = snapshot.students.filter((item) => item.id !== targetId)
    }
  }
}

/** 集合副本同步改一份，离线时列表页刷新仍能看到改动 */
function applyExtrasMutation(
  classId: string,
  method: WriteMethod,
  url: string,
  body: unknown,
  tempId?: string,
): void {
  const path = url.split('?')[0]
  const collection = COLLECTION_PATHS.find((item) => path === item || path.startsWith(item + '/'))
  if (!collection) return
  const payload = (body ?? {}) as LocalBody
  const targetId = path.startsWith(collection + '/') ? path.slice(collection.length + 1) : ''
  if (findExtra(classId, collection) === undefined) {
    const snapshot = getCacheClassSnapshot(classId)
    const seed =
      collection === '/board/students'
        ? { items: snapshot?.students ?? [] }
        : collection === '/board/exams'
          ? { items: snapshot?.exams ?? [] }
          : { items: [] }
    setExtra(classId, collection + '|{}', seed)
  }
  if (method === 'delete') {
    mutateExtras(classId, collection, (value) => {
      const items = Array.isArray(value.items) ? (value.items as LocalBody[]) : []
      value.items = items.filter((item) => String(item.id) !== targetId)
    })
    return
  }
  if (method === 'patch') {
    mutateExtras(classId, collection, (value) => {
      const items = Array.isArray(value.items) ? (value.items as LocalBody[]) : []
      value.items = items.map((item) => (String(item.id) === targetId ? { ...item, ...payload } : item))
    })
    return
  }
  if (method === 'post') {
    if (path.endsWith('/import')) {
      const text = String(payload.text ?? '')
      const names = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
      mutateExtras(classId, collection, (value) => {
        const items = Array.isArray(value.items) ? (value.items as LocalBody[]) : []
        for (const name of names) {
          items.push({ id: newTempId('student'), name: name.slice(0, 32), studentNo: null, status: 'active' })
        }
        value.items = items
      })
      return
    }
    mutateExtras(classId, collection, (value) => {
      const items = Array.isArray(value.items) ? (value.items as LocalBody[]) : []
      items.push({ content: '', ...payload, id: tempId ?? newTempId('other') })
      value.items = items
    })
  }
}

/** 生成与线上接口形状一致的返回值，调用方无需区分模式 */
function synthesise(method: WriteMethod, url: string, body: unknown, classId: string, tempId?: string): unknown {
  const payload = (body ?? {}) as LocalBody
  const path = url.split('?')[0]
  if (path === '/board/homework' && method === 'put') {
    const snapshot = getCacheClassSnapshot(classId)
    const existing = snapshot?.homework.find((item) => item.subjectId === payload.subjectId)
    return {
      id: existing?.id ?? tempId ?? newTempId('homework'),
      subjectId: payload.subjectId,
      content: payload.content,
      version: existing?.version ?? 1,
      dueDate: payload.date,
    }
  }
  if (path === '/board/homework/batch' && method === 'put') {
    const items = Array.isArray(payload.items) ? (payload.items as LocalBody[]) : []
    return { date: payload.date, saved: items.length }
  }
  if (path.startsWith('/board/attendance')) {
    saveAttendance(classId, { date: payload.date, records: payload.records ?? [] })
    return { date: payload.date, records: payload.records ?? [] }
  }
  if (path === '/board/settings') {
    return { settings: (payload.settings as Record<string, unknown>) ?? {} }
  }
  if (path === '/board/subjects-order') {
    return { updated: Array.isArray(payload.items) ? (payload.items as unknown[]).length : 0 }
  }
  if (method === 'delete') return { id: url.split('/').pop() }
  return { id: tempId ?? newTempId('other'), ...payload }
}

function isLocalSetting(key: string): boolean {
  return key === 'theme.mode' || getDef(key)?.local === true
}

function baselineSetting(snapshot: BoardBootstrap | null, key: string): unknown {
  const value = snapshot?.settings?.[key]
  return value === undefined ? getDefault(key) : value
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/**
 * 设置类写入：按「设置 key」拆分成独立待同步项，
 * 同一 key 反复修改只占一条（覆盖最新值），本机设置项直接忽略。
 */
function handleSettingsWrite(classId: string, method: WriteMethod, url: string, body: unknown): unknown {
  const incoming = ((body ?? {}) as LocalBody).settings as Record<string, unknown> | undefined
  const snapshot = getCacheClassSnapshot(classId)
  const changed: Array<[string, unknown]> = []
  for (const [key, value] of Object.entries(incoming ?? {})) {
    if (isLocalSetting(key)) continue
    if (!sameValue(baselineSetting(snapshot, key), value)) changed.push([key, value])
  }
  if (changed.length > 0) {
    for (const [key, value] of changed) {
      upsertSettingsPending(classId, key, { settings: { [key]: value } }, '修改设置 · ' + (getDef(key)?.title ?? key))
    }
    mutateSnapshot(classId, (target) =>
      applySnapshotMutation(target, method, url, { settings: Object.fromEntries(changed) }),
    )
    refreshPending()
  }
  return { settings: incoming ?? {} }
}

async function handleLocalWrite(method: WriteMethod, url: string, body: unknown): Promise<unknown> {
  let classId = activeClassId()
  // 手动本地模式且还没有任何班级：先建空白看板，保证编辑能落进待同步队列
  if (!classId && ds.mode === 'local') classId = ensureLocalBoard().class.id
  if (!classId) throw new Error('本地缓存模式尚未选择班级，请先在线加载一次')
  const path = url.split('?')[0]
  if (path === '/board/settings' && method === 'patch') {
    return handleSettingsWrite(classId, method, url, body)
  }
  const kind = kindOf(url)
  const tempId = method === 'post' ? newTempId(kind) : undefined
  enqueuePending(classId, { kind, method, url, body, label: labelOf(kind, method), tempId })
  mutateSnapshot(classId, (snapshot) => applySnapshotMutation(snapshot, method, url, body, tempId))
  applyExtrasMutation(classId, method, url, body, tempId)
  refreshPending()
  return synthesise(method, url, body, classId, tempId)
}

function handleLocalRead(url: string, params?: Record<string, unknown>): unknown {
  const path = url.split('?')[0]
  let classId = activeClassId()
  // 手动本地模式：连空白看板都还没有时先建一份，避免读取回落到网络（未登录会被踢回欢迎页）
  if (!classId && ds.mode === 'local') classId = ensureLocalBoard().class.id
  if (!classId) return undefined

  // bootstrap 也读本地快照：设置页、模板页在本地模式下不应再去请求云端
  if (path === '/board/bootstrap') {
    const snapshot = getCacheClassSnapshot(classId)
    return snapshot ?? (JSON.parse(JSON.stringify(emptyBootstrap())) as BoardBootstrap)
  }

  if (url === '/board/attendance') {
    const saved = readAttendance(classId) as { date?: string; records?: unknown[] } | null
    if (saved && saved.records) return saved
    const snapshot = getCacheClassSnapshot(classId)
    const date = String(params?.date ?? snapshot?.date ?? todayString())
    return {
      date,
      records: (snapshot?.students ?? []).map((student) => ({
        studentId: student.id,
        status: 'present',
        note: null,
      })),
    }
  }

  const cached = findExtra(classId, url) as Record<string, unknown> | undefined
  if (COLLECTION_PATHS.includes(path)) {
    if (cached) return cached
    const snapshot = getCacheClassSnapshot(classId)
    if (path === '/board/students') return { items: snapshot?.students ?? [] }
    if (path === '/board/exams') return { items: snapshot?.exams ?? [] }
    return { items: [] }
  }
  if (cached) return cached

  // 手动本地模式：其余 /board/* 读接口一律用快照兜底，绝不回落到网络
  if (ds.mode === 'local' && path.startsWith('/board/')) {
    const snapshot = getCacheClassSnapshot(classId)
    if (path === '/board/settings') return { settings: snapshot?.settings ?? {} }
    if (path === '/board/homework') return { items: snapshot?.homework ?? [] }
    if (path === '/board/notices') return { items: snapshot?.notices ?? [], devices: [], deviceCount: 0 }
    return { items: [] }
  }
  return undefined
}

// ---------------- 待同步回放 ----------------

async function replay(item: PendingWrite, options?: { force?: boolean }): Promise<unknown> {
  setLocalWriteHook(null)
  try {
    let body: unknown = item.body
    if (options?.force && body && typeof body === 'object') {
      body = { ...(body as LocalBody), force: true }
    }
    if (item.method === 'post') return await postData(item.url, body)
    if (item.method === 'put') return await putData(item.url, body)
    if (item.method === 'patch') return await patchData(item.url, body)
    return await deleteData(item.url)
  } finally {
    setLocalWriteHook(isLocalMode() ? handleLocalWrite : null)
  }
}

export function pendingList(): PendingWrite[] {
  const classId = activeClassId()
  return classId ? listPending(classId) : []
}

/** 串行回放本地队列：本地优先覆盖云端冲突，4xx 丢弃，5xx/网络按退避重试 */
export async function flushPending(options?: { onlyReady?: boolean }): Promise<FlushResult> {
  const classId = activeClassId()
  const result: FlushResult = { synced: 0, dropped: 0, failed: 0, remaining: 0, conflicts: 0 }
  if (!classId) return result
  const now = Date.now()
  const readyIds = listPending(classId)
    .filter((item) => {
      if (!options?.onlyReady) return true
      return !item.nextRetryAt || Date.parse(item.nextRetryAt) <= now
    })
    .map((item) => item.id)

  for (const pendingId of readyIds) {
    // 每次重取，保证上一条回放触发的 tempId 重映射对后续条目生效
    const item = listPending(classId).find((entry) => entry.id === pendingId)
    if (!item) continue
    try {
      const response = await replay(item)
      removePending(classId, item.id)
      result.synced += 1
      if (item.tempId && response && typeof response === 'object') {
        const realId = String((response as LocalBody).id ?? '')
        if (realId && realId !== item.tempId) {
          remapPendingIds(classId, item.tempId, realId)
          remapSnapshotIds(classId, item.tempId, realId)
          remapExtraIds(classId, item.tempId, realId)
        }
      }
      continue
    } catch (error) {
      const status = (error as { status?: number }).status ?? 0
      const versionConflict =
        status === 409 && item.method === 'put' && item.url.startsWith('/board/homework') && !item.force
      if (versionConflict) {
        try {
          await replay(item, { force: true })
          removePending(classId, item.id)
          result.synced += 1
          result.conflicts += 1
          continue
        } catch {
          // 强制覆盖也失败，落到下面的失败处理
        }
      }
      if (status >= 400 && status < 500) {
        removePending(classId, item.id)
        result.dropped += 1
        continue
      }
      const tries = bumpPendingTries(classId, item.id)
      if (tries >= 5) {
        removePending(classId, item.id)
        result.failed += 1
      } else {
        updatePending(classId, item.id, { nextRetryAt: new Date(Date.now() + retryDelay(tries)).toISOString() })
        break
      }
    }
  }

  result.remaining = countPending(classId)
  refreshPending()
  return result
}

export function discardPending(): void {
  const classId = activeClassId()
  if (!classId) return
  clearPending(classId)
  refreshPending()
}

/** 应用启动时同步一次模式（settings 里的 server.provider 为云端真相） */
export function syncModeFromSettings(settings: Record<string, unknown> | undefined): void {
  const provider = settings?.['server.provider']
  if (provider === undefined) return
  const next = providerToMode(provider)
  if (next !== ds.mode) setMode(next)
}

export function initDataSource(): void {
  ds.mode = readStoredMode()
  ds.classId = readCacheFile().activeClassId
  applyHooks()
  refreshPending()
}

initDataSource()
// 在线读取成功后把集合类响应存一份，断网时可读
setReadNoteHook(noteRead)

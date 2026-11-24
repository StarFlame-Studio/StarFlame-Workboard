import { http, type ApiEnvelope } from './api'

/** 后台「班级看板」专用封装：直接复用 /api/board/*，classId 统一放 query */
export interface Subject {
  id: string
  code: string
  name: string
  color: string
  icon: string
  sortIndex: number
  enabled: boolean
}
export interface HomeworkItem {
  id: string | null
  subjectId: string
  content: string
  dueDate: string
  status?: string
  version: number
  updatedAt?: string
}
export interface ExamSubject {
  id?: string
  subjectId?: string | null
  name?: string | null
  startAt: string
  endAt: string
  room?: string | null
  note?: string | null
}
export interface Exam {
  id: string
  title: string
  note?: string | null
  room?: string | null
  status: 'planned' | 'finished'
  subjects: ExamSubject[]
}
export interface Student {
  id: string
  name: string
  studentNo?: string | null
  status: 'active' | 'left'
  sortIndex: number
}
export interface StudentList {
  id: string
  name: string
  isDefault: boolean
  studentCount: number
}
export interface Teacher {
  id: string
  name: string
  subject?: string | null
  isHeadTeacher?: boolean
}
export interface Notice {
  id: string
  title: string
  content: string
  level: 'info' | 'urgent'
  pinned: boolean
  /** 发布时是否弹窗提醒 */
  popup: boolean
  publishAt?: string
  expireAt?: string | null
  readAt?: string | null
  readCount?: number
  reads?: { deviceId: string; readAt: string }[]
}
export interface CustomCard {
  id: string
  title: string
  content: string
  sortIndex: number
}
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excluded'
export interface AttendanceRecord {
  studentId: string
  status: AttendanceStatus
  note?: string | null
}
export interface BoardBootstrap {
  class: { id: string; name: string; grade?: string | null; school?: string | null }
  settings: Record<string, unknown>
  date: string
  subjects: Subject[]
  homework: HomeworkItem[]
  exams: Exam[]
  notices: Notice[]
  students: Student[]
  customCards: CustomCard[]
}

async function call<T>(method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, classId: string, payload?: unknown): Promise<T> {
  const response = await http.request<ApiEnvelope<T>>({ method, url, params: { classId }, data: payload })
  return response.data.data
}

/* ---------------- 看板快照 / 作业 ---------------- */
export function getBootstrap(classId: string, date = '', includeDisabled = false): Promise<BoardBootstrap> {
  return http
    .get<ApiEnvelope<BoardBootstrap>>('/board/bootstrap', {
      params: { classId, date: date || undefined, includeDisabled: includeDisabled ? '1' : undefined },
    })
    .then((r) => r.data.data)
}

export function getHomework(classId: string, date: string) {
  return http.get<ApiEnvelope<{ date: string; items: HomeworkItem[] }>>('/board/homework', { params: { classId, date } }).then((r) => r.data.data)
}

export function saveHomework(classId: string, input: { subjectId: string; date: string; content: string; version?: number }) {
  return call<HomeworkItem>('put', '/board/homework', classId, input)
}

export function saveHomeworkBatch(classId: string, input: { date: string; items: Array<{ subjectId: string; content: string }> }) {
  return call<{ date: string; saved: number }>('put', '/board/homework/batch', classId, input)
}

/* ---------------- 科目 ---------------- */
export function createSubject(classId: string, name: string) {
  return call<Subject>('post', '/board/subjects', classId, { name })
}
export function updateSubject(classId: string, id: string, patch: Partial<Subject>) {
  return call<{ id: string }>('patch', '/board/subjects/' + id, classId, patch)
}
export function deleteSubject(classId: string, id: string) {
  return call<{ id: string }>('delete', '/board/subjects/' + id, classId)
}
export function reorderSubjects(classId: string, order: string[]) {
  return call<{ saved: number }>('patch', '/board/subjects-order', classId, { order })
}

/* ---------------- 花名册 / 名单 / 教师 ---------------- */
export function getStudents(classId: string, listId?: string, includeLeft = false) {
  return http
    .get<ApiEnvelope<{ items: Student[] }>>('/board/students', { params: { classId, listId: listId || undefined, includeLeft: includeLeft ? '1' : undefined } })
    .then((r) => r.data.data.items)
}
export function createStudent(classId: string, input: { name: string; studentNo?: string | null; listId?: string }) {
  return call<Student>('post', '/board/students', classId, input)
}
export function updateStudent(classId: string, id: string, patch: Partial<Student>) {
  return call<{ id: string }>('patch', '/board/students/' + id, classId, patch)
}
export function deleteStudent(classId: string, id: string) {
  return call<{ id: string }>('delete', '/board/students/' + id, classId)
}
export function importStudents(classId: string, text: string) {
  return call<{ imported: number }>('post', '/board/students/import', classId, { text })
}
export function getLists(classId: string) {
  return http.get<ApiEnvelope<{ items: StudentList[] }>>('/board/lists', { params: { classId } }).then((r) => r.data.data.items)
}
export function createList(classId: string, name: string) {
  return call<StudentList>('post', '/board/lists', classId, { name })
}
export function renameList(classId: string, id: string, name: string) {
  return call<{ id: string }>('patch', '/board/lists/' + id, classId, { name })
}
export function deleteList(classId: string, id: string) {
  return call<{ id: string }>('delete', '/board/lists/' + id, classId)
}
export function getTeachers(classId: string) {
  return http.get<ApiEnvelope<{ items: Teacher[] }>>('/board/teachers', { params: { classId } }).then((r) => r.data.data.items)
}
export function createTeacher(classId: string, input: { name: string; subject?: string | null }) {
  return call<Teacher>('post', '/board/teachers', classId, input)
}
export function deleteTeacher(classId: string, id: string) {
  return call<{ id: string }>('delete', '/board/teachers/' + id, classId)
}

/* ---------------- 考试 ---------------- */
export function getExams(classId: string) {
  return http.get<ApiEnvelope<{ items: Exam[] }>>('/board/exams', { params: { classId } }).then((r) => r.data.data.items)
}
export function createExam(classId: string, input: { title: string; note?: string | null; room?: string | null; subjects: ExamSubject[] }) {
  return call<{ id: string; title: string }>('post', '/board/exams', classId, input)
}
export function updateExam(classId: string, id: string, input: Record<string, unknown>) {
  return call<{ id: string }>('patch', '/board/exams/' + id, classId, input)
}
export function deleteExam(classId: string, id: string) {
  return call<{ id: string }>('delete', '/board/exams/' + id, classId)
}

/* ---------------- 考勤 ---------------- */
export function getAttendance(classId: string, date: string) {
  return http
    .get<ApiEnvelope<{ date: string; records: AttendanceRecord[] }>>('/board/attendance', { params: { classId, date } })
    .then((r) => r.data.data.records)
}
export function saveAttendance(classId: string, input: { date: string; records: AttendanceRecord[] }) {
  return call<{ date: string; saved: number }>('put', '/board/attendance', classId, input)
}

/* ---------------- 通知 / 自定义卡片 ---------------- */
export function getNotices(classId: string) {
  return http.get<ApiEnvelope<{ items: Notice[] }>>('/board/notices', { params: { classId } }).then((r) => r.data.data.items)
}
export function createNotice(classId: string, input: Record<string, unknown>) {
  return call<{ id: string }>('post', '/board/notices', classId, input)
}
export function updateNotice(classId: string, id: string, input: Record<string, unknown>) {
  return call<{ id: string }>('patch', '/board/notices/' + id, classId, input)
}
export function deleteNotice(classId: string, id: string) {
  return call<{ id: string }>('delete', '/board/notices/' + id, classId)
}
export function getCustomCards(classId: string) {
  return http.get<ApiEnvelope<{ items: CustomCard[] }>>('/board/custom-cards', { params: { classId } }).then((r) => r.data.data.items)
}
export function createCustomCard(classId: string, title: string) {
  return call<CustomCard>('post', '/board/custom-cards', classId, { title })
}
export function updateCustomCard(classId: string, id: string, patch: { title?: string; content?: string; sortIndex?: number }) {
  return call<{ id: string }>('patch', '/board/custom-cards/' + id, classId, patch)
}
export function deleteCustomCard(classId: string, id: string) {
  return call<{ id: string }>('delete', '/board/custom-cards/' + id, classId)
}

/* ---------------- 看板设置 ---------------- */
export function patchSettings(classId: string, settings: Record<string, unknown>) {
  return call<{ settings: Record<string, unknown> }>('patch', '/board/settings', classId, { settings })
}

/** 今日日期（本地时区，YYYY-MM-DD） */
export function todayString(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

/** 日期加减天数 */
export function shiftDate(date: string, days: number): string {
  const base = new Date(date + 'T00:00:00')
  base.setDate(base.getDate() + days)
  const offset = base.getTimezoneOffset() * 60000
  return new Date(base.getTime() - offset).toISOString().slice(0, 10)
}

/* ---------------- 授权码（/admin/* 管理接口） ---------------- */
export type AccessRole = 'terminal' | 'teacher' | 'student' | 'parent'
export type AccessPermission = 'read' | 'write'

export interface AccessCode {
  id: string
  classId: string
  code: string
  role: AccessRole
  permission: AccessPermission
  label: string | null
  enabled: boolean
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  device?: { id: string; name: string; lastSeenAt: string | null } | null
}

export interface AccessCodeInput {
  code?: string
  role: AccessRole
  permission: AccessPermission
  label?: string | null
  expiresAt?: string | null
  enabled?: boolean
}

export function getAccessCodes(classId: string) {
  return http
    .get<ApiEnvelope<{ items: AccessCode[]; total: number }>>('/admin/classes/' + classId + '/access-codes')
    .then((r) => r.data.data.items)
}

export function createAccessCode(classId: string, input: AccessCodeInput) {
  return http.post<ApiEnvelope<AccessCode>>('/admin/classes/' + classId + '/access-codes', input).then((r) => r.data.data)
}

export function updateAccessCode(id: string, patch: Partial<AccessCodeInput>) {
  return http.patch<ApiEnvelope<AccessCode>>('/admin/access-codes/' + id, patch).then((r) => r.data.data)
}

export function deleteAccessCode(id: string) {
  return http.delete<ApiEnvelope<{ deleted: boolean }>>('/admin/access-codes/' + id).then((r) => r.data.data)
}

/** 一键重置：换成系统随机新码，旧码立即失效，绑定该码的设备会被吊销 */
export function resetAccessCode(id: string) {
  return http
    .post<ApiEnvelope<AccessCode & { revokedDevices: number; disconnected: number }>>('/admin/access-codes/' + id + '/reset', {})
    .then((r) => r.data.data)
}

/* ---------------- 班级详情（含设置） ---------------- */
export function getClassDetail(classId: string) {
  return http
    .get<ApiEnvelope<{ id: string; name: string; settings: Record<string, unknown> | null }>>('/admin/classes/' + classId)
    .then((r) => r.data.data)
}

export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type UserRole = 'owner' | 'admin' | 'teacher'

export interface UserInfo {
  id: string
  username: string
  name: string
  role: UserRole
  avatarUrl: string | null
}

export interface ClassInfo {
  id: string
  name: string
  grade: string | null
  school: string | null
  status: 'active' | 'archived'
}

export interface SubjectInfo {
  id: string
  code: string
  name: string
  color: string | null
  icon: string | null
  sortIndex: number
  enabled: boolean
}

export interface HomeworkItem {
  id: string
  subjectId: string
  content: string
  dueDate: string
  status: 'draft' | 'published'
  version: number
  updatedAt: string
}

export interface StudentItem {
  id: string
  name: string
  studentNo: string | null
  status: 'active' | 'left'
  sortIndex: number
}

export interface NoticeItem {
  id: string
  title: string
  content: string
  level: 'info' | 'urgent'
  pinned: boolean
  publishAt: string
  expireAt: string | null
  /** 当前设备已读时间（未读为 null） */
  readAt?: string | null
  /** 已读设备数 */
  readCount?: number
}

export interface ExamSubjectItem {
  id: string
  subjectId: string
  startAt: string
  endAt: string
  room: string | null
  note: string | null
}

export interface ExamItem {
  id: string
  title: string
  note: string | null
  status: 'planned' | 'finished'
  subjects: ExamSubjectItem[]
}

export interface AttendanceRecordItem {
  studentId: string
  status: 'present' | 'absent' | 'late' | 'excluded'
  note: string | null
}

export interface DeviceInfo {
  id: string
  name: string
  isReadOnly: boolean
}

export interface BoardBootstrap {
  class: ClassInfo
  settings: Record<string, unknown>
  date: string
  subjects: SubjectInfo[]
  homework: HomeworkItem[]
  exams: ExamItem[]
  notices: NoticeItem[]
  students: StudentItem[]
  stats: { studentCount: number; homeworkCount: number; hasAttendanceToday: boolean }
}

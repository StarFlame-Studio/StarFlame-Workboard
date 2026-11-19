import {
  boolean,
  char,
  date,
  datetime,
  index,
  timestamp,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { sql } from 'drizzle-orm'

const id = () => char('id', { length: 26 }).primaryKey()
const currentTimestamp = () => sql.raw('CURRENT_TIMESTAMP(3)')

const createdAt = () => timestamp('created_at', { fsp: 3 }).notNull().default(currentTimestamp())
const updatedAt = () => timestamp('updated_at', { fsp: 3 }).notNull().default(currentTimestamp()).$onUpdate(() => new Date())

export const users = mysqlTable(
  'users',
  {
    id: id(),
    username: varchar('username', { length: 32 }).notNull(),
    email: varchar('email', { length: 128 }),
    passwordHash: varchar('password_hash', { length: 100 }).notNull(),
    name: varchar('name', { length: 32 }).notNull(),
    role: mysqlEnum('role', ['owner', 'admin', 'teacher']).notNull().default('teacher'),
    avatarUrl: varchar('avatar_url', { length: 255 }),
    status: mysqlEnum('status', ['active', 'disabled']).notNull().default('active'),
    lastLoginAt: datetime('last_login_at', { fsp: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('uk_users_username').on(t.username), uniqueIndex('uk_users_email').on(t.email)],
)

export const refreshTokens = mysqlTable(
  'refresh_tokens',
  {
    id: id(),
    subjectType: mysqlEnum('subject_type', ['user', 'device']).notNull(),
    subjectId: char('subject_id', { length: 26 }).notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    expiresAt: datetime('expires_at', { fsp: 3 }).notNull(),
    revokedAt: datetime('revoked_at', { fsp: 3 }),
    userAgent: varchar('user_agent', { length: 255 }),
    ip: varchar('ip', { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('uk_rt_hash').on(t.tokenHash), index('idx_rt_subject').on(t.subjectType, t.subjectId)],
)

export const classes = mysqlTable(
  'classes',
  {
    id: id(),
    name: varchar('name', { length: 64 }).notNull(),
    grade: varchar('grade', { length: 16 }),
    school: varchar('school', { length: 128 }),
    /** 班级码：前端登录用 */
    classCode: varchar('class_code', { length: 32 }).notNull(),
    /** 班级ID：后台「添加班级」用，需谨慎保存 */
    classUid: varchar('class_uid', { length: 32 }).notNull(),
    /** 旧版绑定码，已弃用 */
    joinCode: varchar('join_code', { length: 12 }),
    /** 旧版班级密码，已弃用 */
    passwordHash: varchar('password_hash', { length: 100 }),
    ownerId: char('owner_id', { length: 26 })
      .notNull()
      .references(() => users.id),
    settings: json('settings'),
    status: mysqlEnum('status', ['active', 'archived']).notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('uk_classes_class_code').on(t.classCode),
    uniqueIndex('uk_classes_class_uid').on(t.classUid),
    uniqueIndex('uk_classes_join_code').on(t.joinCode),
    index('idx_classes_owner').on(t.ownerId),
  ],
)

export const subjects = mysqlTable(
  'subjects',
  {
    id: id(),
    classId: char('class_id', { length: 26 })
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 32 }).notNull(),
    color: varchar('color', { length: 16 }),
    icon: varchar('icon', { length: 64 }),
    sortIndex: int('sort_index').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('uk_subjects_class_code').on(t.classId, t.code)],
)

export const teachers = mysqlTable(
  'teachers',
  {
    id: id(),
    classId: char('class_id', { length: 26 })
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 32 }).notNull(),
    subject: varchar('subject', { length: 32 }),
    isHeadTeacher: boolean('is_head_teacher').notNull().default(false),
    sortIndex: int('sort_index').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_teachers_class').on(t.classId, t.sortIndex)],
)

export const studentLists = mysqlTable(
  'student_lists',
  {
    id: id(),
    classId: char('class_id', { length: 26 })
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 32 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    sortIndex: int('sort_index').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_lists_class').on(t.classId, t.sortIndex)],
)

export const students = mysqlTable(
  'students',
  {
    id: id(),
    classId: char('class_id', { length: 26 })
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    listId: char('list_id', { length: 26 }),
    name: varchar('name', { length: 32 }).notNull(),
    pinyin: varchar('pinyin', { length: 64 }),
    studentNo: varchar('student_no', { length: 16 }),
    status: mysqlEnum('status', ['active', 'left']).notNull().default('active'),
    sortIndex: int('sort_index').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_students_class').on(t.classId, t.status, t.sortIndex)],
)

export const homework = mysqlTable(
  'homework',
  {
    id: id(),
    classId: char('class_id', { length: 26 })
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: char('subject_id', { length: 26 })
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    content: text('content'),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    status: mysqlEnum('status', ['draft', 'published']).notNull().default('published'),
    pinned: boolean('pinned').notNull().default(false),
    version: int('version').notNull().default(1),
    updatedBy: char('updated_by', { length: 26 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('uk_homework').on(t.classId, t.subjectId, t.dueDate),
    index('idx_homework_class_date').on(t.classId, t.dueDate),
  ],
)

export const exams = mysqlTable(
  'exams',
  {
    id: id(),
    classId: char('class_id', { length: 26 })
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 64 }).notNull(),
    note: varchar('note', { length: 255 }),
    room: varchar('room', { length: 64 }),
    status: mysqlEnum('status', ['planned', 'finished']).notNull().default('planned'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_exams_class').on(t.classId, t.status)],
)

export const examSubjects = mysqlTable(
  'exam_subjects',
  {
    id: id(),
    examId: char('exam_id', { length: 26 })
      .notNull()
      .references(() => exams.id, { onDelete: 'cascade' }),
    subjectId: char('subject_id', { length: 26 }),
    name: varchar('name', { length: 32 }),
    startAt: datetime('start_at', { fsp: 3 }).notNull(),
    endAt: datetime('end_at', { fsp: 3 }).notNull(),
    room: varchar('room', { length: 64 }),
    note: varchar('note', { length: 255 }),
    sortIndex: int('sort_index').notNull().default(0),
  },
  (t) => [index('idx_es_exam').on(t.examId, t.startAt)],
)

export const customCards = mysqlTable(
  'custom_cards',
  {
    id: id(),
    classId: char('class_id', { length: 26 })
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 32 }).notNull(),
    content: text('content'),
    sortIndex: int('sort_index').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_custom_class').on(t.classId, t.sortIndex)],
)

export const attendanceRecords = mysqlTable(
  'attendance_records',
  {
    id: id(),
    classId: char('class_id', { length: 26 })
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    studentId: char('student_id', { length: 26 }).notNull(),
    status: mysqlEnum('status', ['present', 'absent', 'late', 'excluded']).notNull().default('present'),
    note: varchar('note', { length: 255 }),
    updatedBy: char('updated_by', { length: 26 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('uk_attendance').on(t.classId, t.date, t.studentId),
    index('idx_attendance_class_date').on(t.classId, t.date),
  ],
)

export const notices = mysqlTable(
  'notices',
  {
    id: id(),
    classId: char('class_id', { length: 26 })
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 64 }).notNull(),
    content: text('content'),
    level: mysqlEnum('level', ['info', 'urgent']).notNull().default('info'),
    pinned: boolean('pinned').notNull().default(false),
    publishAt: timestamp('publish_at', { fsp: 3 }).notNull().default(currentTimestamp()),
    expireAt: datetime('expire_at', { fsp: 3 }),
    createdBy: char('created_by', { length: 26 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_notices_class').on(t.classId, t.pinned, t.publishAt)],
)

export const noticeReads = mysqlTable(
  'notice_reads',
  {
    noticeId: char('notice_id', { length: 26 })
      .notNull()
      .references(() => notices.id, { onDelete: 'cascade' }),
    deviceId: char('device_id', { length: 26 })
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    readAt: datetime('read_at', { fsp: 3 }).notNull().default(currentTimestamp()),
  },
  (t) => [primaryKey({ columns: [t.noticeId, t.deviceId] }), index('idx_notice_reads_device').on(t.deviceId)],
)

export const classAccessCodes = mysqlTable(
  'class_access_codes',
  {
    id: id(),
    classId: char('class_id', { length: 26 })
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 32 }).notNull(),
    role: mysqlEnum('role', ['terminal', 'teacher', 'student', 'parent']).notNull().default('terminal'),
    permission: mysqlEnum('permission', ['read', 'write']).notNull().default('read'),
    label: varchar('label', { length: 64 }),
    enabled: boolean('enabled').notNull().default(true),
    expiresAt: datetime('expires_at', { fsp: 3 }),
    lastUsedAt: datetime('last_used_at', { fsp: 3 }),
    createdBy: char('created_by', { length: 26 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('uk_access_class_code').on(t.classId, t.code),
    index('idx_access_class').on(t.classId, t.createdAt),
  ],
)

export const classMembers = mysqlTable(
  'class_members',
  {
    classId: char('class_id', { length: 26 })
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    userId: char('user_id', { length: 26 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: mysqlEnum('role', ['owner', 'teacher']).notNull().default('teacher'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.userId] }), index('idx_members_user').on(t.userId)],
)

export const devices = mysqlTable(
  'devices',
  {
    id: id(),
    classId: char('class_id', { length: 26 })
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 64 }).notNull(),
    uuid: char('uuid', { length: 36 }).notNull(),
    tokenHash: char('token_hash', { length: 64 }),
    accessCodeId: char('access_code_id', { length: 26 }),
    role: mysqlEnum('role', ['terminal', 'teacher', 'student', 'parent', 'guest']).notNull().default('terminal'),
    permission: mysqlEnum('permission', ['read', 'write']).notNull().default('write'),
    isReadOnly: boolean('is_read_only').notNull().default(false),
    userAgent: varchar('user_agent', { length: 255 }),
    lastSeenAt: datetime('last_seen_at', { fsp: 3 }),
    status: mysqlEnum('status', ['active', 'revoked']).notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('uk_devices_uuid').on(t.uuid), index('idx_devices_class').on(t.classId, t.status)],
)

export const uploadAssets = mysqlTable(
  'upload_assets',
  {
    id: id(),
    classId: char('class_id', { length: 26 }),
    ownerType: mysqlEnum('owner_type', ['user', 'device']).notNull(),
    ownerId: char('owner_id', { length: 26 }).notNull(),
    objectKey: varchar('object_key', { length: 255 }).notNull(),
    url: varchar('url', { length: 512 }).notNull(),
    size: int('size').notNull().default(0),
    mime: varchar('mime', { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [index('idx_upload_class').on(t.classId, t.createdAt)],
)

export const auditLogs = mysqlTable(
  'audit_logs',
  {
    id: id(),
    actorType: mysqlEnum('actor_type', ['user', 'device', 'system']).notNull(),
    actorId: char('actor_id', { length: 26 }),
    classId: char('class_id', { length: 26 }),
    action: varchar('action', { length: 64 }).notNull(),
    target: varchar('target', { length: 128 }),
    detail: json('detail'),
    ip: varchar('ip', { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [index('idx_audit_time').on(t.createdAt), index('idx_audit_class').on(t.classId, t.createdAt)],
)

export const systemSettings = mysqlTable('system_settings', {
  skey: varchar('skey', { length: 64 }).primaryKey(),
  value: json('value'),
  updatedAt: updatedAt(),
})

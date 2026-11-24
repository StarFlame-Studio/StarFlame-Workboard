import { z } from 'zod'

const code = (min: number, max: number, field: string) =>
  z
    .string()
    .trim()
    .min(min, field + '至少 ' + min + ' 位')
    .max(max, field + '最多 ' + max + ' 位')
    .regex(/^[\x21-\x7E]+$/, field + '只能使用字母、数字与符号（不含空格）')

export const passwordSchema = z
  .string()
  .min(8, '密码至少 8 位')
  .max(64, '密码最多 64 位')
  .regex(/[A-Za-z]/, '密码需包含字母')
  .regex(/\d/, '密码需包含数字')

export const loginSchema = z
  .object({
    account: z.string().trim().min(3, '请输入账号').max(128).optional(),
    username: z.string().trim().min(3).max(128).optional(),
    password: z.string().min(1, '请输入密码').max(64),
  })
  .refine((v) => Boolean((v.account ?? v.username)?.trim()), { message: '请输入账号', path: ['account'] })

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('邮箱格式不正确').max(128),
  password: passwordSchema,
  name: z.string().trim().min(1).max(32).optional(),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
})

export const deviceLoginSchema = z.object({
  classCode: code(4, 32, '班级码'),
  /** 留空即游客只读登录（是否允许由班级设置 access.guestEnabled 决定，缺省开启） */
  accessCode: code(6, 32, '授权码').optional().or(z.literal('')),
  deviceName: z.string().trim().max(64).optional(),
  uuid: z.string().uuid('设备标识无效').optional(),
})

/** 设备对远程指令的执行回执（目前仅用于「卸载指令已送达」这类确认） */
export const deviceCommandAckSchema = z.object({
  id: z.string().trim().max(64).optional(),
  type: z.string().trim().min(1).max(32),
  status: z.enum(['done', 'unsupported', 'failed']),
  message: z.string().trim().max(200).optional(),
})

export const homeworkUpsertSchema = z.object({
  subjectId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
  content: z.string().max(4000, '作业内容过长').default(''),
  version: z.number().int().nonnegative().optional(),
  /** 离线回放专用：true 时忽略 version 乐观锁，直接覆盖云端内容 */
  force: z.boolean().optional(),
})

export const homeworkBatchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(z.object({ subjectId: z.string().min(1), content: z.string().max(4000) })).max(30),
})

export const studentCreateSchema = z.object({
  name: z.string().trim().min(1, '姓名不能为空').max(32),
  studentNo: z.string().trim().max(16).optional().nullable(),
})

export const studentUpdateSchema = z.object({
  name: z.string().trim().min(1).max(32).optional(),
  studentNo: z.string().trim().max(16).optional().nullable(),
  status: z.enum(['active', 'left']).optional(),
  sortIndex: z.number().int().optional(),
})

export const studentImportSchema = z.object({
  text: z.string().min(1, '导入内容为空').max(20000),
})

export const noticeCreateSchema = z.object({
  title: z.string().trim().max(64).default(''),
  content: z.string().max(2000).default(''),
  level: z.enum(['info', 'urgent']).default('info'),
  pinned: z.boolean().default(false),
  /** 发布时是否在大屏弹窗提醒；与 pinned 至少开启一项 */
  popup: z.boolean().default(true),
  expireAt: z.string().datetime().nullable().optional(),
})

export const noticeUpdateSchema = noticeCreateSchema.partial()

/** 后台群发：同一份通知内容一次发到多个班级 */
export const noticeBroadcastSchema = z.object({
  classIds: z
    .array(z.string().trim().min(1))
    .min(1, '请至少选择一个班级')
    .max(200, '一次最多选择 200 个班级'),
  title: z.string().trim().max(64).default(''),
  content: z.string().max(2000).default(''),
  level: z.enum(['info', 'urgent']).default('info'),
  pinned: z.boolean().default(false),
  popup: z.boolean().default(true),
  expireAt: z.string().datetime().nullable().optional(),
})

/** 后台批量：每个班级各一条独立通知内容 */
export const noticeBatchItemSchema = z.object({
  classId: z.string().trim().min(1, '请选择班级'),
  title: z.string().trim().max(64).default(''),
  content: z.string().max(2000).default(''),
  level: z.enum(['info', 'urgent']).default('info'),
  pinned: z.boolean().default(false),
  popup: z.boolean().default(true),
  expireAt: z.string().datetime().nullable().optional(),
})

export const noticeBatchSchema = z.object({
  items: z
    .array(noticeBatchItemSchema)
    .min(1, '请至少填写一条通知')
    .max(200, '一次最多提交 200 条通知'),
})

/** 后台批量删除已发送的通知 */
export const noticeDeleteBatchSchema = z.object({
  ids: z
    .array(z.string().trim().min(1))
    .min(1, '请至少选择一条通知')
    .max(200, '一次最多删除 200 条通知'),
})

export const examSubjectSchema = z.object({
  subjectId: z.string().min(1).nullable().optional(),
  name: z.string().trim().max(32).nullable().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  room: z.string().max(64).nullable().optional(),
  note: z.string().max(255).nullable().optional(),
})

export const examCreateSchema = z.object({
  title: z.string().trim().min(1, '考试名称不能为空').max(64),
  note: z.string().max(255).nullable().optional(),
  room: z.string().max(64).nullable().optional(),
  subjects: z.array(examSubjectSchema).min(1, '至少安排一科'),
})

export const examUpdateSchema = z.object({
  title: z.string().trim().min(1).max(64).optional(),
  note: z.string().max(255).nullable().optional(),
  status: z.enum(['planned', 'finished']).optional(),
  subjects: z.array(examSubjectSchema).optional(),
})

export const attendanceSaveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(['present', 'absent', 'late', 'excluded']),
        note: z.string().max(255).nullable().optional(),
      }),
    )
    .max(200),
})

export const boardSettingsSchema = z.object({
  settings: z.record(z.unknown()),
})

export const uploadTokenSchema = z.object({
  fileName: z.string().min(1).max(128),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  size: z.number().int().positive().max(10 * 1024 * 1024, '单文件不能超过 10MB'),
})

export const classCreateSchema = z.object({
  name: z.string().trim().min(1, '班级名称不能为空').max(64),
  grade: z.string().trim().max(16).optional().nullable(),
  school: z.string().trim().max(128).optional().nullable(),
  classCode: code(4, 32, '班级码'),
  classUid: code(4, 32, '班级ID'),
  ownerId: z.string().min(1).optional(),
})

export const classUpdateSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  grade: z.string().trim().max(16).nullable().optional(),
  school: z.string().trim().max(128).nullable().optional(),
  status: z.enum(['active', 'archived']).optional(),
  classCode: code(4, 32, '班级码').optional(),
  classUid: code(4, 32, '班级ID').optional(),
  settings: z.record(z.unknown()).optional(),
})

export const classJoinSchema = z.object({
  classUid: code(4, 32, '班级ID'),
})

export const accessCodeCreateSchema = z.object({
  code: code(6, 32, '授权码').optional(),
  role: z.enum(['terminal', 'teacher', 'student', 'parent']),
  permission: z.enum(['read', 'write']),
  label: z.string().trim().max(64).optional().nullable(),
  expiresAt: z.string().datetime().nullable().optional(),
  enabled: z.boolean().optional(),
})

export const accessCodeUpdateSchema = z.object({
  code: code(6, 32, '授权码').optional(),
  role: z.enum(['terminal', 'teacher', 'student', 'parent']).optional(),
  permission: z.enum(['read', 'write']).optional(),
  label: z.string().trim().max(64).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  enabled: z.boolean().optional(),
})

export const userCreateSchema = z.object({
  username: z.string().trim().min(3).max(32),
  email: z.string().trim().toLowerCase().email('邮箱格式不正确').max(128).optional(),
  password: z.string().min(6, '密码至少 6 位').max(64),
  name: z.string().trim().min(1).max(32),
  role: z.enum(['owner', 'admin', 'teacher']).default('teacher'),
})

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(32).optional(),
  email: z.string().trim().toLowerCase().email('邮箱格式不正确').max(128).nullable().optional(),
  role: z.enum(['owner', 'admin', 'teacher']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  password: z.string().min(6).max(64).optional(),
})

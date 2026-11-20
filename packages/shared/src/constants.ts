export const API_PREFIX = '/api'

/**
 * 产品版本号：全站唯一来源（网页端页脚、设置「关于」、桌面端窗口与安装器都读这里）。
 * 升级版本时只改这一处 + apps/desktop/package.json 的 version。
 */
export const APP_VERSION = '1.1.6'
/** 数字版本号（用于 Electron / Android 风格的整数比较） */
export const APP_VERSION_CODE = 116

export const HEADER_DEVICE_TOKEN = 'x-device-token'
export const HEADER_REQUEST_ID = 'x-request-id'

export const ACCESS_TOKEN_STORAGE_KEY = 'sf.accessToken'
export const REFRESH_TOKEN_STORAGE_KEY = 'sf.refreshToken'
export const DEVICE_TOKEN_STORAGE_KEY = 'sf.deviceToken'
export const BOARD_CACHE_DB = 'starflame-board'

export const ERROR_CODE = {
  OK: 0,
  BAD_REQUEST: 40001,
  UNAUTHORIZED: 40100,
  BAD_CREDENTIALS: 40101,
  /** 班级码或授权码错误（不区分，防枚举） */
  BAD_BIND_CODE: 40102,
  FORBIDDEN: 40300,
  /** 授权码已停用 */
  ACCESS_DISABLED: 40301,
  /** 授权码已过期 */
  ACCESS_EXPIRED: 40302,
  /** 只读授权码尝试写入 */
  READ_ONLY: 40303,
  NOT_FOUND: 40400,
  /** 班级ID不存在 */
  CLASS_NOT_FOUND: 40403,
  CONFLICT: 40900,
  /** 班级码已被占用 */
  CLASS_CODE_TAKEN: 40901,
  /** 班级ID已被占用 */
  CLASS_UID_TAKEN: 40902,
  /** 授权码已被占用 */
  ACCESS_CODE_TAKEN: 40903,
  /** 班级未开启游客登录（只输班级码登录） */
  GUEST_DISABLED: 40304,
  RATE_LIMITED: 42900,
  INTERNAL: 50000,
} as const

export type ErrorCodeValue = (typeof ERROR_CODE)[keyof typeof ERROR_CODE]

export const DEFAULT_SUBJECTS = [
  { code: 'chinese', name: '语文', color: '#FF6B2C', icon: 'mdi-book-open-page-variant' },
  { code: 'math', name: '数学', color: '#4C8DFF', icon: 'mdi-function-variant' },
  { code: 'english', name: '英语', color: '#37C6A6', icon: 'mdi-alphabetical' },
  { code: 'physics', name: '物理', color: '#8E7CFF', icon: 'mdi-atom' },
  { code: 'chemistry', name: '化学', color: '#41B883', icon: 'mdi-flask-outline' },
  { code: 'biology', name: '生物', color: '#7DC242', icon: 'mdi-leaf' },
  { code: 'politics', name: '政治', color: '#E05A5A', icon: 'mdi-account-group-outline' },
  { code: 'history', name: '历史', color: '#C08B4B', icon: 'mdi-bank-outline' },
  { code: 'geography', name: '地理', color: '#3FA9F5', icon: 'mdi-earth' },
  { code: 'other', name: '其他', color: '#8A93A6', icon: 'mdi-dots-horizontal-circle-outline' },
] as const

export const DEFAULT_BOARD_SETTINGS = {
  theme: 'paper' as 'paper' | 'ink',
  showTime: true,
  showHitokoto: true,
  showExam: true,
  showAttendance: true,
  showNotice: true,
  clock12h: false,
  fontScale: 1,
  columns: 4,
  subjectOrder: [] as string[],
  hitokotoInterval: 300,
}

export type BoardSettings = typeof DEFAULT_BOARD_SETTINGS

export const ATTENDANCE_STATUS = ['present', 'absent', 'late', 'excluded'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number]

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: '出勤',
  absent: '请假',
  late: '迟到',
  excluded: '不参与',
}

/** 授权码身份 */
export const ACCESS_ROLES = ['terminal', 'teacher', 'student', 'parent'] as const
export type AccessRole = (typeof ACCESS_ROLES)[number]

export const ACCESS_ROLE_LABEL: Record<AccessRole, string> = {
  terminal: '一体机',
  teacher: '老师',
  student: '学生',
  parent: '家长',
}

/** 不填授权码时的设备类型 */
export const GUEST_ROLE = 'guest' as const
export const GUEST_ROLE_LABEL = '游客'
/** 设备身份 = 授权码身份 + 游客 */
export type DeviceRole = AccessRole | typeof GUEST_ROLE

export const DEVICE_ROLE_LABEL: Record<DeviceRole, string> = {
  ...ACCESS_ROLE_LABEL,
  guest: GUEST_ROLE_LABEL,
}

/** 班级设置里控制「只输班级码即可游客只读登录」的键（缺省=开启） */
export const SETTING_GUEST_LOGIN = 'access.guestEnabled'

/** 授权码权限 */
export const ACCESS_PERMISSIONS = ['read', 'write'] as const
export type AccessPermission = (typeof ACCESS_PERMISSIONS)[number]

export const ACCESS_PERMISSION_LABEL: Record<AccessPermission, string> = {
  read: '只读',
  write: '读写',
}

/** 班级码 / 班级ID / 授权码：字母、数字与符号（不含空格与控制字符） */
export const CODE_PATTERN = /^[\x21-\x7E]+$/
export const CODE_HINT = '只能使用字母、数字与符号（不含空格）'
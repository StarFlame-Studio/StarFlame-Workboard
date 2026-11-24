/**
 * 看板「自动日期切换」的纯逻辑。
 *
 * 规则：
 * 1. 每天第一节课开始前，自动显示「最近一个有作业的日期」
 *    （早上作业通常还没布置，先把上一次的作业留在屏幕上）；
 * 2. 第一节课开始之后，自动切回当天；
 * 3. 当天不上课（作息时间里这一天被关掉）时，一整天都显示最近有作业的日期。
 *
 * 时间、设置、有作业的日期列表都由调用方传入，方便测试。
 */

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type AutoDateDayKey = (typeof DAY_KEYS)[number]

export type AutoDateReason = 'before-first-class' | 'first-class-started' | 'no-class'

export interface AutoDateResult {
  /** 自动逻辑希望看板显示的日期（yyyy-mm-dd） */
  date: string
  /** 为什么选这一天，仅用于调试 / 日志 */
  reason: AutoDateReason
}

interface DayScheduleLike {
  start?: unknown
  end?: unknown
}

interface ClassPeriodLike {
  start?: unknown
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
/** 带捕获组的同款正则，用于拆分年 / 月 / 日（DATE_RE 没有捕获组，不能直接取 match[1]） */
const DATE_PARTS_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** 本机日历日期 yyyy-mm-dd（不能用 toISOString，东八区零点会跑到前一天） */
export function formatLocalDate(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return yyyy + '-' + mm + '-' + dd
}

export function isDateString(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value)
}

/** 日期字符串对应的作息键（周一 = mon … 周日 = sun） */
export function dayKeyOf(dateString: string): AutoDateDayKey {
  const match = DATE_PARTS_RE.exec(dateString)
  if (!match) return 'mon'
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return DAY_KEYS[date.getDay()]
}

/** '8:5' / '08:05' 之类统一成「当天分钟数」；非法返回 null */
function minutesOf(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

function weeklyOf(settings: Record<string, unknown>): Record<string, DayScheduleLike | null> {
  const raw = settings['schedule.weekly']
  return raw && typeof raw === 'object' ? (raw as Record<string, DayScheduleLike | null>) : {}
}

function periodsOf(settings: Record<string, unknown>): Record<string, ClassPeriodLike[]> {
  const raw = settings['schedule.periods']
  return raw && typeof raw === 'object' ? (raw as Record<string, ClassPeriodLike[]>) : {}
}

/**
 * 这一天是否上课。
 * - 作息里没有这一天（undefined）：说明班级还没配作息，按「上课」处理，避免刚装好就切到旧作业日；
 * - 这一天是 null：作息里显式关掉了这一天 = 不上课；
 * - 有起止时间且合法：上课。
 */
export function hasClassOn(settings: Record<string, unknown>, dateString: string): boolean {
  const day = weeklyOf(settings)[dayKeyOf(dateString)]
  if (day === undefined) return true
  if (day === null) return false
  return minutesOf(day.start) !== null && minutesOf(day.end) !== null
}

/**
 * 当天第一节课的开始时间（分钟数）。
 * 优先用 schedule.periods 里最早的一节，没配节次时回退到作息的上学时间。
 */
export function firstClassStartMinutes(
  settings: Record<string, unknown>,
  dateString: string,
): number | null {
  const key = dayKeyOf(dateString)
  const periods = periodsOf(settings)[key]
  let best: number | null = null
  if (Array.isArray(periods)) {
    for (const item of periods) {
      const start = minutesOf(item?.start)
      if (start !== null && (best === null || start < best)) best = start
    }
  }
  if (best !== null) return best
  const day = weeklyOf(settings)[key]
  return day ? minutesOf(day.start) : null
}

/**
 * 最近一个有作业的日期：只在「今天及以前」里找（未来的作业日期不算，
 * 否则早上会显示成明天 / 后天的作业）。
 */
export function pickNearestHomeworkDate(dates: string[], today: string): string | null {
  let best: string | null = null
  for (const item of dates) {
    if (!isDateString(item) || item > today) continue
    if (best === null || item > best) best = item
  }
  return best
}

/**
 * 计算自动逻辑希望看板显示的日期。
 * - 今天不上课 → 最近有作业的日期（没有就停在今天）；
 * - 今天上课且还没到第一节课 → 最近有作业的日期（没有就停在今天）；
 * - 第一节课开始后 → 今天。
 */
export function resolveAutoBoardDate(input: {
  settings: Record<string, unknown>
  homeworkDates: string[]
  now?: Date
}): AutoDateResult {
  const now = input.now ?? new Date()
  const today = formatLocalDate(now)

  if (!hasClassOn(input.settings, today)) {
    return { date: pickNearestHomeworkDate(input.homeworkDates, today) ?? today, reason: 'no-class' }
  }

  const firstStart = firstClassStartMinutes(input.settings, today)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  if (firstStart !== null && nowMinutes < firstStart) {
    return {
      date: pickNearestHomeworkDate(input.homeworkDates, today) ?? today,
      reason: 'before-first-class',
    }
  }
  return { date: today, reason: 'first-class-started' }
}

/**
 * 课铃偏移。
 *
 * 作息时间表（schedule.weekly / schedule.periods）记录的是学校「官方时间」，
 * 而课铃常常比官方时间提前或延后响：
 * - 正数 = 提前响铃（铃声早于作息时间）；
 * - 负数 = 延后响铃。
 *
 * 主页的时间卡里，时钟与作息时间文字保持原样不变，只有「距离放学」的倒计时
 * 与进度条跟随课铃时间（提前/延后多少秒，倒计时就提前/延后多少秒归零）。
 */

/** 偏移秒数的上下限（±30 分钟） */
export const BELL_OFFSET_MIN = -1800
export const BELL_OFFSET_MAX = 1800

export interface BellOffsetConfig {
  /** 课铃偏移（秒，正数提前 / 负数延后） */
  seconds: number
}

/** 把任意输入收敛成 -1800 ~ 1800 的整数秒；非法值返回 fallback */
export function normalizeBellOffset(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  const rounded = Math.round(num)
  return Math.min(BELL_OFFSET_MAX, Math.max(BELL_OFFSET_MIN, rounded))
}

/** 从班级设置里读出课铃偏移配置 */
export function readBellOffsetConfig(settings: Record<string, unknown>): BellOffsetConfig {
  return { seconds: normalizeBellOffset(settings['schedule.bellOffset']) }
}

/** 把秒数写成「5 分 30 秒」这种可读时长 */
export function formatBellDuration(totalSeconds: number): string {
  const value = Math.abs(Math.round(totalSeconds))
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  if (minutes > 0 && seconds > 0) return minutes + ' 分 ' + seconds + ' 秒'
  if (minutes > 0) return minutes + ' 分钟'
  return seconds + ' 秒'
}

/** 课铃偏移的可读描述，例如「提前 5 分 30 秒」/「延后 3 分钟」/「无偏移」 */
export function describeBellOffset(offset: number): string {
  if (!offset) return '无偏移'
  const text = formatBellDuration(offset)
  return offset > 0 ? '提前 ' + text : '延后 ' + text
}

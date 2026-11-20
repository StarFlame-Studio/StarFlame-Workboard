/**
 * 课铃偏移。
 *
 * 作息时间表（schedule.weekly / schedule.periods）记录的是学校「官方时间」，
 * 而课铃常常比官方时间提前或延后响：
 * - 正数 = 提前响铃（铃声早于作息时间）；
 * - 负数 = 延后响铃。
 *
 * 主页的时间卡里，时钟与作息时间文字保持原样不变，只有「距离放学」的倒计时
 * 与进度条跟随课铃时间（提前/延后多少分钟，倒计时就提前/延后多少分钟归零）。
 *
 * 「每天自动调整」开启后，可以按周几分别设置偏移，每天自动套用当天的值；
 * 某天没有单独填写时沿用统一偏移。
 */

/** 与 schedule.weekly 一致：JS Date.getDay() 的下标顺序 */
export const BELL_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type BellDayKey = (typeof BELL_DAY_KEYS)[number]

/** 偏移分钟数的上下限 */
export const BELL_OFFSET_MIN = -60
export const BELL_OFFSET_MAX = 60

export interface BellOffsetConfig {
  /** 是否启用「每天自动调整」 */
  auto: boolean
  /** 统一课铃偏移（分钟，正数提前 / 负数延后） */
  global: number
  /** 每天的课铃偏移（仅 auto 时生效，缺失的日子沿用 global） */
  days: Record<string, number>
}

/** 把任意输入收敛成 -60 ~ 60 的整数分钟；非法值返回 fallback */
export function normalizeBellOffset(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  const rounded = Math.round(num)
  return Math.min(BELL_OFFSET_MAX, Math.max(BELL_OFFSET_MIN, rounded))
}

/** 从班级设置里读出课铃偏移配置 */
export function readBellOffsetConfig(settings: Record<string, unknown>): BellOffsetConfig {
  const days: Record<string, number> = {}
  const raw = settings['schedule.bellOffsets']
  if (raw && typeof raw === 'object') {
    const source = raw as Record<string, unknown>
    for (const key of BELL_DAY_KEYS) {
      const value = source[key]
      if (value === undefined || value === null || value === '') continue
      const parsed = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(parsed)) continue
      days[key] = normalizeBellOffset(parsed)
    }
  }
  return {
    auto: settings['schedule.bellOffsetAuto'] === true,
    global: normalizeBellOffset(settings['schedule.bellOffset']),
    days,
  }
}

/** 某一天的课铃偏移（分钟，正数提前 / 负数延后） */
export function bellOffsetForDay(config: BellOffsetConfig, dayKey: string): number {
  if (config.auto && config.days[dayKey] !== undefined) return config.days[dayKey]
  return config.global
}

/** 指定日期对应的课铃偏移 */
export function bellOffsetForDate(config: BellOffsetConfig, date: Date): number {
  return bellOffsetForDay(config, BELL_DAY_KEYS[date.getDay()] ?? 'mon')
}

/** 课铃偏移的可读描述，例如「提前 5 分钟」/「延后 3 分钟」/「无偏移」 */
export function describeBellOffset(offset: number): string {
  if (!offset) return '无偏移'
  return offset > 0 ? '提前 ' + offset + ' 分钟' : '延后 ' + Math.abs(offset) + ' 分钟'
}

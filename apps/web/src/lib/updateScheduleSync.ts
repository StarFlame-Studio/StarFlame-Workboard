/**
 * 上课时段暂停静默更新：把班级设置里的作息整理成桌面主进程需要的形态。
 *
 * 数据来源（班级 settings）：
 * - update.pauseDuringClass：总开关，默认开启。
 * - schedule.periods：每天的上课节次（优先）；某天没配置节次时回退到
 *   schedule.weekly 的「上学 → 走读放学」整段，保证老班级也能生效。
 *
 * 网页端没有主进程，desktopBridge 为空时整个函数是空操作。
 */
import { desktopBridge, type SfClassPeriod, type SfUpdateSchedule } from './platform/desktop'

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayKey = (typeof DAY_KEYS)[number]

/** '8:5' / '08:05:00' 这类输入统一成 'HH:MM'；非法返回 null */
function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return String(hour).padStart(2, '0') + ':' + match[2]
}

function toMinutes(value: string): number {
  const [hour, minute] = value.split(':')
  return Number(hour) * 60 + Number(minute)
}

function sanitizePeriods(raw: unknown): Record<string, SfClassPeriod[]> {
  const result: Record<string, SfClassPeriod[]> = {}
  if (!raw || typeof raw !== 'object') return result
  const source = raw as Record<string, unknown>
  for (const key of DAY_KEYS) {
    const list = source[key]
    if (!Array.isArray(list)) continue
    const cleaned: SfClassPeriod[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const start = normalizeTime(record.start)
      const end = normalizeTime(record.end)
      if (!start || !end || toMinutes(end) <= toMinutes(start)) continue
      const name = typeof record.name === 'string' ? record.name.trim().slice(0, 12) : ''
      cleaned.push({ name, start, end })
    }
    cleaned.sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
    if (cleaned.length) result[key] = cleaned
  }
  return result
}

function sanitizeWeekly(raw: unknown): SfUpdateSchedule['weekly'] {
  const result: SfUpdateSchedule['weekly'] = {}
  if (!raw || typeof raw !== 'object') return result
  const source = raw as Record<string, unknown>
  for (const key of DAY_KEYS) {
    const value = source[key]
    if (!value || typeof value !== 'object') {
      result[key] = null
      continue
    }
    const record = value as Record<string, unknown>
    const start = normalizeTime(record.start)
    const end = normalizeTime(record.end)
    result[key] = start && end && toMinutes(end) > toMinutes(start) ? { start, end } : null
  }
  return result
}

/** 把一份班级设置整理成主进程要的完整时间表（总是包含 7 天键） */
export function buildUpdateSchedule(settings: Record<string, unknown>): SfUpdateSchedule {
  return {
    pauseDuringClass: settings['update.pauseDuringClass'] !== false,
    weekly: sanitizeWeekly(settings['schedule.weekly']),
    periods: sanitizePeriods(settings['schedule.periods']),
  }
}

/** 上一次成功推送的时间表（避免设置页频繁改动时反复跨进程通信） */
let lastPushedKey = ''

/** 推给桌面主进程；网页端或失败时静默忽略（不影响设置保存） */
export function syncUpdateSchedule(settings: Record<string, unknown>): void {
  if (!desktopBridge) return
  const config = buildUpdateSchedule(settings)
  const key = JSON.stringify(config)
  if (key === lastPushedKey) return
  void desktopBridge.update
    .setSchedule(config)
    .then((ok) => {
      if (ok) lastPushedKey = key
    })
    .catch(() => undefined)
}

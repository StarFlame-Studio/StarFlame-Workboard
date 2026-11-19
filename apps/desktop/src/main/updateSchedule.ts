/**
 * 上课时段暂停静默更新（主进程侧）。
 *
 * 渲染进程把整理好的作息时间表通过 IPC（sf:update:schedule）推上来，这里负责：
 * 1) 落盘到 userData/update-schedule.json，重启后仍然生效；
 * 2) 判断当前是否处于上课时段、以及最早可以继续更新的时间点。
 *
 * updater.ts 在「开始下载」与「静默安装」两个动作前各查一次；
 * 上课中就挂定时器等到下课 5 分钟后继续，不会跳过这次更新。
 */
import { app, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface ClassPeriod {
  name: string
  start: string
  end: string
}

export interface DayRange {
  start: string
  end: string
}

export interface UpdateScheduleConfig {
  pauseDuringClass: boolean
  weekly: Record<string, DayRange | null>
  periods: Record<string, ClassPeriod[]>
}

/** 下课后延迟多久再继续更新：收拾、换教室、下一节预备 */
export const RESUME_GRACE_MINUTES = 5
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const FILE_NAME = 'update-schedule.json'
const MAX_PERIODS_PER_DAY = 24

let config: UpdateScheduleConfig = { pauseDuringClass: true, weekly: {}, periods: {} }
let logger: ((level: 'info' | 'warn' | 'error', message: string) => void) | null = null
let changeListener: (() => void) | null = null

export function setUpdateScheduleLogger(fn: ((level: 'info' | 'warn' | 'error', message: string) => void) | null): void {
  logger = fn
}

/** 时间表变化时通知更新器重新评估闸门（例如老师在设置里改了课表） */
export function setUpdateScheduleChangeListener(fn: (() => void) | null): void {
  changeListener = fn
}

function log(level: 'info' | 'warn' | 'error', message: string): void {
  if (logger) logger(level, message)
  else console.log('[update-schedule]', message)
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
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

function sanitizePeriod(value: unknown): ClassPeriod | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const start = normalizeTime(record.start)
  const end = normalizeTime(record.end)
  if (!start || !end || toMinutes(end) <= toMinutes(start)) return null
  const name = typeof record.name === 'string' ? record.name.trim().slice(0, 12) : ''
  return { name, start, end }
}

function sanitizeDayRange(value: unknown): DayRange | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const start = normalizeTime(record.start)
  const end = normalizeTime(record.end)
  if (!start || !end || toMinutes(end) <= toMinutes(start)) return null
  return { start, end }
}

function sanitizeSchedule(input: unknown): UpdateScheduleConfig | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  const weekly: Record<string, DayRange | null> = {}
  if (record.weekly && typeof record.weekly === 'object') {
    const source = record.weekly as Record<string, unknown>
    for (const key of DAY_KEYS) weekly[key] = sanitizeDayRange(source[key])
  }
  const periods: Record<string, ClassPeriod[]> = {}
  if (record.periods && typeof record.periods === 'object') {
    const source = record.periods as Record<string, unknown>
    for (const key of DAY_KEYS) {
      const list = source[key]
      if (!Array.isArray(list)) continue
      const cleaned: ClassPeriod[] = []
      for (const item of list.slice(0, MAX_PERIODS_PER_DAY)) {
        const period = sanitizePeriod(item)
        if (period) cleaned.push(period)
      }
      cleaned.sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
      if (cleaned.length) periods[key] = cleaned
    }
  }
  return { pauseDuringClass: record.pauseDuringClass !== false, weekly, periods }
}

function configPath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

function describeConfig(): string {
  if (!config.pauseDuringClass) return '上课时段暂停更新：已关闭'
  const withPeriods: string[] = []
  const withWeekly: string[] = []
  for (const key of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    if (config.periods[key]?.length) withPeriods.push(key)
    else if (config.weekly[key]) withWeekly.push(key)
  }
  const parts: string[] = ['上课时段暂停更新：已开启']
  parts.push(withPeriods.length ? '课程节次：' + withPeriods.join('/') : '课程节次：未配置')
  parts.push(withWeekly.length ? '按上学放学整段：' + withWeekly.join('/') : '按上学放学整段：未配置')
  return parts.join('；')
}

/** 启动时读取上次落盘的时间表 */
export function loadUpdateSchedule(): void {
  try {
    const path = configPath()
    if (!existsSync(path)) {
      log('info', '暂无作息时间表，暂不限制上课时段更新')
      return
    }
    const sanitized = sanitizeSchedule(JSON.parse(readFileSync(path, 'utf8')) as unknown)
    if (!sanitized) {
      log('warn', '作息时间表格式无效，已忽略')
      return
    }
    config = sanitized
    log('info', describeConfig())
  } catch (err) {
    log('warn', '读取作息时间表失败：' + errorMessage(err))
  }
}

/** 渲染进程推送时间表：校验、落盘、通知更新器重新评估 */
export function setUpdateSchedule(input: unknown): boolean {
  const sanitized = sanitizeSchedule(input)
  if (!sanitized) {
    log('warn', '收到无效的作息时间表，已忽略')
    return false
  }
  config = sanitized
  try {
    const path = configPath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(config))
  } catch (err) {
    log('warn', '保存作息时间表失败：' + errorMessage(err))
  }
  log('info', describeConfig())
  if (changeListener) changeListener()
  return true
}

export function getUpdateSchedule(): UpdateScheduleConfig {
  return JSON.parse(JSON.stringify(config)) as UpdateScheduleConfig
}

function windowsForDay(key: string): Array<{ start: number; end: number }> {
  const periods = config.periods[key]
  if (periods && periods.length) {
    return periods.map((item) => ({ start: toMinutes(item.start), end: toMinutes(item.end) }))
  }
  const weekly = config.weekly[key]
  return weekly ? [{ start: toMinutes(weekly.start), end: toMinutes(weekly.end) }] : []
}

/** 合并重叠/相连的节次，避免「连堂」被拆成两段导致 5 分钟后判错 */
function mergedWindows(key: string): Array<{ start: number; end: number }> {
  const sorted = windowsForDay(key).sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number; end: number }> = []
  for (const window of sorted) {
    const last = merged[merged.length - 1]
    if (last && window.start <= last.end) last.end = Math.max(last.end, window.end)
    else merged.push({ start: window.start, end: window.end })
  }
  return merged
}

function formatMinutes(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440
  return String(Math.floor(normalized / 60)).padStart(2, '0') + ':' + String(normalized % 60).padStart(2, '0')
}

function minutesToTimestamp(now: Date, minutes: number): number {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  base.setMinutes(minutes)
  return base.getTime()
}

export interface UpdateWindowState {
  /** 当前是否处于上课时段（应推迟更新） */
  paused: boolean
  /** 可以继续更新的时间戳；不限时（或当前可更新）时为 null */
  resumeAt: number | null
  /** 给人看的说明，会写进 update.log 与更新状态 */
  reason: string
}

export function evaluateUpdateWindow(now: Date = new Date()): UpdateWindowState {
  if (!config.pauseDuringClass) return { paused: false, resumeAt: null, reason: '未开启上课时段暂停更新' }
  const key = DAY_KEYS[now.getDay()]
  const windows = mergedWindows(key)
  if (!windows.length) return { paused: false, resumeAt: null, reason: '当天未配置上课时段' }
  const minutes = now.getHours() * 60 + now.getMinutes()
  const active = windows.find((item) => minutes >= item.start && minutes < item.end)
  if (!active) return { paused: false, resumeAt: null, reason: '当前不在上课时段' }
  let resume = active.end + RESUME_GRACE_MINUTES
  // 下课后 5 分钟若又落进下一节课（课间短/连堂），顺延到那节课下课 5 分钟后
  for (let guard = 0; guard < 12; guard += 1) {
    const next = windows.find((item) => resume >= item.start && resume < item.end)
    if (!next) break
    resume = next.end + RESUME_GRACE_MINUTES
  }
  return {
    paused: true,
    resumeAt: minutesToTimestamp(now, resume),
    reason: '上课时段 ' + formatMinutes(active.start) + '-' + formatMinutes(active.end) + '，' + formatMinutes(resume) + ' 起继续更新',
  }
}

export function registerUpdateScheduleIpc(): void {
  ipcMain.handle('sf:update:schedule', (_event, input: unknown) => setUpdateSchedule(input))
}

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

function statePath(name: string): string {
  return join(app.getPath('userData'), name)
}

export function readJson<T>(name: string, fallback: T): T {
  try {
    const p = statePath(name)
    if (!existsSync(p)) return fallback
    return JSON.parse(readFileSync(p, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function writeJson(name: string, value: unknown): void {
  try {
    const p = statePath(name)
    mkdirSync(dirname(p), { recursive: true })
    const tmp = p + '.tmp'
    writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
    renameSync(tmp, p)
  } catch {
    // 磁盘写入失败不应影响桌面端运行
  }
}

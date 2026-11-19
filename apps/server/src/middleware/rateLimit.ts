import type { NextFunction, Request, Response } from 'express'
import { ERROR_CODE } from '@starflame/shared'
import { HttpError } from '../lib/http.js'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
let lastSweep = 0

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function clientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip']
  if (typeof cf === 'string' && cf.trim()) return cf.trim()
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0]!.trim()
  return req.ip ?? req.socket.remoteAddress ?? 'unknown'
}

export interface RateLimitOptions {
  name: string
  windowMs: number
  max: number
}

export function rateLimit(options: RateLimitOptions) {
  const { name, windowMs, max } = options
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now()
    sweep(now)
    const who = req.user?.id ?? req.device?.id ?? clientIp(req)
    const key = name + '|' + who
    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }
    bucket.count += 1
    const remaining = Math.max(0, max - bucket.count)
    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(remaining))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfter))
      next(new HttpError(429, ERROR_CODE.RATE_LIMITED, '请求过于频繁，请 ' + retryAfter + ' 秒后重试'))
      return
    }
    next()
  }
}

export const loginLimiter = rateLimit({ name: 'auth.login', windowMs: 60_000, max: 5 })
export const bindLimiter = rateLimit({ name: 'device.login', windowMs: 60_000, max: 10 })
/** 注册：同一 IP 每小时最多 5 次 */
export const registerLimiter = rateLimit({ name: 'auth.register', windowMs: 3_600_000, max: 5 })
export const readLimiter = rateLimit({ name: 'api.read', windowMs: 60_000, max: 300 })
export const writeLimiter = rateLimit({ name: 'api.write', windowMs: 60_000, max: 60 })

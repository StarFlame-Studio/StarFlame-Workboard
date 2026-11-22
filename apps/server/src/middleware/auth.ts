import type { NextFunction, Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { ERROR_CODE, HEADER_DEVICE_TOKEN } from '@starflame/shared'
import { db } from '../db/index.js'
import { devices, users } from '../db/schema.js'
import { HttpError, forbidden, unauthorized } from '../lib/http.js'
import { sha256, verifyAccessToken } from '../lib/tokens.js'
import { touchDeviceActivity } from '../services/devicePresence.js'

export async function requireUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) {
      next(unauthorized())
      return
    }
    const payload = verifyAccessToken(token)
    const rows = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
    const user = rows[0]
    if (!user || user.status !== 'active') {
      next(unauthorized())
      return
    }
    req.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl ?? null,
    }
    next()
  } catch {
    next(unauthorized())
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(unauthorized())
    return
  }
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    next(forbidden('需要管理员权限'))
    return
  }
  next()
}

export async function requireDevice(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = req.headers[HEADER_DEVICE_TOKEN]
    const token = Array.isArray(raw) ? raw[0] : raw
    if (!token) {
      next(unauthorized('缺少设备令牌'))
      return
    }
    const rows = await db.select().from(devices).where(eq(devices.tokenHash, sha256(token))).limit(1)
    const device = rows[0]
    if (!device || device.status !== 'active') {
      next(unauthorized('设备令牌无效'))
      return
    }
    req.device = {
      id: device.id,
      classId: device.classId,
      name: device.name,
      isReadOnly: device.isReadOnly || device.permission === 'read',
      role: device.role,
      permission: device.permission,
      accessCodeId: device.accessCodeId ?? null,
    }
    // 任意一次带令牌的请求都算活动：内存表立刻生效，写库按 30 秒节流。
    // 这样即使 Socket.IO 被代理掐断、设备只是在翻页/刷新，后台也不会误判离线。
    if (touchDeviceActivity(device.id)) {
      void db
        .update(devices)
        .set({ lastSeenAt: new Date() })
        .where(eq(devices.id, device.id))
        .catch(() => {
          // 活动时间写库失败不影响请求本身
        })
    }
    next()
  } catch {
    next(unauthorized())
  }
}

export async function requireUserOrDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.headers[HEADER_DEVICE_TOKEN]) {
    await requireDevice(req, res, next)
    return
  }
  await requireUser(req, res, next)
}

export function requireWritable(req: Request, _res: Response, next: NextFunction): void {
  if (req.device && (req.device.isReadOnly || req.device.permission === 'read')) {
    next(new HttpError(403, ERROR_CODE.READ_ONLY, '当前授权为只读，无法修改数据'))
    return
  }
  next()
}

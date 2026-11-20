import { Router } from 'express'
import { and, eq } from 'drizzle-orm'
import { DEVICE_ROLE_LABEL, deviceLoginSchema, type DeviceRole } from '@starflame/shared'
import { db } from '../db/index.js'
import { classAccessCodes, classes, devices } from '../db/schema.js'
import { accessDisabled, accessExpired, badBindCode, guestDisabled, notFound, ok, unauthorized } from '../lib/http.js'
import { newId } from '../lib/ids.js'
import { randomToken, sha256 } from '../lib/tokens.js'
import { writeAudit } from '../lib/audit.js'
import { bindLimiter, clientIp, writeLimiter } from '../middleware/rateLimit.js'
import { validateBody } from '../middleware/validate.js'
import { requireDevice } from '../middleware/auth.js'

const router = Router()

/** 设备名称不再手填：按授权码身份自动识别（游客 = 未填授权码） */
const DEFAULT_DEVICE_NAME: Record<DeviceRole, string> = {
  terminal: '一体机',
  teacher: '老师设备',
  student: '学生设备',
  parent: '家长设备',
  guest: '游客',
}

/**
 * 班级码 + 授权码登录（一次授权 = 一台设备）。
 * 授权码可留空：留空即游客只读登录，是否允许由班级设置 access.guestEnabled 控制（缺省开启）。
 */
router.post('/login', bindLimiter, validateBody(deviceLoginSchema), async (req, res, next) => {
  try {
    const input = req.validated as { classCode: string; accessCode?: string; deviceName?: string; uuid?: string }
    const classRows = await db
      .select()
      .from(classes)
      .where(and(eq(classes.classCode, input.classCode.trim()), eq(classes.status, 'active')))
      .limit(1)
    const targetClass = classRows[0]
    if (!targetClass) throw badBindCode()

    const rawAccessCode = (input.accessCode ?? '').trim()
    const isGuest = rawAccessCode.length === 0

    let role: DeviceRole
    let permission: 'read' | 'write'
    let accessCodeId: string | null = null
    if (isGuest) {
      const classSettings = (targetClass.settings ?? {}) as Record<string, unknown>
      if (classSettings['access.guestEnabled'] === false) throw guestDisabled()
      role = 'guest'
      permission = 'read'
    } else {
      const codeRows = await db
        .select()
        .from(classAccessCodes)
        .where(and(eq(classAccessCodes.classId, targetClass.id), eq(classAccessCodes.code, rawAccessCode)))
        .limit(1)
      const accessCode = codeRows[0]
      if (!accessCode) throw badBindCode()
      if (!accessCode.enabled) throw accessDisabled()
      if (accessCode.expiresAt && accessCode.expiresAt.getTime() < Date.now()) throw accessExpired()
      role = accessCode.role
      permission = accessCode.permission
      accessCodeId = accessCode.id
    }

    const rawToken = randomToken(32)
    const tokenHash = sha256(rawToken)
    const uuid = input.uuid ?? crypto.randomUUID()
    const isReadOnly = permission === 'read'
    const deviceName = input.deviceName?.trim() || DEFAULT_DEVICE_NAME[role]
    const existing = await db.select().from(devices).where(eq(devices.uuid, uuid)).limit(1)
    const device = existing[0]

    let deviceId: string
    if (device) {
      deviceId = device.id
      await db
        .update(devices)
        .set({
          classId: targetClass.id,
          name: deviceName,
          tokenHash,
          accessCodeId,
          role,
          permission,
          isReadOnly,
          status: 'active',
          lastSeenAt: new Date(),
          userAgent: (req.headers['user-agent'] ?? '').slice(0, 255),
          lastIp: clientIp(req),
        })
        .where(eq(devices.id, device.id))
    } else {
      deviceId = newId()
      await db.insert(devices).values({
        id: deviceId,
        classId: targetClass.id,
        name: deviceName,
        uuid,
        tokenHash,
        accessCodeId,
        role,
        permission,
        isReadOnly,
        userAgent: (req.headers['user-agent'] ?? '').slice(0, 255),
        lastIp: clientIp(req),
        lastSeenAt: new Date(),
        status: 'active',
      })
    }

    if (accessCodeId) {
      await db.update(classAccessCodes).set({ lastUsedAt: new Date() }).where(eq(classAccessCodes.id, accessCodeId))
    }

    await writeAudit({
      actorType: 'device',
      actorId: deviceId,
      classId: targetClass.id,
      action: isGuest ? 'device.guest' : device ? 'device.relogin' : 'device.login',
      target: deviceId,
      detail: { name: deviceName, accessCodeId, role },
      ip: clientIp(req),
    })

    ok(res, {
      deviceToken: rawToken,
      expiresAt: null,
      role,
      roleLabel: DEVICE_ROLE_LABEL[role],
      permission,
      device: { id: deviceId, name: deviceName, uuid, isReadOnly },
      class: {
        id: targetClass.id,
        name: targetClass.name,
        grade: targetClass.grade,
        school: targetClass.school,
      },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/me', requireDevice, async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: devices.id,
        name: devices.name,
        isReadOnly: devices.isReadOnly,
        role: devices.role,
        permission: devices.permission,
        accessCodeId: devices.accessCodeId,
        lastSeenAt: devices.lastSeenAt,
        classId: classes.id,
        className: classes.name,
        grade: classes.grade,
        school: classes.school,
        settings: classes.settings,
      })
      .from(devices)
      .innerJoin(classes, eq(classes.id, devices.classId))
      .where(eq(devices.id, req.device!.id))
      .limit(1)
    const row = rows[0]
    if (!row) throw notFound('设备不存在')

    const classSettings = (row.settings ?? {}) as Record<string, unknown>

    // 游客登录被关闭后，游客设备立即踢下线
    if (row.role === 'guest' && !row.accessCodeId && classSettings['access.guestEnabled'] === false) {
      throw unauthorized('该班级已关闭游客登录，请使用授权码登录')
    }

    // 授权码被停用 / 过期 / 删除后，立即踢下线
    if (row.accessCodeId) {
      const codeRows = await db
        .select({ enabled: classAccessCodes.enabled, expiresAt: classAccessCodes.expiresAt })
        .from(classAccessCodes)
        .where(eq(classAccessCodes.id, row.accessCodeId))
        .limit(1)
      const accessCode = codeRows[0]
      if (!accessCode) throw unauthorized('授权码已被删除，请重新登录')
      if (!accessCode.enabled) throw unauthorized('授权码已停用，请联系管理员')
      if (accessCode.expiresAt && accessCode.expiresAt.getTime() < Date.now()) {
        throw unauthorized('授权码已过期，请联系管理员')
      }
    }

    ok(res, {
      device: {
        id: row.id,
        name: row.name,
        isReadOnly: row.isReadOnly || row.permission === 'read',
        role: row.role,
        roleLabel: DEVICE_ROLE_LABEL[row.role],
        isGuest: row.role === 'guest',
        permission: row.permission,
        lastSeenAt: row.lastSeenAt,
      },
      class: { id: row.classId, name: row.className, grade: row.grade, school: row.school },
      settings: row.settings ?? {},
    })
  } catch (error) {
    next(error)
  }
})

router.post('/heartbeat', writeLimiter, requireDevice, async (req, res, next) => {
  try {
    // 心跳同时刷新 UA 与 IP：客户端升级版本、更换网络后管理面板都能看到最新值
    const userAgent = (req.headers['user-agent'] ?? '').slice(0, 255)
    await db
      .update(devices)
      .set({ lastSeenAt: new Date(), lastIp: clientIp(req), ...(userAgent ? { userAgent } : {}) })
      .where(eq(devices.id, req.device!.id))
    ok(res, { online: true, serverTime: new Date().toISOString() })
  } catch (error) {
    next(error)
  }
})

/** 退出登录：令牌立即失效 */
router.post('/logout', writeLimiter, requireDevice, async (req, res, next) => {
  try {
    await db.update(devices).set({ status: 'revoked', tokenHash: null }).where(eq(devices.id, req.device!.id))
    await writeAudit({
      actorType: 'device',
      actorId: req.device!.id,
      classId: req.device!.classId,
      action: 'device.logout',
      target: req.device!.id,
      ip: clientIp(req),
    })
    ok(res, { loggedOut: true })
  } catch (error) {
    next(error)
  }
})

router.get('/check', async (req, res, next) => {
  try {
    const raw = req.headers['x-device-token']
    const token = Array.isArray(raw) ? raw[0] : raw
    if (!token) throw unauthorized('缺少设备令牌')
    const rows = await db
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.tokenHash, sha256(token)), eq(devices.status, 'active')))
      .limit(1)
    if (rows.length === 0) throw unauthorized('设备令牌无效')
    ok(res, { valid: true })
  } catch (error) {
    next(error)
  }
})

export default router

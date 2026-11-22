import { Router } from 'express'
import { and, count, desc, eq, inArray, like, or } from 'drizzle-orm'
import {
  classCreateSchema,
  classJoinSchema,
  classUpdateSchema,
  noticeBatchSchema,
  noticeBroadcastSchema,
  accessCodeCreateSchema,
  accessCodeUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
} from '@starflame/shared'
import { db } from '../db/index.js'
import {
  auditLogs,
  classAccessCodes,
  classMembers,
  classes,
  devices,
  homework,
  noticeReads,
  notices,
  students,
  subjects,
  systemSettings,
  users,
} from '../db/schema.js'
import {
  accessCodeTaken,
  badRequest,
  classCodeTaken,
  classNotFound,
  classUidTaken,
  conflict,
  forbidden,
  notFound,
  ok,
  param,
} from '../lib/http.js'
import { newAccessCode, newClassCode, newClassUid, newId } from '../lib/ids.js'
import { hashPassword } from '../lib/password.js'
import { writeAudit } from '../lib/audit.js'
import { logger } from '../logger.js'
import { clientIp, readLimiter, writeLimiter } from '../middleware/rateLimit.js'
import { requireAdmin, requireUser } from '../middleware/auth.js'
import { validateBody } from '../middleware/validate.js'
import { seedSubjects } from '../services/classService.js'
import { deviceActivityAt, forgetDeviceActivity, isDeviceOnline } from '../services/devicePresence.js'
import {
  broadcastChange,
  deviceCommandState,
  disconnectDeviceSockets,
  hasPendingDeviceCommand,
  queueDeviceCommand,
  sendDeviceCommand,
} from '../realtime/socket.js'

const router = Router()

/** 「加入班级」：任何已登录账号都能凭班级ID加入，不要求管理员 */
router.post('/classes/join', requireUser, writeLimiter, validateBody(classJoinSchema), async (req, res, next) => {
  try {
    const input = req.validated as { classUid: string }
    const classUid = input.classUid.trim()
    const rows = await db.select().from(classes).where(eq(classes.classUid, classUid)).limit(1)
    const targetClass = rows[0]
    if (!targetClass || targetClass.status !== 'active') throw classNotFound()

    const existing = await db
      .select({ role: classMembers.role })
      .from(classMembers)
      .where(and(eq(classMembers.classId, targetClass.id), eq(classMembers.userId, req.user!.id)))
      .limit(1)
    if (existing.length === 0) {
      await db.insert(classMembers).values({ classId: targetClass.id, userId: req.user!.id, role: 'teacher' })
    }
    await writeAudit({
      actorType: 'user',
      actorId: req.user!.id,
      classId: targetClass.id,
      action: 'class.join',
      target: targetClass.id,
      ip: clientIp(req),
    })
    ok(res, {
      id: targetClass.id,
      name: targetClass.name,
      grade: targetClass.grade,
      school: targetClass.school,
      classCode: targetClass.classCode,
      alreadyJoined: existing.length > 0,
    })
  } catch (error) {
    next(error)
  }
})

/**
 * 权限守卫：管理员放行全部接口；普通教师账号（注册即得）只能读班级列表与班级详情，
 * 其余（用户、设备、审计、概览、写操作）一律拒绝。
 */
function requireStaff(req: Parameters<typeof requireAdmin>[0], res: Parameters<typeof requireAdmin>[1], next: Parameters<typeof requireAdmin>[2]): void {
  const role = req.user?.role
  if (role === 'owner' || role === 'admin') {
    next()
    return
  }
  const isClassRead = req.method === 'GET' && /^\/(classes|classes\/[^/]+)\/?$/.test(req.path)
  if (isClassRead) {
    next()
    return
  }
  next(forbidden('需要管理员权限'))
}

router.use(requireUser, requireStaff, readLimiter)

function pageParams(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20) || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

router.get('/overview', async (_req, res, next) => {
  try {
    const [classCount] = await db.select({ value: count() }).from(classes).where(eq(classes.status, 'active'))
    const [userCount] = await db.select({ value: count() }).from(users).where(eq(users.status, 'active'))
    const [deviceCount] = await db.select({ value: count() }).from(devices).where(eq(devices.status, 'active'))
    const today = new Date().toISOString().slice(0, 10)
    const [homeworkCount] = await db.select({ value: count() }).from(homework).where(eq(homework.dueDate, today))
    const [studentCount] = await db.select({ value: count() }).from(students).where(eq(students.status, 'active'))
    ok(res, {
      classCount: classCount?.value ?? 0,
      userCount: userCount?.value ?? 0,
      deviceCount: deviceCount?.value ?? 0,
      homeworkToday: homeworkCount?.value ?? 0,
      studentCount: studentCount?.value ?? 0,
      date: today,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/classes', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = pageParams(req.query as Record<string, unknown>)
    const keyword = String(req.query.keyword ?? '').trim()
    const isSuperUser = req.user!.role === 'owner' || req.user!.role === 'admin'
    const memberClassIds = isSuperUser
      ? null
      : (
          await db
            .select({ classId: classMembers.classId })
            .from(classMembers)
            .where(eq(classMembers.userId, req.user!.id))
        ).map((row) => row.classId)

    const filters = [eq(classes.status, 'active')]
    if (keyword) filters.push(like(classes.name, '%' + keyword + '%'))
    if (memberClassIds) filters.push(inArray(classes.id, memberClassIds.length > 0 ? memberClassIds : ['__none__']))
    const where = and(...filters)

    const items = await db
      .select({
        id: classes.id,
        name: classes.name,
        grade: classes.grade,
        school: classes.school,
        classCode: classes.classCode,
        classUid: classes.classUid,
        status: classes.status,
        ownerId: classes.ownerId,
        ownerName: users.name,
        createdAt: classes.createdAt,
      })
      .from(classes)
      .leftJoin(users, eq(users.id, classes.ownerId))
      .where(where)
      .orderBy(desc(classes.createdAt))
      .limit(pageSize)
      .offset(offset)

    const [totalRow] = await db.select({ value: count() }).from(classes).where(where)
    ok(res, { items, total: totalRow?.value ?? 0, page, pageSize })
  } catch (error) {
    next(error)
  }
})

/** 随机生成本班授权码（10 位），保证唯一 */
function randomAccessCode(): string {
  return newAccessCode()
}

router.post('/classes', writeLimiter, validateBody(classCreateSchema), async (req, res, next) => {
  try {
    const input = req.validated as {
      name: string
      grade?: string | null
      school?: string | null
      classCode: string
      classUid: string
      ownerId?: string
    }
    const ownerId = input.ownerId ?? req.user!.id
    const ownerRows = await db.select().from(users).where(eq(users.id, ownerId)).limit(1)
    if (!ownerRows[0]) throw badRequest('指定的负责人不存在')

    const classCode = input.classCode.trim()
    const classUid = input.classUid.trim()
    const dupCode = await db.select({ id: classes.id }).from(classes).where(eq(classes.classCode, classCode)).limit(1)
    if (dupCode.length > 0) throw classCodeTaken()
    const dupUid = await db.select({ id: classes.id }).from(classes).where(eq(classes.classUid, classUid)).limit(1)
    if (dupUid.length > 0) throw classUidTaken()

    const classId = newId()
    const terminalCode = randomAccessCode()
    await db.transaction(async (tx) => {
      await tx.insert(classes).values({
        id: classId,
        name: input.name,
        grade: input.grade ?? null,
        school: input.school ?? null,
        classCode,
        classUid,
        ownerId,
        settings: {},
        status: 'active',
      })
      await tx.insert(classMembers).values({ classId, userId: ownerId, role: 'owner' })
      await tx.insert(classAccessCodes).values({
        id: newId(),
        classId,
        code: terminalCode,
        role: 'terminal',
        permission: 'write',
        label: '一体机 · 默认授权码',
        enabled: true,
        createdBy: req.user!.id,
      })
    })
    await seedSubjects(classId)
    await writeAudit({
      actorType: 'user',
      actorId: req.user!.id,
      classId,
      action: 'class.create',
      target: classId,
      detail: { name: input.name, classCode, classUid },
      ip: clientIp(req),
    })

    ok(res, {
      id: classId,
      classCode,
      classUid,
      terminalAccessCode: terminalCode,
      class: { id: classId, name: input.name, grade: input.grade ?? null, status: 'active', classCode, classUid },
    })
  } catch (error) {
    next(error)
  }
})

/** 按班级ID添加（加入）已有班级 */
router.get('/classes/:id', async (req, res, next) => {
  try {
    const classId = param(req, 'id')
    const rows = await db.select().from(classes).where(eq(classes.id, classId)).limit(1)
    const row = rows[0]
    if (!row) throw notFound('班级不存在')
    const [studentCount] = await db.select({ value: count() }).from(students).where(eq(students.classId, classId))
    const [deviceCount] = await db
      .select({ value: count() })
      .from(devices)
      .where(and(eq(devices.classId, classId), eq(devices.status, 'active')))
    const [homeworkCount] = await db.select({ value: count() }).from(homework).where(eq(homework.classId, classId))
    const subjectRows = await db.select().from(subjects).where(eq(subjects.classId, classId))

    ok(res, {
      id: row.id,
      name: row.name,
      grade: row.grade,
      school: row.school,
      status: row.status,
      classCode: row.classCode,
      classUid: row.classUid,
      settings: row.settings ?? {},
      stats: {
        studentCount: studentCount?.value ?? 0,
        deviceCount: deviceCount?.value ?? 0,
        homeworkCount: homeworkCount?.value ?? 0,
      },
      subjects: subjectRows.map((s) => ({ id: s.id, code: s.code, name: s.name, color: s.color, enabled: s.enabled })),
    })
  } catch (error) {
    next(error)
  }
})

router.patch('/classes/:id', writeLimiter, validateBody(classUpdateSchema), async (req, res, next) => {
  try {
    const classId = param(req, 'id')
    const input = req.validated as Record<string, unknown>
    const rows = await db.select().from(classes).where(eq(classes.id, classId)).limit(1)
    if (!rows[0]) throw notFound('班级不存在')

    const patch: Record<string, unknown> = {}
    if (typeof input.name === 'string') patch.name = input.name
    if (input.grade !== undefined) patch.grade = input.grade
    if (input.school !== undefined) patch.school = input.school
    if (input.status !== undefined) patch.status = input.status
    if (input.settings !== undefined) patch.settings = input.settings

    if (typeof input.classCode === 'string') {
      const next = input.classCode.trim()
      if (next !== rows[0].classCode) {
        const dup = await db.select({ id: classes.id }).from(classes).where(eq(classes.classCode, next)).limit(1)
        if (dup.length > 0) throw classCodeTaken()
        patch.classCode = next
      }
    }
    if (typeof input.classUid === 'string') {
      const next = input.classUid.trim()
      if (next !== rows[0].classUid) {
        const dup = await db.select({ id: classes.id }).from(classes).where(eq(classes.classUid, next)).limit(1)
        if (dup.length > 0) throw classUidTaken()
        patch.classUid = next
      }
    }
    if (Object.keys(patch).length === 0) throw badRequest('没有需要更新的字段')

    await db.update(classes).set(patch).where(eq(classes.id, classId))
    await writeAudit({
      actorType: 'user',
      actorId: req.user!.id,
      classId,
      action: 'class.update',
      target: classId,
      detail: patch,
      ip: clientIp(req),
    })
    ok(res, { id: classId, updated: true, ...('classCode' in patch ? { classCode: patch.classCode } : {}), ...('classUid' in patch ? { classUid: patch.classUid } : {}) })
  } catch (error) {
    next(error)
  }
})

router.delete('/classes/:id', writeLimiter, async (req, res, next) => {
  try {
    const classId = param(req, 'id')
    await db.update(classes).set({ status: 'archived' }).where(eq(classes.id, classId))
    await writeAudit({
      actorType: 'user',
      actorId: req.user!.id,
      classId,
      action: 'class.archive',
      target: classId,
      ip: clientIp(req),
    })
    ok(res, { archived: true })
  } catch (error) {
    next(error)
  }
})

/* ---------------- 班级授权码 ---------------- */

function accessCodePayload(row: typeof classAccessCodes.$inferSelect) {
  return {
    id: row.id,
    classId: row.classId,
    code: row.code,
    role: row.role,
    permission: row.permission,
    label: row.label,
    enabled: row.enabled,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  }
}

router.get('/classes/:id/access-codes', async (req, res, next) => {
  try {
    const classId = param(req, 'id')
    const rows = await db
      .select()
      .from(classAccessCodes)
      .where(eq(classAccessCodes.classId, classId))
      .orderBy(desc(classAccessCodes.createdAt))
    const deviceRows = await db
      .select({ id: devices.id, name: devices.name, accessCodeId: devices.accessCodeId, lastSeenAt: devices.lastSeenAt })
      .from(devices)
      .where(and(eq(devices.classId, classId), eq(devices.status, 'active')))
    const onlineByCode = new Map<string, { id: string; name: string; lastSeenAt: Date | null }>()
    for (const device of deviceRows) {
      if (device.accessCodeId) onlineByCode.set(device.accessCodeId, device)
    }
    ok(res, {
      items: rows.map((row) => ({ ...accessCodePayload(row), device: onlineByCode.get(row.id) ?? null })),
      total: rows.length,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/classes/:id/access-codes', writeLimiter, validateBody(accessCodeCreateSchema), async (req, res, next) => {
  try {
    const classId = param(req, 'id')
    const input = req.validated as {
      code?: string
      role: 'terminal' | 'teacher' | 'student' | 'parent'
      permission: 'read' | 'write'
      label?: string | null
      expiresAt?: string | null
      enabled?: boolean
    }
    const classRows = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, classId)).limit(1)
    if (!classRows[0]) throw notFound('班级不存在')

    let code = input.code?.trim() || ''
    if (!code) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const candidate = randomAccessCode()
        const dup = await db
          .select({ id: classAccessCodes.id })
          .from(classAccessCodes)
          .where(and(eq(classAccessCodes.classId, classId), eq(classAccessCodes.code, candidate)))
          .limit(1)
        if (dup.length === 0) {
          code = candidate
          break
        }
      }
      if (!code) throw conflict('授权码生成失败，请重试')
    } else {
      const dup = await db
        .select({ id: classAccessCodes.id })
        .from(classAccessCodes)
        .where(and(eq(classAccessCodes.classId, classId), eq(classAccessCodes.code, code)))
        .limit(1)
      if (dup.length > 0) throw accessCodeTaken()
    }

    const id = newId()
    await db.insert(classAccessCodes).values({
      id,
      classId,
      code,
      role: input.role,
      permission: input.permission,
      label: input.label ?? null,
      enabled: input.enabled ?? true,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdBy: req.user!.id,
    })
    await writeAudit({
      actorType: 'user',
      actorId: req.user!.id,
      classId,
      action: 'accessCode.create',
      target: id,
      detail: { code, role: input.role, permission: input.permission },
      ip: clientIp(req),
    })
    const rows = await db.select().from(classAccessCodes).where(eq(classAccessCodes.id, id)).limit(1)
    ok(res, accessCodePayload(rows[0]!))
  } catch (error) {
    next(error)
  }
})

router.patch('/access-codes/:id', writeLimiter, validateBody(accessCodeUpdateSchema), async (req, res, next) => {
  try {
    const id = param(req, 'id')
    const input = req.validated as {
      code?: string
      role?: 'terminal' | 'teacher' | 'student' | 'parent'
      permission?: 'read' | 'write'
      label?: string | null
      expiresAt?: string | null
      enabled?: boolean
    }
    const rows = await db.select().from(classAccessCodes).where(eq(classAccessCodes.id, id)).limit(1)
    const code = rows[0]
    if (!code) throw notFound('授权码不存在')

    const patch: Record<string, unknown> = {}
    if (typeof input.code === 'string' && input.code.trim() !== code.code) {
      const nextCode = input.code.trim()
      const dup = await db
        .select({ id: classAccessCodes.id })
        .from(classAccessCodes)
        .where(and(eq(classAccessCodes.classId, code.classId), eq(classAccessCodes.code, nextCode)))
        .limit(1)
      if (dup.length > 0) throw accessCodeTaken()
      patch.code = nextCode
    }
    if (input.role !== undefined) patch.role = input.role
    if (input.permission !== undefined) patch.permission = input.permission
    if (input.label !== undefined) patch.label = input.label
    if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
    if (input.enabled !== undefined) patch.enabled = input.enabled
    if (Object.keys(patch).length === 0) throw badRequest('没有需要更新的字段')

    // 身份/权限变更同步到已登录设备
    if (patch.role !== undefined || patch.permission !== undefined) {
      const devicePatch: Record<string, unknown> = {}
      if (patch.role !== undefined) devicePatch.role = patch.role
      if (patch.permission !== undefined) {
        devicePatch.permission = patch.permission
        devicePatch.isReadOnly = patch.permission === 'read'
      }
      await db.update(devices).set(devicePatch).where(eq(devices.accessCodeId, id))
    }

    await db.update(classAccessCodes).set(patch).where(eq(classAccessCodes.id, id))
    await writeAudit({
      actorType: 'user',
      actorId: req.user!.id,
      classId: code.classId,
      action: 'accessCode.update',
      target: id,
      detail: patch,
      ip: clientIp(req),
    })
    const updated = await db.select().from(classAccessCodes).where(eq(classAccessCodes.id, id)).limit(1)
    ok(res, accessCodePayload(updated[0]!))
  } catch (error) {
    next(error)
  }
})

router.delete('/access-codes/:id', writeLimiter, async (req, res, next) => {
  try {
    const id = param(req, 'id')
    const rows = await db.select().from(classAccessCodes).where(eq(classAccessCodes.id, id)).limit(1)
    const code = rows[0]
    if (!code) throw notFound('授权码不存在')

    // 硬删除 + 使用该授权码的设备立即下线
    await db.transaction(async (tx) => {
      await tx
        .update(devices)
        .set({ status: 'revoked', tokenHash: null })
        .where(eq(devices.accessCodeId, id))
      await tx.delete(classAccessCodes).where(eq(classAccessCodes.id, id))
    })
    await writeAudit({
      actorType: 'user',
      actorId: req.user!.id,
      classId: code.classId,
      action: 'accessCode.delete',
      target: id,
      detail: { code: code.code },
      ip: clientIp(req),
    })
    ok(res, { deleted: true })
  } catch (error) {
    next(error)
  }
})

router.get('/users', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = pageParams(req.query as Record<string, unknown>)
    const items = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset)
    const [totalRow] = await db.select({ value: count() }).from(users)
    ok(res, { items, total: totalRow?.value ?? 0, page, pageSize })
  } catch (error) {
    next(error)
  }
})

router.post('/users', writeLimiter, validateBody(userCreateSchema), async (req, res, next) => {
  try {
    const input = req.validated as { username: string; email?: string; password: string; name: string; role: 'owner' | 'admin' | 'teacher' }
    const dup = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1)
    if (dup.length > 0) throw conflict('账号已存在')
    if (input.email) {
      const dupEmail = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1)
      if (dupEmail.length > 0) throw conflict('该邮箱已被使用')
    }
    if (input.role === 'owner' && req.user!.role !== 'owner') throw forbidden('只有超级管理员可以创建超级管理员')

    const userId = newId()
    await db.insert(users).values({
      id: userId,
      username: input.username,
      passwordHash: await hashPassword(input.password),
      name: input.name,
      email: input.email ?? null,
      role: input.role,
      status: 'active',
    })
    await writeAudit({
      actorType: 'user',
      actorId: req.user!.id,
      action: 'user.create',
      target: userId,
      detail: { username: input.username, role: input.role },
      ip: clientIp(req),
    })
    ok(res, { id: userId, username: input.username, email: input.email ?? null, name: input.name, role: input.role })
  } catch (error) {
    next(error)
  }
})

router.patch('/users/:id', writeLimiter, validateBody(userUpdateSchema), async (req, res, next) => {
  try {
    const userId = param(req, 'id')
    const input = req.validated as { name?: string; email?: string | null; role?: string; status?: string; password?: string }
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    const target = rows[0]
    if (!target) throw notFound('用户不存在')
    if (target.role === 'owner' && req.user!.role !== 'owner') throw forbidden('无权修改超级管理员')
    if (input.role === 'owner' && req.user!.role !== 'owner') throw forbidden('无权授予超级管理员')

    if (input.email) {
      const dupEmail = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1)
      if (dupEmail.length > 0 && dupEmail[0].id !== userId) throw conflict('该邮箱已被使用')
    }

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.email !== undefined) patch.email = input.email ?? null
    if (input.role !== undefined) patch.role = input.role
    if (input.status !== undefined) patch.status = input.status
    if (input.password !== undefined) patch.passwordHash = await hashPassword(input.password)
    if (Object.keys(patch).length === 0) throw badRequest('没有需要更新的字段')

    await db.update(users).set(patch).where(eq(users.id, userId))
    await writeAudit({
      actorType: 'user',
      actorId: req.user!.id,
      action: 'user.update',
      target: userId,
      detail: { fields: Object.keys(patch) },
      ip: clientIp(req),
    })
    ok(res, { id: userId, updated: true })
  } catch (error) {
    next(error)
  }
})

router.delete('/users/:id', writeLimiter, async (req, res, next) => {
  try {
    const userId = param(req, 'id')
    if (userId === req.user!.id) throw badRequest('不能删除自己')
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    const target = rows[0]
    if (!target) throw notFound('用户不存在')
    if (target.role === 'owner') throw forbidden('不能删除超级管理员')
    const owned = await db.select({ id: classes.id }).from(classes).where(eq(classes.ownerId, userId)).limit(1)
    if (owned.length > 0) throw conflict('该用户仍是班级负责人，请先转移班级')

    await db.delete(users).where(eq(users.id, userId))
    await writeAudit({
      actorType: 'user',
      actorId: req.user!.id,
      action: 'user.delete',
      target: userId,
      ip: clientIp(req),
    })
    ok(res, { id: userId, deleted: true })
  } catch (error) {
    next(error)
  }
})

/** 设备列表单次最多扫描的行数：在线状态含内存态，只能在应用层过滤，先限制扫描量 */
const DEVICE_LIST_SCAN_LIMIT = 2000

router.get('/devices', async (req, res, next) => {
  try {
    const query = req.query as Record<string, unknown>
    const page = Math.max(1, Number(query.page ?? 1) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize ?? 50) || 50))
    const classId = typeof query.classId === 'string' ? query.classId : ''
    const keyword = typeof query.keyword === 'string' ? query.keyword.trim() : ''
    const statusFilter = query.status === 'online' || query.status === 'offline' ? query.status : ''

    const filters = [eq(devices.status, 'active')]
    if (classId) filters.push(eq(devices.classId, classId))
    if (keyword) {
      const pattern = '%' + keyword + '%'
      filters.push(or(like(devices.name, pattern), like(devices.uuid, pattern), like(classes.name, pattern))!)
    }

    const rows = await db
      .select({
        id: devices.id,
        name: devices.name,
        uuid: devices.uuid,
        classId: devices.classId,
        className: classes.name,
        isReadOnly: devices.isReadOnly,
        role: devices.role,
        permission: devices.permission,
        userAgent: devices.userAgent,
        lastIp: devices.lastIp,
        lastSeenAt: devices.lastSeenAt,
        createdAt: devices.createdAt,
      })
      .from(devices)
      .leftJoin(classes, eq(classes.id, devices.classId))
      .where(and(...filters))
      .orderBy(desc(devices.createdAt))
      .limit(DEVICE_LIST_SCAN_LIMIT)

    const now = Date.now()
    // last_seen_at 只有心跳/登录/连接时才写库，内存里的活动时间可能更新；
    // 展示时取较新的那个，避免「在线」却显示十几分钟前的自相矛盾。
    const decorated = rows.map((row) => {
      const activityAt = deviceActivityAt(row.id)
      const effectiveLastSeen =
        activityAt !== null && (!row.lastSeenAt || activityAt > row.lastSeenAt.getTime())
          ? new Date(activityAt)
          : row.lastSeenAt
      // 远程指令的执行情况：设备回执失败时把原因一并带给后台，便于定位为什么没卸掉
      const command = deviceCommandState(row.id)
      return {
        ...row,
        lastSeenAt: effectiveLastSeen,
        online: isDeviceOnline(row.id, row.lastSeenAt, now),
        // 已下发但设备还没上线的远程卸载指令：后台显示「待送达」，用户不必反复点击
        uninstallPending: hasPendingDeviceCommand(row.id),
        commandDispatchedAt: command.dispatchedAt ? new Date(command.dispatchedAt) : null,
        commandAck: command.ack,
      }
    })
    const onlineCount = decorated.filter((row) => row.online).length
    const matched =
      statusFilter === 'online'
        ? decorated.filter((row) => row.online)
        : statusFilter === 'offline'
          ? decorated.filter((row) => !row.online)
          : decorated
    const offset = (page - 1) * pageSize
    ok(res, {
      items: matched.slice(offset, offset + pageSize),
      total: matched.length,
      page,
      pageSize,
      onlineCount,
      offlineCount: decorated.length - onlineCount,
      scanLimit: DEVICE_LIST_SCAN_LIMIT,
    })
  } catch (error) {
    next(error)
  }
})

/** 吊销设备：置为 revoked 并清空令牌，同时断开其已建立的实时连接 */
router.delete('/devices/:id', writeLimiter, async (req, res, next) => {
  try {
    const deviceId = param(req, 'id')
    const rows = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1)
    if (!rows[0]) throw notFound('设备不存在')
    await db.update(devices).set({ status: 'revoked', tokenHash: null }).where(eq(devices.id, deviceId))
    // 清掉内存活动痕迹，否则吊销后仍会在 3 分钟内显示在线
    forgetDeviceActivity(deviceId)
    const disconnected = disconnectDeviceSockets([deviceId])
    await writeAudit({
      actorType: 'user',
      actorId: req.user!.id,
      classId: rows[0].classId,
      action: 'device.revoke',
      target: deviceId,
      detail: { disconnected },
      ip: clientIp(req),
    })
    ok(res, { id: deviceId, revoked: true, disconnected })
  } catch (error) {
    next(error)
  }
})

/** 远程卸载要求的最低桌面客户端版本：更早的版本没有接收 device.command 的代码，只会白等 */
const MIN_REMOTE_UNINSTALL_VERSION = '1.1.7'

/** 从设备 UA 里取桌面客户端版本（@starflame/desktop/x.y.z），网页端或未上报返回 null */
function desktopClientVersion(userAgent: string | null): string | null {
  if (!userAgent) return null
  const matched = /@starflame\/desktop\/([\d.]+)/.exec(userAgent)
  return matched ? matched[1] : null
}

/** 版本号逐段比较（不足补 0），a<b 返回负数 */
function compareVersionText(a: string, b: string): number {
  const pa = a.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const pb = b.split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * 远程卸载设备上的桌面版作业板。
 * 通过 socket 下发 device.command 指令，客户端收到后不做任何确认、直接静默卸载并退出；
 * 设备当前不在线时把指令挂起，等它下次连上实时层自动补发（24 小时内有效）。
 */
router.post('/devices/:id/uninstall', writeLimiter, async (req, res, next) => {
  try {
    const deviceId = param(req, 'id')
    const rows = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1)
    if (!rows[0]) throw notFound('设备不存在')
    if (rows[0].status !== 'active') throw badRequest('该设备已被吊销，无法远程卸载')

    // 旧版客户端没有接收 device.command 的代码：指令发过去它也不会执行，只会让后台一直等
    // 回执、让人误以为「发了没生效」。这里提前拦下并明确告诉要升级到哪个版本。
    const clientVersion = desktopClientVersion(rows[0].userAgent)
    // UA 明确不是桌面客户端（浏览器打开网页端 / 测试脚本）时直接拦下，避免发出去只收到「不支持」回执
    if (rows[0].userAgent && !clientVersion) {
      throw badRequest('该设备当前不是桌面客户端（用浏览器打开的网页端），无法远程卸载')
    }
    if (clientVersion && compareVersionText(clientVersion, MIN_REMOTE_UNINSTALL_VERSION) < 0) {
      throw badRequest(
        '该设备的作业板版本是 v' + clientVersion + '，不支持远程卸载，请先升级到 v' + MIN_REMOTE_UNINSTALL_VERSION + ' 或更高版本',
      )
    }

    // 在线设备立即下发；离线设备把指令挂起，等它下次连上实时层自动执行（24 小时内有效）
    const sent = sendDeviceCommand(deviceId, { type: 'uninstall' })
    if (sent === 0) queueDeviceCommand(deviceId, { type: 'uninstall' })
    // 下发后 90 秒仍没有回执时记一条警告：旧版本客户端（1.1.6 及以前）根本没有指令处理逻辑，
    // 收到也不会执行也不会回执；有这条日志就能立刻区分「设备太旧」和「设备执行失败」
    const dispatchedAt = deviceCommandState(deviceId).dispatchedAt
    if (sent > 0 && dispatchedAt) {
      setTimeout(() => {
        const state = deviceCommandState(deviceId)
        if (state.ack && state.ack.at >= dispatchedAt) return
        logger.warn({ deviceId, name: rows[0].name, dispatchedAt }, 'device command dispatched without ack in 90s')
      }, 90 * 1000).unref?.()
    }

    await writeAudit({
      actorType: 'user',
      actorId: req.user!.id,
      classId: rows[0].classId,
      action: 'device.uninstall',
      target: deviceId,
      detail: { sent, pending: sent === 0, name: rows[0].name },
      ip: clientIp(req),
    })
    ok(res, { id: deviceId, sent, delivered: sent > 0, pending: sent === 0, clientVersion })
  } catch (error) {
    next(error)
  }
})

/** 单次批量吊销上限：与设备列表扫描上限保持一致量级，避免一次请求锁表过久 */
const DEVICE_BATCH_REVOKE_LIMIT = 200

/** 批量吊销设备：只处理仍为 active 的设备，不存在的条目忽略 */
router.post('/devices/revoke-batch', writeLimiter, async (req, res, next) => {
  try {
    const rawIds = (req.body as { ids?: unknown } | undefined)?.ids
    if (!Array.isArray(rawIds)) throw badRequest('请选择要吊销的设备')
    const ids = Array.from(
      new Set(
        rawIds
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    )
    if (ids.length === 0) throw badRequest('请选择要吊销的设备')
    if (ids.length > DEVICE_BATCH_REVOKE_LIMIT) {
      throw badRequest('单次最多吊销 ' + DEVICE_BATCH_REVOKE_LIMIT + ' 台设备')
    }

    const rows = await db.select().from(devices).where(inArray(devices.id, ids))
    const active = rows.filter((row) => row.status === 'active')
    if (active.length === 0) throw notFound('所选设备已不存在或已被吊销')

    const activeIds = active.map((row) => row.id)
    await db.update(devices).set({ status: 'revoked', tokenHash: null }).where(inArray(devices.id, activeIds))
    for (const id of activeIds) forgetDeviceActivity(id)
    const disconnected = disconnectDeviceSockets(activeIds)
    for (const row of active) {
      await writeAudit({
        actorType: 'user',
        actorId: req.user!.id,
        classId: row.classId,
        action: 'device.revoke',
        target: row.id,
        detail: { batch: true, disconnected: disconnected > 0 },
        ip: clientIp(req),
      })
    }
    ok(res, { requested: ids.length, revoked: active.length, disconnected })
  } catch (error) {
    next(error)
  }
})

/* ------------------------------------------------------------------
 * 通知管理：后台跨班级查看、群发（同一内容多班级）与批量发送（每班不同内容）
 * ------------------------------------------------------------------ */

/** 通知列表单次最多扫描行数 */
const NOTICE_LIST_SCAN_LIMIT = 1000

router.get('/notices', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = pageParams(req.query as Record<string, unknown>)
    const rawKeyword = String(req.query.keyword ?? '').trim()
    const classId = typeof req.query.classId === 'string' ? req.query.classId : ''
    const filters = []
    if (classId) filters.push(eq(notices.classId, classId))
    if (rawKeyword) {
      const pattern = '%' + rawKeyword + '%'
      filters.push(or(like(notices.title, pattern), like(notices.content, pattern), like(classes.name, pattern))!)
    }
    const where = filters.length > 0 ? and(...filters) : undefined
    const rows = await db
      .select({
        id: notices.id,
        classId: notices.classId,
        className: classes.name,
        title: notices.title,
        content: notices.content,
        level: notices.level,
        pinned: notices.pinned,
        popup: notices.popup,
        publishAt: notices.publishAt,
        expireAt: notices.expireAt,
        createdAt: notices.createdAt,
      })
      .from(notices)
      .leftJoin(classes, eq(classes.id, notices.classId))
      .where(where)
      .orderBy(desc(notices.createdAt))
      .limit(NOTICE_LIST_SCAN_LIMIT)
    const [totalRow] = await db.select({ value: count() }).from(notices).leftJoin(classes, eq(classes.id, notices.classId)).where(where)
    ok(res, {
      items: rows.slice(offset, offset + pageSize),
      total: totalRow?.value ?? 0,
      page,
      pageSize,
    })
  } catch (error) {
    next(error)
  }
})

/** 校验目标班级：全部存在且未归档，否则整体拒绝（避免部分成功导致的不一致） */
async function resolveTargetClasses(classIds: unknown): Promise<{ id: string; name: string }[]> {
  const unique = Array.from(new Set((Array.isArray(classIds) ? classIds : []).map((id) => String(id).trim()).filter(Boolean)))
  if (unique.length === 0) throw badRequest('请至少选择一个班级')
  const rows = await db
    .select({ id: classes.id, name: classes.name, status: classes.status })
    .from(classes)
    .where(inArray(classes.id, unique))
  const active = rows.filter((row) => row.status === 'active')
  if (active.length !== unique.length) {
    const missing = unique.filter((id) => !active.some((row) => row.id === id))
    throw badRequest('以下班级不存在或已归档：' + missing.join('、'))
  }
  return active.map((row) => ({ id: row.id, name: row.name }))
}

/** 群发通知：同一份内容一次写入多个班级 */
router.post('/notices/broadcast', writeLimiter, validateBody(noticeBroadcastSchema), async (req, res, next) => {
  try {
    const input = req.validated as {
      classIds: string[]
      title: string
      content: string
      level: 'info' | 'urgent'
      pinned: boolean
      popup: boolean
      expireAt?: string | null
    }
    if (!input.title.trim() && !input.content.trim()) throw badRequest('标题与内容不能同时为空')
    if (!input.pinned && !input.popup) throw badRequest('弹窗提醒与置顶通知至少需要开启一项')
    const targets = await resolveTargetClasses(input.classIds)
    const publishAt = new Date()
    const expireAt = input.expireAt ? new Date(input.expireAt) : null
    const actorId = req.user!.id
    const created: { id: string; classId: string }[] = []
    for (const target of targets) {
      const id = newId()
      await db.insert(notices).values({
        id,
        classId: target.id,
        title: input.title,
        content: input.content,
        level: input.level,
        pinned: input.pinned,
        popup: input.popup,
        publishAt,
        expireAt,
        createdBy: actorId,
      })
      created.push({ id, classId: target.id })
      broadcastChange({ classId: target.id, scope: 'notice', action: 'create', actor: actorId })
    }
    await writeAudit({
      actorType: 'user',
      actorId,
      action: 'notice.broadcast',
      // audit_logs.target 只有 128 字符，多班级群发时拼接全部 id 会超长导致审计写入失败
      target: created.length === 1 ? created[0].id : 'batch:' + created.length,
      detail: { count: created.length, classIds: targets.map((item) => item.id), title: input.title, level: input.level },
      ip: clientIp(req),
    })
    ok(res, { created: created.length, classIds: created.map((item) => item.classId) })
  } catch (error) {
    next(error)
  }
})

/** 批量发送：每个班级一条独立内容 */
router.post('/notices/batch', writeLimiter, validateBody(noticeBatchSchema), async (req, res, next) => {
  try {
    const input = req.validated as {
      items: Array<{
        classId: string
        title: string
        content: string
        level: 'info' | 'urgent'
        pinned: boolean
        popup: boolean
        expireAt?: string | null
      }>
    }
    const filled = input.items.filter((item) => item.title.trim() || item.content.trim())
    if (filled.length === 0) throw badRequest('请至少填写一条通知内容')
    const invalid = filled.find((item) => !item.pinned && !item.popup)
    if (invalid) throw badRequest('每条通知的弹窗提醒与置顶通知至少需要开启一项')
    const targets = await resolveTargetClasses(filled.map((item) => item.classId))
    const classNames = new Map(targets.map((row) => [row.id, row.name]))
    const publishAt = new Date()
    const actorId = req.user!.id
    const created: { id: string; classId: string; className: string }[] = []
    for (const item of filled) {
      const id = newId()
      await db.insert(notices).values({
        id,
        classId: item.classId,
        title: item.title,
        content: item.content,
        level: item.level,
        pinned: item.pinned,
        popup: item.popup,
        publishAt,
        expireAt: item.expireAt ? new Date(item.expireAt) : null,
        createdBy: actorId,
      })
      created.push({ id, classId: item.classId, className: classNames.get(item.classId) ?? '' })
      broadcastChange({ classId: item.classId, scope: 'notice', action: 'create', actor: actorId })
    }
    await writeAudit({
      actorType: 'user',
      actorId,
      action: 'notice.batch',
      target: created.length === 1 ? created[0].id : 'batch:' + created.length,
      detail: { count: created.length, classIds: created.map((item) => item.classId) },
      ip: clientIp(req),
    })
    ok(res, { created: created.length, items: created })
  } catch (error) {
    next(error)
  }
})

/** 删除某条通知（跨班级管理入口） */
router.delete('/notices/:id', writeLimiter, async (req, res, next) => {
  try {
    const noticeId = param(req, 'id')
    const rows = await db.select().from(notices).where(eq(notices.id, noticeId)).limit(1)
    const row = rows[0]
    if (!row) throw notFound('通知不存在')
    await db.delete(noticeReads).where(eq(noticeReads.noticeId, noticeId))
    await db.delete(notices).where(eq(notices.id, noticeId))
    broadcastChange({ classId: row.classId, scope: 'notice', action: 'delete', actor: req.user!.id })
    await writeAudit({
      actorType: 'user',
      actorId: req.user!.id,
      classId: row.classId,
      action: 'notice.delete',
      target: noticeId,
      detail: { title: row.title },
      ip: clientIp(req),
    })
    ok(res, { id: noticeId, deleted: true })
  } catch (error) {
    next(error)
  }
})
router.get('/audit-logs', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = pageParams(req.query as Record<string, unknown>)
    const items = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(pageSize).offset(offset)
    const [totalRow] = await db.select({ value: count() }).from(auditLogs)
    ok(res, { items, total: totalRow?.value ?? 0, page, pageSize })
  } catch (error) {
    next(error)
  }
})

router.get('/settings', async (_req, res, next) => {
  try {
    const rows = await db.select().from(systemSettings)
    const map: Record<string, unknown> = {}
    for (const row of rows) map[row.skey] = row.value
    ok(res, map)
  } catch (error) {
    next(error)
  }
})

router.put('/settings', writeLimiter, async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('请求体必须是对象')
    for (const [rawKey, value] of Object.entries(body)) {
      const key = rawKey.slice(0, 64)
      const existing = await db.select({ skey: systemSettings.skey }).from(systemSettings).where(eq(systemSettings.skey, key)).limit(1)
      if (existing.length > 0) {
        await db.update(systemSettings).set({ value: value as never }).where(eq(systemSettings.skey, key))
      } else {
        await db.insert(systemSettings).values({ skey: key, value: value as never })
      }
    }
    await writeAudit({
      actorType: 'user',
      actorId: req.user!.id,
      action: 'settings.update',
      detail: { keys: Object.keys(body) },
      ip: clientIp(req),
    })
    ok(res, { saved: true })
  } catch (error) {
    next(error)
  }
})

export default router

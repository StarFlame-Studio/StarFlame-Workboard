import { Router } from 'express'
import { and, asc, count, desc, eq, gte, inArray, lte, or, isNull } from 'drizzle-orm'
import qiniu from 'qiniu'
import {
  attendanceSaveSchema,
  boardSettingsSchema,
  DEFAULT_BOARD_SETTINGS,
  examCreateSchema,
  examUpdateSchema,
  homeworkBatchSchema,
  homeworkUpsertSchema,
  noticeCreateSchema,
  noticeUpdateSchema,
  studentCreateSchema,
  studentImportSchema,
  studentUpdateSchema,
  uploadTokenSchema,
  HEADER_DEVICE_TOKEN,
} from '@starflame/shared'
import { db } from '../db/index.js'
import {
  attendanceRecords,
  classes,
  customCards,
  devices,
  examSubjects,
  exams,
  homework,
  noticeReads,
  notices,
  studentLists,
  students,
  subjects,
  teachers,
} from '../db/schema.js'
import { env } from '../env.js'
import { badRequest, conflict, forbidden, notFound, ok, param } from '../lib/http.js'
import { newId } from '../lib/ids.js'
import { writeAudit } from '../lib/audit.js'
import { broadcastChange } from '../realtime/socket.js'
import { clientIp, readLimiter, writeLimiter } from '../middleware/rateLimit.js'
import { requireUserOrDevice, requireWritable } from '../middleware/auth.js'
import { validateBody } from '../middleware/validate.js'

const router = Router()

function todayString(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

async function resolveClassId(req: any): Promise<string> {
  if (req.device) return req.device.classId as string
  const raw = (req.query.classId ?? req.body?.classId ?? '') as string
  if (!raw) throw badRequest('缺少 classId')
  const rows = await db.select().from(classes).where(eq(classes.id, raw)).limit(1)
  const row = rows[0]
  if (!row) throw notFound('班级不存在')
  const user = req.user
  const isAdmin = user.role === 'owner' || user.role === 'admin'
  if (!isAdmin && row.ownerId !== user.id) throw forbidden('无权访问该班级')
  return row.id
}

router.use(requireUserOrDevice)

router.get('/bootstrap', readLimiter, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : todayString()

    const classRows = await db.select().from(classes).where(eq(classes.id, classId)).limit(1)
    const classRow = classRows[0]
    if (!classRow) throw notFound('班级不存在')

    const includeDisabledSubjects = req.query.includeDisabled === '1'
    const subjectRows = await db
      .select()
      .from(subjects)
      .where(
        includeDisabledSubjects
          ? eq(subjects.classId, classId)
          : and(eq(subjects.classId, classId), eq(subjects.enabled, true)),
      )
      .orderBy(asc(subjects.sortIndex))

    const homeworkRows = await db
      .select()
      .from(homework)
      .where(and(eq(homework.classId, classId), eq(homework.dueDate, date)))
      .orderBy(asc(homework.createdAt))

    const examRows = await db
      .select()
      .from(exams)
      .where(and(eq(exams.classId, classId), eq(exams.status, 'planned')))
      .orderBy(asc(exams.createdAt))
      .limit(20)

    const examIds = examRows.map((item) => item.id)
    const examSubjectRows = examIds.length
      ? await db.select().from(examSubjects).where(inArray(examSubjects.examId, examIds)).orderBy(asc(examSubjects.startAt))
      : []

    const noticeRows = await db
      .select()
      .from(notices)
      .where(
        and(
          eq(notices.classId, classId),
          or(isNull(notices.expireAt), gte(notices.expireAt, new Date())),
        ),
      )
      .orderBy(desc(notices.pinned), desc(notices.publishAt))
      .limit(20)

    const noticeIds = noticeRows.map((item) => item.id)
    const noticeReadRows = noticeIds.length
      ? await db.select().from(noticeReads).where(inArray(noticeReads.noticeId, noticeIds))
      : []
    const noticeReadCount = new Map<string, number>()
    const noticeMyRead = new Map<string, Date>()
    for (const row of noticeReadRows) {
      noticeReadCount.set(row.noticeId, (noticeReadCount.get(row.noticeId) ?? 0) + 1)
      if (req.device && row.deviceId === req.device.id) noticeMyRead.set(row.noticeId, row.readAt)
    }

    const studentRows = await db
      .select()
      .from(students)
      .where(and(eq(students.classId, classId), eq(students.status, 'active'), isNull(students.listId)))
      .orderBy(asc(students.sortIndex), asc(students.createdAt))

    const customRows = await db
      .select()
      .from(customCards)
      .where(eq(customCards.classId, classId))
      .orderBy(asc(customCards.sortIndex), asc(customCards.createdAt))

    const [attendanceCount] = await db
      .select({ value: count() })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.classId, classId), eq(attendanceRecords.date, date)))

    const settings = { ...DEFAULT_BOARD_SETTINGS, ...((classRow.settings as Record<string, unknown>) ?? {}) }

    ok(res, {
      class: { id: classRow.id, name: classRow.name, grade: classRow.grade, school: classRow.school },
      settings,
      date,
      subjects: subjectRows.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        color: s.color,
        icon: s.icon,
        sortIndex: s.sortIndex,
        enabled: s.enabled,
      })),
      homework: homeworkRows.map((h) => ({
        id: h.id,
        subjectId: h.subjectId,
        content: h.content ?? '',
        dueDate: h.dueDate,
        status: h.status,
        version: h.version,
        updatedAt: h.updatedAt,
      })),
      exams: examRows.map((e) => ({
        id: e.id,
        title: e.title,
        note: e.note,
        status: e.status,
        subjects: examSubjectRows
          .filter((es) => es.examId === e.id)
          .map((es) => ({
            id: es.id,
            subjectId: es.subjectId,
            startAt: es.startAt,
            endAt: es.endAt,
            room: es.room,
            note: es.note,
          })),
      })),
      notices: noticeRows.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content ?? '',
        level: n.level,
        pinned: n.pinned,
        publishAt: n.publishAt,
        expireAt: n.expireAt,
        popup: n.popup,
        readAt: noticeMyRead.get(n.id)?.toISOString() ?? null,
        readCount: noticeReadCount.get(n.id) ?? 0,
      })),
      students: studentRows.map((s) => ({
        id: s.id,
        name: s.name,
        studentNo: s.studentNo,
        status: s.status,
        sortIndex: s.sortIndex,
      })),
      customCards: customRows.map((c) => ({
        id: c.id,
        title: c.title,
        content: c.content ?? '',
        sortIndex: c.sortIndex,
      })),
      stats: {
        studentCount: studentRows.length,
        homeworkCount: homeworkRows.length,
        hasAttendanceToday: (attendanceCount?.value ?? 0) > 0,
      },
    })
  } catch (error) {
    next(error)
  }
})

router.get('/homework', readLimiter, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const date = typeof req.query.date === 'string' ? req.query.date : todayString()
    const rows = await db
      .select()
      .from(homework)
      .where(and(eq(homework.classId, classId), eq(homework.dueDate, date)))
    ok(res, {
      date,
      items: rows.map((h) => ({
        id: h.id,
        subjectId: h.subjectId,
        content: h.content ?? '',
        dueDate: h.dueDate,
        status: h.status,
        version: h.version,
        updatedAt: h.updatedAt,
      })),
    })
  } catch (error) {
    next(error)
  }
})

async function upsertHomework(classId: string, subjectId: string, date: string, content: string, expectedVersion: number | undefined, actorId: string, force = false) {
  const subjectRows = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.classId, classId)))
    .limit(1)
  if (subjectRows.length === 0) throw badRequest('科目不存在或不属于该班级')

  const existingRows = await db
    .select()
    .from(homework)
    .where(and(eq(homework.classId, classId), eq(homework.subjectId, subjectId), eq(homework.dueDate, date)))
    .limit(1)
  const existing = existingRows[0]

  if (!existing) {
    const recordId = newId()
    await db.insert(homework).values({
      id: recordId,
      classId,
      subjectId,
      content,
      dueDate: date,
      status: 'published',
      version: 1,
      updatedBy: actorId,
    })
    return { id: recordId, subjectId, content, dueDate: date, version: 1, updatedAt: new Date() }
  }

  if (!force && typeof expectedVersion === 'number' && expectedVersion !== existing.version) {
    throw conflict('作业已被其他设备修改，请刷新后重试')
  }
  const nextVersion = existing.version + 1
  await db
    .update(homework)
    .set({ content, version: nextVersion, updatedBy: actorId, updatedAt: new Date() })
    .where(eq(homework.id, existing.id))
  return { id: existing.id, subjectId, content, dueDate: date, version: nextVersion, updatedAt: new Date() }
}

router.put('/homework', writeLimiter, requireWritable, validateBody(homeworkUpsertSchema), async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const input = req.validated as { subjectId: string; date: string; content: string; version?: number; force?: boolean }
    const actorId = req.user?.id ?? req.device?.id ?? ''
    const result = await upsertHomework(classId, input.subjectId, input.date, input.content, input.version, actorId, input.force === true)
    await writeAudit({
      actorType: req.device ? 'device' : 'user',
      actorId,
      classId,
      // 离线回放强制覆盖会记成独立动作，便于事后追查被覆盖的云端内容
      action: input.force === true ? 'board.offlineFlush' : 'homework.update',
      target: result.id,
      detail: { subjectId: input.subjectId, date: input.date },
      ip: clientIp(req),
    })
    broadcastChange({ classId, scope: 'homework', action: 'update', actor: actorId })
    ok(res, result)
  } catch (error) {
    next(error)
  }
})

router.put('/homework/batch', writeLimiter, requireWritable, validateBody(homeworkBatchSchema), async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const input = req.validated as { date: string; items: Array<{ subjectId: string; content: string }> }
    const actorId = req.user?.id ?? req.device?.id ?? ''
    let saved = 0
    for (const item of input.items) {
      await upsertHomework(classId, item.subjectId, input.date, item.content, undefined, actorId)
      saved += 1
    }
    await writeAudit({
      actorType: req.device ? 'device' : 'user',
      actorId,
      classId,
      action: 'homework.batch',
      detail: { date: input.date, count: saved },
      ip: clientIp(req),
    })
    broadcastChange({ classId, scope: 'homework', action: 'update', actor: actorId })
    ok(res, { date: input.date, saved })
  } catch (error) {
    next(error)
  }
})

router.get('/students', readLimiter, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const includeLeft = req.query.includeLeft === '1'
    const listId = typeof req.query.listId === 'string' ? req.query.listId : ''
    const listFilter = listId ? eq(students.listId, listId) : isNull(students.listId)
    const where = includeLeft
      ? and(eq(students.classId, classId), listFilter)
      : and(eq(students.classId, classId), eq(students.status, 'active'), listFilter)
    const rows = await db.select().from(students).where(where).orderBy(asc(students.sortIndex), asc(students.createdAt))
    ok(res, {
      items: rows.map((s) => ({
        id: s.id,
        name: s.name,
        studentNo: s.studentNo,
        status: s.status,
        sortIndex: s.sortIndex,
      })),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/students', writeLimiter, requireWritable, validateBody(studentCreateSchema), async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const input = req.validated as { name: string; studentNo?: string | null }
    const listIdRaw = typeof req.body?.listId === 'string' ? req.body.listId : ''
    const listId = listIdRaw || null
    const [maxRow] = await db
      .select({ value: count() })
      .from(students)
      .where(eq(students.classId, classId))
    const id = newId()
    await db.insert(students).values({
      id,
      classId,
      listId,
      name: input.name,
      studentNo: input.studentNo ?? null,
      status: 'active',
      sortIndex: maxRow?.value ?? 0,
    })
    ok(res, { id, name: input.name, studentNo: input.studentNo ?? null, status: 'active', sortIndex: maxRow?.value ?? 0 })
  } catch (error) {
    next(error)
  }
})

router.patch('/students/:id', writeLimiter, requireWritable, validateBody(studentUpdateSchema), async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const studentId = param(req, 'id')
    const input = req.validated as Record<string, unknown>
    const rows = await db
      .select()
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.classId, classId)))
      .limit(1)
    if (!rows[0]) throw notFound('学生不存在')
    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.studentNo !== undefined) patch.studentNo = input.studentNo
    if (input.status !== undefined) patch.status = input.status
    if (input.sortIndex !== undefined) patch.sortIndex = input.sortIndex
    if (Object.keys(patch).length === 0) throw badRequest('没有需要更新的字段')
    await db.update(students).set(patch).where(eq(students.id, studentId))
    ok(res, { id: studentId, updated: true })
  } catch (error) {
    next(error)
  }
})

router.delete('/students/:id', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const studentId = param(req, 'id')
    const rows = await db
      .select()
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.classId, classId)))
      .limit(1)
    if (!rows[0]) throw notFound('学生不存在')
    await db.update(students).set({ status: 'left' }).where(eq(students.id, studentId))
    await db.delete(attendanceRecords).where(and(eq(attendanceRecords.classId, classId), eq(attendanceRecords.studentId, studentId)))
    ok(res, { id: studentId, removed: true })
  } catch (error) {
    next(error)
  }
})

router.post('/students/import', writeLimiter, requireWritable, validateBody(studentImportSchema), async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const input = req.validated as { text: string }
    const names = input.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 200)
    if (names.length === 0) throw badRequest('没有可导入的姓名')

    const [maxRow] = await db.select({ value: count() }).from(students).where(eq(students.classId, classId))
    let sortStart = maxRow?.value ?? 0
    const values = names.map((name) => {
      const record = { id: newId(), classId, name, status: 'active' as const, sortIndex: sortStart }
      sortStart += 1
      return record
    })
    await db.insert(students).values(values)
    await writeAudit({
      actorType: req.device ? 'device' : 'user',
      actorId: req.user?.id ?? req.device?.id ?? '',
      classId,
      action: 'student.import',
      detail: { count: values.length },
      ip: clientIp(req),
    })
    ok(res, { imported: values.length })
  } catch (error) {
    next(error)
  }
})

router.post('/subjects', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const name = String(req.body?.name ?? '').trim()
    if (!name) throw badRequest('科目名称不能为空')
    if (name.length > 32) throw badRequest('科目名称过长')
    const [maxRow] = await db.select({ value: count() }).from(subjects).where(eq(subjects.classId, classId))
    const id = newId()
    const code = 'custom-' + id.slice(-8)
    await db.insert(subjects).values({
      id,
      classId,
      code,
      name,
      color: '#8A93A6',
      icon: 'mdi-book-outline',
      sortIndex: maxRow?.value ?? 0,
      enabled: true,
    })
    ok(res, { id, name, code, enabled: true, sortIndex: maxRow?.value ?? 0, color: '#8A93A6', icon: 'mdi-book-outline' })
  } catch (error) {
    next(error)
  }
})

router.delete('/subjects/:id', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const subjectId = param(req, 'id')
    const rows = await db
      .select()
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.classId, classId)))
      .limit(1)
    if (!rows[0]) throw notFound('科目不存在')
    await db.delete(subjects).where(eq(subjects.id, subjectId))
    ok(res, { id: subjectId, deleted: true })
  } catch (error) {
    next(error)
  }
})

router.get('/teachers', readLimiter, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const rows = await db
      .select()
      .from(teachers)
      .where(eq(teachers.classId, classId))
      .orderBy(asc(teachers.sortIndex), asc(teachers.createdAt))
    ok(res, {
      items: rows.map((t) => ({
        id: t.id,
        name: t.name,
        subject: t.subject,
        isHeadTeacher: t.isHeadTeacher,
      })),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/teachers', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const name = String(req.body?.name ?? '').trim()
    if (!name) throw badRequest('教师姓名不能为空')
    const [maxRow] = await db.select({ value: count() }).from(teachers).where(eq(teachers.classId, classId))
    const id = newId()
    await db.insert(teachers).values({
      id,
      classId,
      name: name.slice(0, 32),
      subject: typeof req.body?.subject === 'string' ? req.body.subject.slice(0, 32) : null,
      isHeadTeacher: Boolean(req.body?.isHeadTeacher),
      sortIndex: maxRow?.value ?? 0,
    })
    ok(res, { id, name, subject: req.body?.subject ?? null, isHeadTeacher: Boolean(req.body?.isHeadTeacher) })
  } catch (error) {
    next(error)
  }
})

router.delete('/teachers/:id', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const teacherId = param(req, 'id')
    const rows = await db
      .select()
      .from(teachers)
      .where(and(eq(teachers.id, teacherId), eq(teachers.classId, classId)))
      .limit(1)
    if (!rows[0]) throw notFound('教师不存在')
    await db.delete(teachers).where(eq(teachers.id, teacherId))
    ok(res, { id: teacherId, deleted: true })
  } catch (error) {
    next(error)
  }
})

router.patch('/subjects/:id', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const subjectId = param(req, 'id')
    const rows = await db
      .select()
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.classId, classId)))
      .limit(1)
    if (!rows[0]) throw notFound('科目不存在')

    const patch: Record<string, unknown> = {}
    if (typeof req.body?.name === 'string') {
      const name = req.body.name.trim()
      if (!name) throw badRequest('科目名称不能为空')
      patch.name = name.slice(0, 32)
    }
    if (typeof req.body?.enabled === 'boolean') patch.enabled = req.body.enabled
    if (typeof req.body?.color === 'string') patch.color = req.body.color.slice(0, 16)
    if (typeof req.body?.sortIndex === 'number') patch.sortIndex = Math.trunc(req.body.sortIndex)
    if (Object.keys(patch).length === 0) throw badRequest('没有需要更新的字段')

    await db.update(subjects).set(patch).where(eq(subjects.id, subjectId))
    ok(res, { id: subjectId, updated: true })
  } catch (error) {
    next(error)
  }
})

router.patch('/subjects-order', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const order = Array.isArray(req.body?.order) ? req.body.order : []
    if (order.length === 0) throw badRequest('排序数据为空')
    for (const [index, id] of order.entries()) {
      if (typeof id !== 'string') continue
      await db
        .update(subjects)
        .set({ sortIndex: index })
        .where(and(eq(subjects.id, id), eq(subjects.classId, classId)))
    }
    ok(res, { saved: order.length })
  } catch (error) {
    next(error)
  }
})

router.get('/lists', readLimiter, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const listRows = await db
      .select()
      .from(studentLists)
      .where(eq(studentLists.classId, classId))
      .orderBy(asc(studentLists.sortIndex), asc(studentLists.createdAt))

    const [defaultCount] = await db
      .select({ value: count() })
      .from(students)
      .where(and(eq(students.classId, classId), eq(students.status, 'active'), isNull(students.listId)))

    const items = [
      { id: '', name: '默认名单', isDefault: true, studentCount: defaultCount?.value ?? 0 },
    ]

    for (const list of listRows) {
      const [row] = await db
        .select({ value: count() })
        .from(students)
        .where(and(eq(students.classId, classId), eq(students.status, 'active'), eq(students.listId, list.id)))
      items.push({ id: list.id, name: list.name, isDefault: false, studentCount: row?.value ?? 0 })
    }

    ok(res, { items })
  } catch (error) {
    next(error)
  }
})

router.post('/lists', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const name = String(req.body?.name ?? '').trim()
    if (!name) throw badRequest('列表名称不能为空')
    if (name.length > 32) throw badRequest('列表名称过长')
    const [maxRow] = await db.select({ value: count() }).from(studentLists).where(eq(studentLists.classId, classId))
    const id = newId()
    await db.insert(studentLists).values({
      id,
      classId,
      name,
      isDefault: false,
      sortIndex: maxRow?.value ?? 0,
    })
    ok(res, { id, name, isDefault: false, studentCount: 0 })
  } catch (error) {
    next(error)
  }
})

router.patch('/lists/:id', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const listId = param(req, 'id')
    const name = String(req.body?.name ?? '').trim()
    if (!name) throw badRequest('列表名称不能为空')
    const rows = await db
      .select()
      .from(studentLists)
      .where(and(eq(studentLists.id, listId), eq(studentLists.classId, classId)))
      .limit(1)
    if (!rows[0]) throw notFound('列表不存在')
    await db.update(studentLists).set({ name: name.slice(0, 32) }).where(eq(studentLists.id, listId))
    ok(res, { id: listId, updated: true })
  } catch (error) {
    next(error)
  }
})

router.delete('/lists/:id', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const listId = param(req, 'id')
    const rows = await db
      .select()
      .from(studentLists)
      .where(and(eq(studentLists.id, listId), eq(studentLists.classId, classId)))
      .limit(1)
    if (!rows[0]) throw notFound('列表不存在')
    await db.update(students).set({ listId: null }).where(eq(students.listId, listId))
    await db.delete(studentLists).where(eq(studentLists.id, listId))
    ok(res, { id: listId, deleted: true })
  } catch (error) {
    next(error)
  }
})

router.get('/exams', readLimiter, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const rows = await db.select().from(exams).where(eq(exams.classId, classId)).orderBy(desc(exams.createdAt)).limit(50)
    const ids = rows.map((r) => r.id)
    const subRows = ids.length ? await db.select().from(examSubjects).where(inArray(examSubjects.examId, ids)) : []
    ok(res, {
      items: rows.map((e) => ({
        id: e.id,
        title: e.title,
        note: e.note,
        room: e.room,
        status: e.status,
        subjects: subRows
          .filter((s) => s.examId === e.id)
          .map((s) => ({ id: s.id, subjectId: s.subjectId, name: s.name, startAt: s.startAt, endAt: s.endAt, room: s.room, note: s.note })),
      })),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/exams', writeLimiter, requireWritable, validateBody(examCreateSchema), async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const input = req.validated as {
      title: string
      note?: string | null
      room?: string | null
      subjects: Array<{ subjectId?: string | null; name?: string | null; startAt: string; endAt: string; room?: string | null; note?: string | null }>
    }
    const examId = newId()
    await db.transaction(async (tx) => {
      await tx.insert(exams).values({
        id: examId,
        classId,
        title: input.title,
        note: input.note ?? null,
        room: input.room ?? null,
        status: 'planned',
      })
      await tx.insert(examSubjects).values(
        input.subjects.map((item, index) => ({
          id: newId(),
          examId,
          subjectId: item.subjectId || null,
          name: item.name ?? null,
          startAt: new Date(item.startAt),
          endAt: new Date(item.endAt),
          room: item.room ?? null,
          note: item.note ?? null,
          sortIndex: index,
        })),
      )
    })
    broadcastChange({ classId, scope: 'exam', action: 'create' })
    ok(res, { id: examId, title: input.title })
  } catch (error) {
    next(error)
  }
})

router.patch('/exams/:id', writeLimiter, requireWritable, validateBody(examUpdateSchema), async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const examId = param(req, 'id')
    const rows = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), eq(exams.classId, classId)))
      .limit(1)
    if (!rows[0]) throw notFound('考试不存在')
    const input = req.validated as {
      title?: string
      note?: string | null
      status?: 'planned' | 'finished'
      room?: string | null
      subjects?: Array<{ subjectId?: string | null; name?: string | null; startAt: string; endAt: string; room?: string | null; note?: string | null }>
    }
    const patch: Record<string, unknown> = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.note !== undefined) patch.note = input.note
    if (input.room !== undefined) patch.room = input.room
    if (input.status !== undefined) patch.status = input.status
    await db.transaction(async (tx) => {
      if (Object.keys(patch).length > 0) {
        await tx.update(exams).set(patch).where(eq(exams.id, examId))
      }
      if (input.subjects) {
        await tx.delete(examSubjects).where(eq(examSubjects.examId, examId))
        await tx.insert(examSubjects).values(
          input.subjects.map((item, index) => ({
            id: newId(),
            examId,
            subjectId: item.subjectId || null,
            name: item.name ?? null,
            startAt: new Date(item.startAt),
            endAt: new Date(item.endAt),
            room: item.room ?? null,
            note: item.note ?? null,
            sortIndex: index,
          })),
        )
      }
    })
    broadcastChange({ classId, scope: 'exam', action: 'update' })
    ok(res, { id: examId, updated: true })
  } catch (error) {
    next(error)
  }
})

router.delete('/exams/:id', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const examId = param(req, 'id')
    const rows = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), eq(exams.classId, classId)))
      .limit(1)
    if (!rows[0]) throw notFound('考试不存在')
    await db.delete(exams).where(eq(exams.id, examId))
    broadcastChange({ classId, scope: 'exam', action: 'delete' })
    ok(res, { id: examId, deleted: true })
  } catch (error) {
    next(error)
  }
})

router.get('/attendance', readLimiter, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const date = typeof req.query.date === 'string' ? req.query.date : todayString()
    const rows = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.classId, classId), eq(attendanceRecords.date, date)))
    ok(res, {
      date,
      records: rows.map((r) => ({ studentId: r.studentId, status: r.status, note: r.note })),
    })
  } catch (error) {
    next(error)
  }
})

router.put('/attendance', writeLimiter, requireWritable, validateBody(attendanceSaveSchema), async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const input = req.validated as { date: string; records: Array<{ studentId: string; status: string; note?: string | null }> }
    const actorId = req.user?.id ?? req.device?.id ?? ''
    await db.transaction(async (tx) => {
      for (const record of input.records) {
        const existing = await tx
          .select()
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.classId, classId),
              eq(attendanceRecords.date, input.date),
              eq(attendanceRecords.studentId, record.studentId),
            ),
          )
          .limit(1)
        if (existing[0]) {
          await tx
            .update(attendanceRecords)
            .set({ status: record.status as never, note: record.note ?? null, updatedBy: actorId })
            .where(eq(attendanceRecords.id, existing[0].id))
        } else {
          await tx.insert(attendanceRecords).values({
            id: newId(),
            classId,
            date: input.date,
            studentId: record.studentId,
            status: record.status as never,
            note: record.note ?? null,
            updatedBy: actorId,
          })
        }
      }
    })
    await writeAudit({
      actorType: req.device ? 'device' : 'user',
      actorId,
      classId,
      action: 'attendance.save',
      detail: { date: input.date, count: input.records.length },
      ip: clientIp(req),
    })
    broadcastChange({ classId, scope: 'attendance', action: 'update', actor: actorId })
    ok(res, { date: input.date, saved: input.records.length })
  } catch (error) {
    next(error)
  }
})

router.get('/notices', readLimiter, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const includeExpired = String(req.query.includeExpired ?? '') === '1'
    const rows = await db
      .select()
      .from(notices)
      .where(
        includeExpired
          ? eq(notices.classId, classId)
          : and(eq(notices.classId, classId), or(isNull(notices.expireAt), gte(notices.expireAt, new Date()))),
      )
      .orderBy(desc(notices.pinned), desc(notices.publishAt))
      .limit(50)

    const ids = rows.map((item) => item.id)
    const readRows = ids.length
      ? await db.select().from(noticeReads).where(inArray(noticeReads.noticeId, ids))
      : []
    const deviceRows = await db
      .select({ id: devices.id, name: devices.name })
      .from(devices)
      .where(and(eq(devices.classId, classId), eq(devices.status, 'active')))
      .orderBy(asc(devices.createdAt))

    const readCount = new Map<string, number>()
    const byNotice = new Map<string, { deviceId: string; readAt: string }[]>()
    const myRead = new Map<string, string>()
    for (const row of readRows) {
      readCount.set(row.noticeId, (readCount.get(row.noticeId) ?? 0) + 1)
      const list = byNotice.get(row.noticeId) ?? []
      list.push({ deviceId: row.deviceId, readAt: row.readAt.toISOString() })
      byNotice.set(row.noticeId, list)
      if (req.device && row.deviceId === req.device.id) myRead.set(row.noticeId, row.readAt.toISOString())
    }

    ok(res, {
      items: rows.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content ?? '',
        level: n.level,
        pinned: n.pinned,
        popup: n.popup,
        publishAt: n.publishAt,
        expireAt: n.expireAt,
        readCount: readCount.get(n.id) ?? 0,
        readAt: myRead.get(n.id) ?? null,
        reads: byNotice.get(n.id) ?? [],
      })),
      devices: deviceRows,
      deviceCount: deviceRows.length,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/notices', writeLimiter, requireWritable, validateBody(noticeCreateSchema), async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const input = req.validated as {
      title: string
      content: string
      level: 'info' | 'urgent'
      pinned: boolean
      popup: boolean
      expireAt?: string | null
    }
    if (!input.pinned && !input.popup) throw badRequest('弹窗提醒与置顶通知至少需要开启一项')
    const id = newId()
    const actorId = req.user?.id ?? req.device?.id ?? ''
    await db.insert(notices).values({
      id,
      classId,
      title: input.title,
      content: input.content,
      level: input.level,
      pinned: input.pinned,
      popup: input.popup,
      publishAt: new Date(),
      expireAt: input.expireAt ? new Date(input.expireAt) : null,
      createdBy: actorId,
    })
    await writeAudit({
      actorType: req.device ? 'device' : 'user',
      actorId,
      classId,
      action: 'notice.create',
      target: id,
      ip: clientIp(req),
    })
    broadcastChange({ classId, scope: 'notice', action: 'create', actor: actorId })
    ok(res, { id, title: input.title })
  } catch (error) {
    next(error)
  }
})

router.patch('/notices/:id', writeLimiter, requireWritable, validateBody(noticeUpdateSchema), async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const noticeId = param(req, 'id')
    const rows = await db
      .select()
      .from(notices)
      .where(and(eq(notices.id, noticeId), eq(notices.classId, classId)))
      .limit(1)
    if (!rows[0]) throw notFound('通知不存在')
    const input = req.validated as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.content !== undefined) patch.content = input.content
    if (input.level !== undefined) patch.level = input.level
    if (input.pinned !== undefined) patch.pinned = input.pinned
    if (input.popup !== undefined) patch.popup = input.popup
    if (input.expireAt !== undefined) patch.expireAt = input.expireAt ? new Date(input.expireAt as string) : null
    if (Object.keys(patch).length === 0) throw badRequest('没有需要更新的字段')
    const nextPinned = (patch.pinned as boolean | undefined) ?? rows[0].pinned
    const nextPopup = (patch.popup as boolean | undefined) ?? rows[0].popup
    if (!nextPinned && !nextPopup) throw badRequest('弹窗提醒与置顶通知至少需要开启一项')
    await db.update(notices).set(patch).where(eq(notices.id, noticeId))
    broadcastChange({ classId, scope: 'notice', action: 'update' })
    ok(res, { id: noticeId, updated: true })
  } catch (error) {
    next(error)
  }
})

router.delete('/notices/:id', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const noticeId = param(req, 'id')
    const rows = await db
      .select()
      .from(notices)
      .where(and(eq(notices.id, noticeId), eq(notices.classId, classId)))
      .limit(1)
    if (!rows[0]) throw notFound('通知不存在')
    await db.delete(notices).where(eq(notices.id, noticeId))
    broadcastChange({ classId, scope: 'notice', action: 'delete' })
    ok(res, { id: noticeId, deleted: true })
  } catch (error) {
    next(error)
  }
})

router.post('/notices/:id/read', readLimiter, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const noticeId = param(req, 'id')
    const rows = await db
      .select()
      .from(notices)
      .where(and(eq(notices.id, noticeId), eq(notices.classId, classId)))
      .limit(1)
    if (!rows[0]) throw notFound('通知不存在')

    const deviceId = req.device?.id
    if (!deviceId) {
      ok(res, { id: noticeId, readAt: new Date().toISOString(), readCount: 0 })
      return
    }

    const existing = await db
      .select()
      .from(noticeReads)
      .where(and(eq(noticeReads.noticeId, noticeId), eq(noticeReads.deviceId, deviceId)))
      .limit(1)

    let readAt = existing[0]?.readAt ?? null
    if (!existing[0]) {
      readAt = new Date()
      await db.insert(noticeReads).values({ noticeId, deviceId, readAt })
      broadcastChange({ classId, scope: 'notice', action: 'update', actor: deviceId })
    }
    const [total] = await db
      .select({ value: count() })
      .from(noticeReads)
      .where(eq(noticeReads.noticeId, noticeId))
    ok(res, { id: noticeId, readAt: readAt ? readAt.toISOString() : null, readCount: total?.value ?? 0 })
  } catch (error) {
    next(error)
  }
})

router.get('/custom-cards', readLimiter, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const rows = await db
      .select()
      .from(customCards)
      .where(eq(customCards.classId, classId))
      .orderBy(asc(customCards.sortIndex), asc(customCards.createdAt))
    ok(res, { items: rows.map((c) => ({ id: c.id, title: c.title, content: c.content ?? '', sortIndex: c.sortIndex })) })
  } catch (error) {
    next(error)
  }
})

router.post('/custom-cards', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const title = String(req.body?.title ?? '').trim()
    if (!title) throw badRequest('卡片名称不能为空')
    if (title.length > 32) throw badRequest('卡片名称过长')
    const [maxRow] = await db.select({ value: count() }).from(customCards).where(eq(customCards.classId, classId))
    const id = newId()
    await db.insert(customCards).values({
      id,
      classId,
      title,
      content: '',
      sortIndex: maxRow?.value ?? 0,
    })
    ok(res, { id, title, content: '', sortIndex: maxRow?.value ?? 0 })
  } catch (error) {
    next(error)
  }
})

router.patch('/custom-cards/:id', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const cardId = param(req, 'id')
    const rows = await db
      .select()
      .from(customCards)
      .where(and(eq(customCards.id, cardId), eq(customCards.classId, classId)))
      .limit(1)
    if (!rows[0]) throw notFound('卡片不存在')
    const patch: Record<string, unknown> = {}
    if (typeof req.body?.title === 'string') {
      const title = req.body.title.trim()
      if (!title) throw badRequest('卡片名称不能为空')
      patch.title = title.slice(0, 32)
    }
    if (typeof req.body?.content === 'string') patch.content = req.body.content.slice(0, 4000)
    if (Object.keys(patch).length === 0) throw badRequest('没有需要更新的字段')
    await db.update(customCards).set(patch).where(eq(customCards.id, cardId))
    ok(res, { id: cardId, updated: true })
  } catch (error) {
    next(error)
  }
})

router.delete('/custom-cards/:id', writeLimiter, requireWritable, async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const cardId = param(req, 'id')
    const rows = await db
      .select()
      .from(customCards)
      .where(and(eq(customCards.id, cardId), eq(customCards.classId, classId)))
      .limit(1)
    if (!rows[0]) throw notFound('卡片不存在')
    await db.delete(customCards).where(eq(customCards.id, cardId))
    ok(res, { id: cardId, deleted: true })
  } catch (error) {
    next(error)
  }
})

router.patch('/settings', writeLimiter, requireWritable, validateBody(boardSettingsSchema), async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const input = req.validated as { settings: Record<string, unknown> }
    const rows = await db.select({ settings: classes.settings }).from(classes).where(eq(classes.id, classId)).limit(1)
    const current = ((rows[0]?.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>
    const merged = { ...current, ...input.settings }
    await db.update(classes).set({ settings: merged as never }).where(eq(classes.id, classId))
    broadcastChange({ classId, scope: 'settings', action: 'update' })
    ok(res, { settings: merged })
  } catch (error) {
    next(error)
  }
})

router.post('/uploads/token', writeLimiter, requireWritable, validateBody(uploadTokenSchema), async (req, res, next) => {
  try {
    const classId = await resolveClassId(req)
    const input = req.validated as { fileName: string; mime: string; size: number }
    if (!env.qiniu.accessKey || !env.qiniu.secretKey || !env.qiniu.bucket) {
      throw badRequest('图床未配置，请联系管理员')
    }
    const ext = input.mime === 'image/png' ? 'png' : input.mime === 'image/webp' ? 'webp' : 'jpg'
    const date = new Date()
    const key = 'class/' + classId + '/' + date.getFullYear() + '/' + String(date.getMonth() + 1).padStart(2, '0') + '/' + newId() + '.' + ext
    const mac = new qiniu.auth.digest.Mac(env.qiniu.accessKey, env.qiniu.secretKey)
    const options = { scope: env.qiniu.bucket + ':' + key, expires: 3600, fsizeLimit: 10 * 1024 * 1024, mimeLimit: input.mime }
    const policy = new qiniu.rs.PutPolicy(options)
    const uploadToken = policy.uploadToken(mac)
    ok(res, {
      uploadToken,
      key,
      domain: env.qiniu.domain,
      url: 'https://' + env.qiniu.domain + '/' + key,
      expiresIn: 3600,
    })
  } catch (error) {
    next(error)
  }
})

export default router

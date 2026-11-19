import { Router } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { classes, examSubjects, exams, subjects } from '../db/schema.js'
import { notFound } from '../lib/http.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { getServerTime } from '../lib/ntp.js'

const router = Router()

const publicLimiter = rateLimit({ name: 'public.read', windowMs: 60_000, max: 60 })

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// 原项目展示格式：YYYY/MM/DD HH:mm
function formatDisplay(value: Date): string {
  return (
    value.getFullYear() + '/' + pad(value.getMonth() + 1) + '/' + pad(value.getDate()) +
    ' ' + pad(value.getHours()) + ':' + pad(value.getMinutes())
  )
}

/**
 * GET /public/exams/:id
 * 公开读取考试配置（供 ExamSchedule / EA2 播放器通过 configUrl 拉取）
 * 只暴露考试本身内容，不含班级、设备等敏感信息
 */
router.get('/exams/:id', publicLimiter, async (req, res, next) => {
  try {
    const examId = String(req.params.id ?? '')
    if (!examId || examId.length > 64) throw notFound('配置不存在')

    const examRows = await db.select().from(exams).where(eq(exams.id, examId)).limit(1)
    const exam = examRows[0]
    if (!exam) throw notFound('配置不存在')

    const classRows = await db.select({ status: classes.status }).from(classes).where(eq(classes.id, exam.classId)).limit(1)
    if (!classRows[0] || classRows[0].status !== 'active') throw notFound('配置不可用')

    const subRows = await db
      .select()
      .from(examSubjects)
      .where(and(eq(examSubjects.examId, examId)))
      .orderBy(examSubjects.sortIndex)
    const subjectRows = await db
      .select({ id: subjects.id, name: subjects.name })
      .from(subjects)
      .where(eq(subjects.classId, exam.classId))
    const nameOf = new Map(subjectRows.map((s) => [s.id, s.name]))

    const payload = {
      examName: exam.title,
      message: exam.note ?? '',
      room: exam.room ?? '',
      examInfos: subRows.map((item) => ({
        name: item.name ?? nameOf.get(item.subjectId ?? '') ?? '其他',
        start: formatDisplay(item.startAt),
        end: formatDisplay(item.endAt),
        alertTime: 15,
      })),
    }

    // 允许跨域：ExamSchedule 与 EA2 来自其他域名
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.json(payload)
  } catch (error) {
    next(error)
  }
})

/**
 * GET /public/time
 * 返回校准到阿里云 NTP 的服务器时间，供前端时钟对齐
 * 同步失败时降级为服务器系统时钟（不会报错）
 */
router.get('/time', publicLimiter, async (req, res, next) => {
  try {
    // classId 可选：带上时按该班级设置的时间源校准，不带则用默认（阿里云 NTP）
    const rawClassId = typeof req.query.classId === 'string' ? req.query.classId : ''
    const classId = /^[A-Za-z0-9_-]{8,40}$/.test(rawClassId) ? rawClassId : ''
    const snapshot = await getServerTime(classId)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'no-store')
    res.json(snapshot)
  } catch (error) {
    next(error)
  }
})

export default router

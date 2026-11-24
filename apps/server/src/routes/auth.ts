import { Router, type Request } from 'express'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { loginSchema, refreshSchema, registerSchema } from '@starflame/shared'
import { db } from '../db/index.js'
import { classMembers, refreshTokens, users } from '../db/schema.js'
import { env } from '../env.js'
import { badCredentials, conflict, ok, unauthorized } from '../lib/http.js'
import { newId } from '../lib/ids.js'
import { addDays, randomToken, sha256, signAccessToken } from '../lib/tokens.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { clientIp, loginLimiter, registerLimiter } from '../middleware/rateLimit.js'
import { validateBody } from '../middleware/validate.js'
import { requireUser } from '../middleware/auth.js'

const router = Router()

type DbUser = typeof users.$inferSelect

function userPayload(user: DbUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl ?? null,
  }
}

async function issueTokens(req: Request, user: DbUser) {
  const rawRefresh = randomToken(32)
  await db.insert(refreshTokens).values({
    id: newId(),
    subjectType: 'user',
    subjectId: user.id,
    tokenHash: sha256(rawRefresh),
    expiresAt: addDays(env.refreshTokenDays),
    userAgent: (req.headers['user-agent'] ?? '').slice(0, 255),
    ip: clientIp(req),
  })
  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role, typ: 'user' }),
    refreshToken: rawRefresh,
  }
}

/** 由邮箱本地部分推导唯一用户名 */
async function deriveUsername(email: string): Promise<string> {
  const raw = email.split('@')[0] ?? ''
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24)
  const base = cleaned.length >= 3 ? cleaned : (cleaned + 'user').slice(0, 3)
  let candidate = base
  for (let i = 0; i < 20; i += 1) {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.username, candidate)).limit(1)
    if (rows.length === 0) return candidate
    candidate = (base + String(Math.floor(Math.random() * 9000) + 1000)).slice(0, 32)
  }
  return (base + Date.now().toString(36).slice(-5)).slice(0, 32)
}

router.post('/register', registerLimiter, validateBody(registerSchema), async (req, res, next) => {
  try {
    const input = req.validated as { email: string; password: string; name?: string }
    const email = input.email.trim().toLowerCase()
    const duplicate = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (duplicate.length > 0) throw conflict('该邮箱已注册')

    const username = await deriveUsername(email)
    const userId = newId()
    await db.insert(users).values({
      id: userId,
      username,
      email,
      passwordHash: await hashPassword(input.password),
      name: (input.name ?? '').trim() || username,
      // 注册即管理员：可创建班级、凭班级 ID 加入已有班级，并管理自己创建/加入的班级
      role: 'admin',
      status: 'active',
    })
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    const user = rows[0]!
    const tokens = await issueTokens(req, user)
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId))
    ok(res, { ...tokens, user: userPayload(user) })
  } catch (error) {
    next(error)
  }
})

router.post('/login', loginLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const input = req.validated as { account?: string; username?: string; password: string }
    const account = (input.account ?? input.username ?? '').trim()
    const rows = await db
      .select()
      .from(users)
      .where(or(eq(users.username, account), eq(users.email, account.toLowerCase())))
      .limit(1)
    const user = rows[0]
    const passwordOk = user ? await verifyPassword(input.password, user.passwordHash) : false
    if (!user || !passwordOk || user.status !== 'active') {
      throw badCredentials()
    }
    const tokens = await issueTokens(req, user)
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))
    ok(res, { ...tokens, user: userPayload(user) })
  } catch (error) {
    next(error)
  }
})

router.post('/refresh', validateBody(refreshSchema), async (req, res, next) => {
  try {
    const input = req.validated as { refreshToken: string }
    const hash = sha256(input.refreshToken)
    const rows = await db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())))
      .limit(1)
    const record = rows[0]
    if (!record || record.subjectType !== 'user') {
      throw unauthorized('刷新令牌无效或已过期')
    }
    const userRows = await db.select().from(users).where(eq(users.id, record.subjectId)).limit(1)
    const user = userRows[0]
    if (!user || user.status !== 'active') {
      throw unauthorized('账号不可用')
    }

    const tokens = await issueTokens(req, user)
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, record.id))
    ok(res, { ...tokens, user: userPayload(user) })
  } catch (error) {
    next(error)
  }
})

router.post('/logout', validateBody(refreshSchema), async (req, res, next) => {
  try {
    const input = req.validated as { refreshToken: string }
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, sha256(input.refreshToken)))
    ok(res, { loggedOut: true })
  } catch (error) {
    next(error)
  }
})

router.get('/me', requireUser, async (req, res, next) => {
  try {
    const rows = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1)
    const user = rows[0]
    if (!user) throw unauthorized()
    const memberships = await db
      .select({ classId: classMembers.classId, role: classMembers.role })
      .from(classMembers)
      .where(eq(classMembers.userId, user.id))
    ok(res, { ...userPayload(user), memberships })
  } catch (error) {
    next(error)
  }
})

export default router

import { Router } from 'express'
import { ok } from '../lib/http.js'
import { readLimiter } from '../middleware/rateLimit.js'
import { logger } from '../logger.js'
import {
  hitokotoPoolStats,
  normalizeCategories,
  takeHitokoto,
  type HitokotoPayload,
} from '../services/hitokotoPool.js'

const router = Router()

/**
 * 一言 API 代理
 *
 * 数据源改由服务端缓存池供给：服务端先并发拉取 50 条存在内存池里，
 * 前端每请求一条就从池里取一条；池内剩余不足阈值时后台自动补满 50 条。
 * 这样大屏换句不再受 Cloudflare 抖动/限流影响，响应延迟也从数百毫秒降到毫秒级。
 * 池整体不可用时仍返回上一次成功的结果（stale 兜底），前端再降级为浏览器直连。
 */
const STALE_TTL_MS = 30 * 60 * 1000

export type { HitokotoPayload }

/** 每个分类组合最近一次成功出池的结果，用于上游整体故障时的 stale 兜底 */
const staleCache = new Map<string, { at: number; payload: HitokotoPayload }>()

router.get('/hitokoto', readLimiter, async (req, res) => {
  const categories = normalizeCategories(req.query.categories ?? req.query.c)
  const key = categories.join('')
  const payload = await takeHitokoto(categories)
  if (payload) {
    staleCache.set(key, { at: Date.now(), payload })
    ok(res, { ...payload, source: 'hitokoto', cached: false })
    return
  }
  const stale = staleCache.get(key)
  if (stale && Date.now() - stale.at < STALE_TTL_MS) {
    logger.warn({ categories, ageMs: Date.now() - stale.at }, '一言缓存池枯竭，返回上次结果兜底')
    ok(res, { ...stale.payload, source: 'hitokoto', cached: true, stale: true })
    return
  }
  logger.warn({ categories }, '一言缓存池与上游均不可用，已通知前端降级为浏览器直连')
  res.status(502).json({ code: 50200, message: '一言获取失败', data: null })
})

/** 缓存池运行状态（巡检用，不含敏感信息） */
router.get('/hitokoto/status', readLimiter, (_req, res) => {
  ok(res, { pools: hitokotoPoolStats() })
})

export default router

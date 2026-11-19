import { logger } from '../logger.js'

/**
 * 一言云端缓存池
 *
 * 背景：大屏首页每次换句都直连 v1.hitokoto.cn，遇到 Cloudflare 抖动或限流就断句。
 * 现在改为服务端先并发拉取 POOL_SIZE 条存进内存池，前端每次请求从池里取一条；
 * 池内剩余不足 REFILL_THRESHOLD 条时，后台静默补满 POOL_SIZE 条，前端无感。
 *
 * 池按「分类组合」分槽：categories 为空表示全部分类，'a,d,i' 表示这三个分类。
 * 上游不支持批量返回（num 参数被忽略），因此补池是并发多次单条请求。
 */

const UPSTREAM_HOST = 'v1.hitokoto.cn/'
const UPSTREAM_TIMEOUT_MS = 4000
/** 云服务器到 Cloudflare 的 443 常被阻断，80 可用，因此 http 优先、https 兜底 */
let preferredProtocol: 'http:' | 'https:' | null = null
const UPSTREAM_TRIES = 2

/** 每次补池的目标条数 */
const POOL_SIZE = 50
/** 池内剩余条数低于该值时触发补池 */
const REFILL_THRESHOLD = 10
/** 补池并发数：实测上游 10 并发 50 条约 2.7 秒全部成功 */
const REFILL_CONCURRENCY = 10
/** 去重记忆上限，超过后整体清空（只影响「最近是否重复」的偏好，不影响正确性） */
const SEEN_LIMIT = 600

const VALID_CATEGORIES = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'])

/** 服务端违规拦截：命中即丢弃，避免违规内容进大屏 */
const SERVER_BLOCKLIST: string[] = [
  '傻逼', '傻B', '煞笔', '二逼', '脑残', '智障', '白痴', '贱人', '婊子', '去死',
  '你妈', '妈的', '草泥马', '尼玛', '卧槽', '我操', '狗日',
  '色情', '黄片', '裸聊', '约炮', '性交', '做爱', '淫秽', '嫖娼', '卖淫', '强奸',
  '杀人', '自杀', '割腕', '恐怖袭击', '枪支', '冰毒', '海洛因', '赌博', '博彩', '毒品',
  '法轮功', '台独', '藏独', '疆独', '港独', '颠覆国家',
  '加微信', '代刷', '代练', '刷单', '办证', '高利贷',
]

export interface HitokotoPayload {
  text: string
  from: string
  fromWho: string
  type: string
}

interface PoolState {
  /** 待取用的句子（队列，从左取） */
  items: HitokotoPayload[]
  /** 最近出现过的句子，用于补池时跳过重复 */
  seen: Set<string>
  /** 正在进行的补池任务；并发请求共享同一个 Promise，避免空池时集体返回空 */
  pending: Promise<void> | null
  /** 最近一次补池完成时间 */
  lastRefillAt: number
  /** 最近一次补池失败时间 */
  lastErrorAt: number
  /** 累计补池成功条数 */
  filled: number
  /** 累计出池条数 */
  served: number
}

const pools = new Map<string, PoolState>()

function poolOf(key: string): PoolState {
  let state = pools.get(key)
  if (!state) {
    state = {
      items: [],
      seen: new Set<string>(),
      pending: null,
      lastRefillAt: 0,
      lastErrorAt: 0,
      filled: 0,
      served: 0,
    }
    pools.set(key, state)
  }
  return state
}

/** 归一化分类参数：非法值丢弃、去重、最多 12 个 */
export function normalizeCategories(raw: unknown): string[] {
  const text = String(raw ?? '')
  const list = text
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => VALID_CATEGORIES.has(item))
  return Array.from(new Set(list)).slice(0, 12)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isBlocked(text: string): boolean {
  return SERVER_BLOCKLIST.some((word) => text.includes(word))
}

async function fetchOnce(categories: string[], protocol: 'http:' | 'https:'): Promise<HitokotoPayload | null> {
  const url = new URL(protocol + '//' + UPSTREAM_HOST)
  url.searchParams.set('encode', 'json')
  for (const category of categories) url.searchParams.append('c', category)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'starflame-workboard/1.0' },
      signal: controller.signal,
    })
    if (!response.ok) return null
    const data = (await response.json()) as Record<string, unknown>
    const text = asString(data.hitokoto)
    if (!text || isBlocked(text)) return null
    preferredProtocol = protocol
    return {
      text,
      from: asString(data.from),
      fromWho: asString(data.from_who),
      type: asString(data.type),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 取一条上游句子，带 http/https 协议回退与重试 */
async function fetchUpstream(categories: string[]): Promise<HitokotoPayload | null> {
  const protocols: Array<'http:' | 'https:'> = preferredProtocol
    ? [preferredProtocol]
    : ['http:', 'https:']
  for (let attempt = 0; attempt < UPSTREAM_TRIES; attempt += 1) {
    for (const protocol of protocols) {
      const payload = await fetchOnce(categories, protocol)
      if (payload) return payload
    }
  }
  return null
}

async function runRefill(key: string, categories: string[], state: PoolState): Promise<void> {
  if (state.items.length >= POOL_SIZE) return
  /**
   * 尝试预算按满池条数的四倍给：补池期间池子仍会被并发取用，
   * 去重与上游偶发失败也会消耗尝试次数，预算按 need 算会导致池子补不满。
   */
  const budget = POOL_SIZE * 4
  let attempts = 0
  let gained = 0
  const worker = async (): Promise<void> => {
    // 目标是「补到 target」，不是「试满预算」：两者任一达成即收工
    while (state.items.length < POOL_SIZE && attempts < budget) {
      attempts += 1
      const payload = await fetchUpstream(categories)
      if (!payload) continue
      // 并发 worker 可能同时返回，落队前再判一次，避免超出池容量
      if (state.items.length >= POOL_SIZE) break
      if (state.seen.has(payload.text)) continue
      if (state.items.some((item) => item.text === payload.text)) continue
      state.items.push(payload)
      state.seen.add(payload.text)
      gained += 1
    }
  }
  const needNow = POOL_SIZE - state.items.length
  const workers = Math.max(1, Math.min(REFILL_CONCURRENCY, needNow))
  try {
    await Promise.all(Array.from({ length: workers }, worker))
    if (state.seen.size > SEEN_LIMIT) state.seen.clear()
    if (gained > 0) {
      state.filled += gained
      state.lastRefillAt = Date.now()
      logger.info(
        { pool: key || '*', gained, available: state.items.length, target: POOL_SIZE },
        '一言缓存池已补满',
      )
    } else {
      state.lastErrorAt = Date.now()
      logger.warn({ pool: key || '*', available: state.items.length }, '一言缓存池补充失败，沿用旧池')
    }
  } catch (error) {
    state.lastErrorAt = Date.now()
    logger.warn({ pool: key || '*', error }, '一言缓存池补充异常')
  }
}

/** 触发补池；同一分槽同时只跑一个补池任务，调用方共享同一个 Promise */
function ensureRefill(key: string, categories: string[], state: PoolState): Promise<void> {
  if (state.pending) return state.pending
  if (state.items.length >= POOL_SIZE) return Promise.resolve()
  const task = runRefill(key, categories, state).finally(() => {
    if (state.pending === task) state.pending = null
  })
  state.pending = task
  return task
}

/**
 * 从池中取一条句子。
 * - 池为空：等待补池完成后再取（并发请求共享同一次补池，不会集体落空）
 * - 取用后剩余 <= REFILL_THRESHOLD：后台补池，不阻塞本次响应
 * - 补池失败且池仍为空：返回 null，由路由决定 stale 兜底或 502
 */
export async function takeHitokoto(categories: string[]): Promise<HitokotoPayload | null> {
  const key = categories.join(',')
  const state = poolOf(key)
  if (state.items.length === 0) {
    await ensureRefill(key, categories, state)
  }
  const payload = state.items.shift() ?? null
  if (payload) {
    state.served += 1
    if (state.items.length <= REFILL_THRESHOLD) void ensureRefill(key, categories, state)
  }
  return payload
}

/** 服务启动时预热默认池（全部分类），避免大屏首屏等一次补池 */
export function warmupHitokotoPool(): void {
  const state = poolOf('')
  void ensureRefill('', [], state)
}

/** 运行状态（调试 / 巡检用） */
export function hitokotoPoolStats(): Array<{
  pool: string
  available: number
  target: number
  threshold: number
  refilling: boolean
  filled: number
  served: number
  lastRefillAt: number
  lastErrorAt: number
}> {
  return Array.from(pools.entries()).map(([key, state]) => ({
    pool: key || '*',
    available: state.items.length,
    target: POOL_SIZE,
    threshold: REFILL_THRESHOLD,
    refilling: state.pending !== null,
    filled: state.filled,
    served: state.served,
    lastRefillAt: state.lastRefillAt,
    lastErrorAt: state.lastErrorAt,
  }))
}

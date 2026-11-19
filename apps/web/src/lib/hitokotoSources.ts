import { apiBase } from './api'
import { randomBuiltinSentence } from './hitokotoBuiltin'

/** 一言可用的数据源 */
export type HitokotoSourceId = 'builtin' | 'hitokoto' | 'zhaoyu' | 'jinrishici' | 'custom'

export interface HitokotoSentence {
  content: string
  author: string
  origin: string
  source: HitokotoSourceId
}

export interface HitokotoConfig {
  enabled: boolean
  refreshInterval: number
  sources: HitokotoSourceId[]
  categories: string[]
  customUrl: string
  jinrishiciToken: string
  sensitiveWords: string
}

export const ALL_SOURCES: Array<{ value: HitokotoSourceId; title: string; desc: string }> = [
  { value: 'builtin', title: '内置词库', desc: '随应用打包的 1000+ 条句子，永不失败' },
  { value: 'hitokoto', title: '一言 API', desc: '优先由星焰服务器代取，失败时浏览器直连 v1.hitokoto.cn' },
  { value: 'zhaoyu', title: '诏语', desc: 'hub.saintic.com 公开句子接口' },
  { value: 'jinrishici', title: '今日诗词', desc: '需要 Token，可一键获取' },
  { value: 'custom', title: '自定义接口', desc: '返回 JSON 或纯文本均可' },
]

/** 一言官方分类（对应 c 参数） */
export const HITOKOTO_CATEGORIES: Array<{ value: string; title: string }> = [
  { value: 'a', title: '动画' },
  { value: 'b', title: '漫画' },
  { value: 'c', title: '游戏' },
  { value: 'd', title: '文学' },
  { value: 'e', title: '原创' },
  { value: 'f', title: '来自网络' },
  { value: 'g', title: '其他' },
  { value: 'h', title: '影视' },
  { value: 'i', title: '诗词' },
  { value: 'j', title: '网易云' },
  { value: 'k', title: '哲学' },
  { value: 'l', title: '抖机灵' },
]

export const DEFAULT_REFRESH_SECONDS = 600
/** 默认数据源顺序（与原项目班级配置一致） */
export const DEFAULT_SOURCES: HitokotoSourceId[] = ['hitokoto', 'jinrishici', 'zhaoyu', 'builtin']
const FETCH_TIMEOUT_MS = 6000
const MAX_TRIES_PER_SOURCE = 2
const MAX_BUILTIN_TRIES = 20

export function sourceLabel(id: HitokotoSourceId): string {
  return ALL_SOURCES.find((item) => item.value === id)?.title ?? id
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asSourceList(value: unknown): HitokotoSourceId[] {
  const valid = ALL_SOURCES.map((item) => item.value)
  const raw = Array.isArray(value) ? value : []
  const list = raw.filter((item): item is HitokotoSourceId => typeof item === 'string' && valid.includes(item as HitokotoSourceId))
  return list.length > 0 ? list : [...DEFAULT_SOURCES]
}

function asCategoryList(value: unknown): string[] {
  const valid = HITOKOTO_CATEGORIES.map((item) => item.value)
  const raw = Array.isArray(value) ? value : []
  return raw.filter((item): item is string => typeof item === 'string' && valid.includes(item))
}

/** 从 classes.settings 解析出一言配置，缺省值按契约走 */
export function readHitokotoConfig(settings: Record<string, unknown> | undefined): HitokotoConfig {
  const source = settings ?? {}
  const interval = Number(source['hitokoto.refreshInterval'])
  return {
    enabled: source['hitokoto.enabled'] !== false,
    refreshInterval: Number.isFinite(interval) ? Math.min(3600, Math.max(0, Math.floor(interval))) : DEFAULT_REFRESH_SECONDS,
    sources: asSourceList(source['hitokoto.sources']),
    categories: asCategoryList(source['hitokoto.categories']),
    customUrl: asString(source['hitokoto.customUrl']).trim(),
    jinrishiciToken: asString(source['hitokoto.jinrishiciToken']).trim(),
    sensitiveWords: asString(source['hitokoto.sensitiveWords']),
  }
}

// ---------------- 违规 / 敏感词检测 ----------------

/** 原项目的五个内置敏感词，用 base64 存放，避免明文出现在源码里 */
const GLOBAL_SENSITIVE_ENCODED = ['6IO4', '5Lmz', '6JCd6I6J', '5rer', '5aW4']

/** 面向校园大屏的违规词表：辱骂 / 色情 / 暴恐违法 / 广告引流 */
const SCHOOL_BLOCKLIST: string[] = [
  '傻逼', '傻B', '傻b', '煞笔', '沙比', '二逼', '脑残', '智障', '白痴', '蠢货',
  '废物', '垃圾人', '贱人', '贱货', '婊子', '滚蛋', '去死', '干死', '操你', '日你',
  '你妈', '妈的', '草泥马', '尼玛', '卧槽', '我操', '靠北', '狗日的', '狗东西',
  '色情', '黄片', '裸聊', '约炮', '性交', '做爱', '淫秽', '嫖娼', '卖淫', '情色',
  '强奸', '轮奸', '自慰', '抽插', '三级片', '成人片',
  '杀人', '自杀', '割腕', '恐怖袭击', '爆头', '枪支', '弹药', '冰毒', '摇头丸',
  '海洛因', '赌博', '博彩', '洗钱', '传销', '诈骗', '毒品', '迷药',
  '法轮功', '台独', '藏独', '疆独', '港独', '颠覆国家', '煽动颠覆',
  '加微信', '加Q群', '代刷', '代练', '刷单', '办证', '高利贷', '裸贷', '私彩',
]

function decodeBase64Utf8(encoded: string): string {
  try {
    const binary = atob(encoded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

const GLOBAL_SENSITIVE_WORDS: string[] = GLOBAL_SENSITIVE_ENCODED.map(decodeBase64Utf8).filter(Boolean)

/** 合并全局词表与用户自定义词表（逗号 / 空格 / 换行分隔） */
export function sensitiveWordList(extra = ''): string[] {
  const custom = extra
    .split(/[,,、\s]+/)
    .map((word) => word.trim())
    .filter(Boolean)
  return Array.from(new Set([...GLOBAL_SENSITIVE_WORDS, ...SCHOOL_BLOCKLIST, ...custom]))
}

/** 命中任一敏感词即视为违规 */
export function isContentBlocked(text: string, extraWords = ''): boolean {
  const content = text.trim()
  if (!content) return true
  return sensitiveWordList(extraWords).some((word) => content.includes(word))
}

// ---------------- 各数据源抓取 ----------------

async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers,
      mode: 'cors',
      signal: controller.signal,
    })
    if (!response.ok) return null
    const text = await response.text()
    try {
      return JSON.parse(text) as unknown
    } catch {
      // 对方直接返回纯文本时也接受
      return { __text: text }
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function pickString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/**
 * 服务端代取（推荐路径）：/api/misc/hitokoto
 * 服务端维护 50 条的云端缓存池（余量降到 10 条时后台自动补满），并做违规词过滤，
 * 因此这个请求通常是纯内存取值；服务端与上游都不可用时返回 502，这里再降级为浏览器直连。
 */
async function fetchHitokotoFromServer(config: HitokotoConfig): Promise<HitokotoSentence | null> {
  const params = new URLSearchParams()
  if (config.categories.length > 0) params.set('categories', config.categories.join(','))
  const query = params.toString()
  const url = apiBase + '/misc/hitokoto' + (query ? '?' + query : '')
  const data = await fetchJson(url)
  if (!data || typeof data !== 'object') return null
  const body = data as Record<string, unknown>
  // 统一 envelope：{ code, message, data }
  const envelope = body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : body
  const content = pickString(envelope, ['text', 'content', 'hitokoto'])
  if (!content) return null
  return {
    content,
    author: pickString(envelope, ['fromWho', 'from_who', 'author', 'creator']),
    origin: pickString(envelope, ['from', 'origin']),
    source: 'hitokoto',
  }
}

/** 浏览器直连（降级路径）：服务端不可用时前端自己打 v1.hitokoto.cn */
async function fetchHitokotoDirect(config: HitokotoConfig): Promise<HitokotoSentence | null> {
  const params = new URLSearchParams({ encode: 'json' })
  for (const category of config.categories) params.append('c', category)
  const data = await fetchJson('https://v1.hitokoto.cn/?' + params.toString())
  if (!data || typeof data !== 'object') return null
  const item = data as Record<string, unknown>
  const content = pickString(item, ['hitokoto'])
  if (!content) return null
  return {
    content,
    author: pickString(item, ['from_who', 'creator']),
    origin: pickString(item, ['from', 'from_who']),
    source: 'hitokoto',
  }
}

async function fetchFromHitokoto(config: HitokotoConfig): Promise<HitokotoSentence | null> {
  const fromServer = await fetchHitokotoFromServer(config)
  if (fromServer) return fromServer
  return fetchHitokotoDirect(config)
}

async function fetchFromZhaoyu(): Promise<HitokotoSentence | null> {
  const data = await fetchJson('https://hub.saintic.com/openservice/sentence/all.json')
  if (!data || typeof data !== 'object') return null
  const payload = data as Record<string, unknown>
  if (payload.success === false) return null
  const body = (payload.data ?? payload) as Record<string, unknown>
  const content = pickString(body, ['sentence', 'content', 'name'])
  if (!content) return null
  return {
    content,
    author: pickString(body, ['author', 'name']),
    origin: pickString(body, ['origin', 'name', 'source']),
    source: 'zhaoyu',
  }
}

async function fetchFromJinrishici(config: HitokotoConfig): Promise<HitokotoSentence | null> {
  // 没有 Token 时自动向今日诗词申请一个；Token 失效（status !== 'success'）时重新申请再试一次
  const request = async (token: string): Promise<Record<string, unknown> | null> => {
    if (!token) return null
    const url = 'https://v2.jinrishici.com/one.json?client=npm-sdk/1.0&X-User-Token=' + encodeURIComponent(token)
    const data = await fetchJson(url)
    if (!data || typeof data !== 'object') return null
    const payload = data as Record<string, unknown>
    return payload.status === 'success' ? payload : null
  }
  let payload = await request(config.jinrishiciToken)
  if (!payload) payload = await request(await fetchJinrishiciToken())
  if (!payload) return null
  const body = (payload.data ?? {}) as Record<string, unknown>
  const content = pickString(body, ['content'])
  if (!content) return null
  const origin = (body.origin ?? {}) as Record<string, unknown>
  return {
    content,
    author: pickString(origin, ['author']),
    origin: pickString(origin, ['title']),
    source: 'jinrishici',
  }
}

async function fetchFromCustom(config: HitokotoConfig): Promise<HitokotoSentence | null> {
  if (!/^https?:\/\//i.test(config.customUrl)) return null
  const data = await fetchJson(config.customUrl)
  if (data === null) return null
  if (typeof data === 'string') return { content: data, author: '', origin: '', source: 'custom' }
  const body = data as Record<string, unknown>
  const nested =
    body.data && typeof body.data === 'object' && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : null
  const payload = nested ?? body
  const raw =
    pickString(payload, ['__text', 'content', 'hitokoto', 'sentence', 'text', 'name']) ??
    pickString(body, ['__text', 'content', 'hitokoto', 'sentence', 'text', 'name'])
  if (!raw) return null
  return {
    content: raw,
    author: pickString(payload, ['author', 'from_who', 'creator']),
    origin: pickString(payload, ['origin', 'from', 'source', 'title']),
    source: 'custom',
  }
}

const FETCHERS: Record<Exclude<HitokotoSourceId, 'builtin'>, (config: HitokotoConfig) => Promise<HitokotoSentence | null>> = {
  hitokoto: fetchFromHitokoto,
  zhaoyu: fetchFromZhaoyu,
  jinrishici: fetchFromJinrishici,
  custom: fetchFromCustom,
}

/** 请求今日诗词官方拿一个 Token（设置页的一键获取按钮用） */
export async function fetchJinrishiciToken(): Promise<string> {
  const data = await fetchJson('https://v2.jinrishici.com/token')
  if (!data || typeof data !== 'object') return ''
  const payload = data as Record<string, unknown>
  return pickString(payload, ['data'])
}

export interface PickResult {
  sentence: HitokotoSentence
  /** 本轮尝试中因违规被丢弃的条数 */
  blocked: number
  /** 远程源是否全部失败 */
  remoteFailed: boolean
}


export async function pickHitokoto(config: HitokotoConfig): Promise<PickResult> {
  const remoteSources = config.sources.filter(
    (item): item is Exclude<HitokotoSourceId, 'builtin'> => item !== 'builtin',
  )
  let blocked = 0

  // 按设置里勾选的数据源顺序依次尝试：前面的源能取到就一直用它，取不到才轮到后面的
  for (const source of remoteSources) {
    for (let attempt = 0; attempt < MAX_TRIES_PER_SOURCE; attempt += 1) {
      const sentence = await FETCHERS[source](config)
      if (!sentence) break
      if (isContentBlocked(sentence.content, config.sensitiveWords)) {
        blocked += 1
        continue
      }
      return { sentence, blocked, remoteFailed: false }
    }
  }

  // 所有远程源都不可用（或全部命中敏感词）时回退内置词库
  for (let attempt = 0; attempt < MAX_BUILTIN_TRIES; attempt += 1) {
    const builtin = randomBuiltinSentence()
    if (isContentBlocked(builtin.content, config.sensitiveWords)) {
      blocked += 1
      continue
    }
    return { sentence: { ...builtin, source: 'builtin' }, blocked, remoteFailed: remoteSources.length > 0 }
  }

  const fallback = randomBuiltinSentence()
  return { sentence: { ...fallback, source: 'builtin' }, blocked, remoteFailed: remoteSources.length > 0 }
}

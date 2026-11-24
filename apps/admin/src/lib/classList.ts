import { getData } from '@/lib/api'

/** 服务端班级列表每页上限（apps/server/src/routes/admin.ts 的 pageParams 会把 pageSize 夹到 100） */
const PAGE_SIZE = 100
/** 翻页保护上限，避免 total 异常时无限请求 */
const MAX_PAGES = 50

export interface ClassListPage<T> {
  items: T[]
  total: number
}

/**
 * 取全部班级（自动翻页）。
 * 后台列表原来只请求第 1 页 20 条，班级超过一页时会出现「列表加载不完全」——
 * 分页是客户端做的，服务端分页不取全，后面的班级就永远看不到。
 */
export async function loadAllClasses<T>(params?: { keyword?: string }): Promise<ClassListPage<T>> {
  const keyword = params?.keyword?.trim() || undefined
  const items: T[] = []
  let total = 0
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await getData<{ items?: T[]; total?: number }>('/admin/classes', {
      keyword,
      page,
      pageSize: PAGE_SIZE,
    })
    total = Number(response.total ?? 0)
    const batch = Array.isArray(response.items) ? response.items : []
    items.push(...batch)
    // 取空、已取满 total、或不足一页（服务端没有更多）时结束
    if (batch.length === 0 || items.length >= total || batch.length < PAGE_SIZE) break
  }
  return { items, total }
}

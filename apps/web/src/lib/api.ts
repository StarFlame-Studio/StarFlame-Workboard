import axios from 'axios'
import { DEVICE_TOKEN_STORAGE_KEY, ERROR_CODE, HEADER_DEVICE_TOKEN } from '@starflame/shared'

export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

const PROD_API_BASE = 'https://zyapi.yanhuoyiyou.cn/api'

export const apiBase =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  (import.meta.env.PROD ? PROD_API_BASE : '/api')

export const http = axios.create({
  baseURL: apiBase,
  timeout: 15000,
  headers: { Accept: 'application/json' },
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY)
  if (token) {
    config.headers[HEADER_DEVICE_TOKEN] = token
  }
  return config
})

export class ApiError extends Error {
  readonly code: number
  readonly status: number
  constructor(message: string, code: number, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/** 本地缓存模式下的写入拦截器（由 dataSource 注册） */
export type LocalWriteHook = (method: 'post' | 'put' | 'patch' | 'delete', url: string, body: unknown) => Promise<unknown>
/** 本地缓存模式下的读取拦截器，返回 undefined 表示不接管 */
export type LocalReadHook = (url: string, params?: Record<string, unknown>) => unknown

/** 任意请求成功即认为服务器可达（供离线态快速自愈） */
type ReachableHook = () => void
let reachableHook: ReachableHook | null = null

export function setReachableHook(hook: ReachableHook | null): void {
  reachableHook = hook
}

let localWriteHook: LocalWriteHook | null = null
let localReadHook: LocalReadHook | null = null
/** 在线读取成功后的旁路回调，用于把集合响应存一份给离线模式用 */
export type ReadNoteHook = (url: string, params: Record<string, unknown> | undefined, data: unknown) => void
let readNoteHook: ReadNoteHook | null = null

export function setReadNoteHook(hook: ReadNoteHook | null): void {
  readNoteHook = hook
}

export function setLocalWriteHook(hook: LocalWriteHook | null): void {
  localWriteHook = hook
}

export function setLocalReadHook(hook: LocalReadHook | null): void {
  localReadHook = hook
}

function handledLocally(url: string): boolean {
  if (!localWriteHook) return false
  return url.startsWith('/board/') && url !== '/board/bootstrap'
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

http.interceptors.response.use(
  (response) => {
    if (reachableHook) {
      try {
        reachableHook()
      } catch {
        // 可达性回调失败不影响请求
      }
    }
    return response
  },
  (error) => {
    const status = error.response?.status ?? 0
    const body = error.response?.data as { code?: number; message?: string } | undefined
    const code = body?.code ?? (status === 0 ? ERROR_CODE.INTERNAL : ERROR_CODE.INTERNAL)
    const message =
      body?.message ?? (status === 0 ? '网络不可用，请检查网络后重试' : '请求失败，请稍后重试')

    if (status === 401 && onUnauthorized) {
      onUnauthorized()
    }
    return Promise.reject(new ApiError(message, code, status))
  },
)

export async function getData<T>(
  url: string,
  params?: Record<string, unknown>,
  config?: { timeout?: number },
): Promise<T> {
  if (localReadHook) {
    const local = localReadHook(url, params)
    if (local !== undefined) return local as T
  }
  const response = await http.get<ApiEnvelope<T>>(url, { params, ...config })
  if (readNoteHook) {
    try {
      readNoteHook(url, params, response.data.data)
    } catch {
      // 缓存旁路失败不影响主流程
    }
  }
  return response.data.data
}

export async function postData<T>(url: string, body?: unknown): Promise<T> {
  if (handledLocally(url)) return (await localWriteHook!('post', url, body)) as T
  const response = await http.post<ApiEnvelope<T>>(url, body)
  return response.data.data
}

export async function putData<T>(url: string, body?: unknown): Promise<T> {
  if (handledLocally(url)) return (await localWriteHook!('put', url, body)) as T
  const response = await http.put<ApiEnvelope<T>>(url, body)
  return response.data.data
}

export async function patchData<T>(url: string, body?: unknown): Promise<T> {
  if (handledLocally(url)) return (await localWriteHook!('patch', url, body)) as T
  const response = await http.patch<ApiEnvelope<T>>(url, body)
  return response.data.data
}

export async function deleteData<T>(url: string): Promise<T> {
  if (handledLocally(url)) return (await localWriteHook!('delete', url, undefined)) as T
  const response = await http.delete<ApiEnvelope<T>>(url)
  return response.data.data
}

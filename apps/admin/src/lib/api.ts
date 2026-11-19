import axios from 'axios'
import { ACCESS_TOKEN_STORAGE_KEY, REFRESH_TOKEN_STORAGE_KEY } from '@starflame/shared'

export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

const PROD_API_BASE = 'https://zyapi.yanhuoyiyou.cn/api'

export const apiBase =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  (import.meta.env.PROD ? PROD_API_BASE : '/api')

export const http = axios.create({ baseURL: apiBase, timeout: 15000 })

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  if (token) config.headers.Authorization = 'Bearer ' + token
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

let refreshing: Promise<string | null> | null = null
let onLogout: (() => void) | null = null

export function setLogoutHandler(handler: () => void): void {
  onLogout = handler
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
  if (!refreshToken) return null
  try {
    const response = await axios.post<ApiEnvelope<{ accessToken: string; refreshToken: string }>>(
      apiBase + '/auth/refresh',
      { refreshToken },
      { timeout: 12000 },
    )
    const data = response.data.data
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, data.accessToken)
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, data.refreshToken)
    return data.accessToken
  } catch {
    return null
  }
}

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status ?? 0
    const body = error.response?.data as { code?: number; message?: string } | undefined
    const config = error.config as { _retried?: boolean; headers: Record<string, string> } | undefined

    if (status === 401 && config && !config._retried) {
      config._retried = true
      refreshing = refreshing ?? refreshAccessToken()
      const token = await refreshing
      refreshing = null
      if (token) {
        config.headers.Authorization = 'Bearer ' + token
        return http.request(config)
      }
      onLogout?.()
    }

    const message = body?.message ?? (status === 0 ? '网络不可用' : '请求失败')
    return Promise.reject(new ApiError(message, body?.code ?? 50000, status))
  },
)

export async function getData<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await http.get<ApiEnvelope<T>>(url, { params })
  return response.data.data
}
export async function postData<T>(url: string, body?: unknown): Promise<T> {
  const response = await http.post<ApiEnvelope<T>>(url, body)
  return response.data.data
}
export async function patchData<T>(url: string, body?: unknown): Promise<T> {
  const response = await http.patch<ApiEnvelope<T>>(url, body)
  return response.data.data
}
export async function putData<T>(url: string, body?: unknown): Promise<T> {
  const response = await http.put<ApiEnvelope<T>>(url, body)
  return response.data.data
}
export async function deleteData<T>(url: string): Promise<T> {
  const response = await http.delete<ApiEnvelope<T>>(url)
  return response.data.data
}

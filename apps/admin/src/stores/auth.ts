import { defineStore } from 'pinia'
import {
  ACCESS_TOKEN_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
  type UserInfo,
} from '@starflame/shared'
import { getData, postData } from '@/lib/api'

interface LoginResult {
  accessToken: string
  refreshToken: string
  user: UserInfo
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as UserInfo | null,
    loading: false,
  }),
  getters: {
    loggedIn: (state) => Boolean(state.user),
    isAdmin: (state) => state.user?.role === 'owner' || state.user?.role === 'admin',
  },
  actions: {
    persist(result: LoginResult) {
      localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, result.accessToken)
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, result.refreshToken)
      localStorage.setItem('sf.userRole', result.user.role)
      this.user = result.user
    },
    async login(account: string, password: string) {
      const result = await postData<LoginResult>('/auth/login', { account, password })
      this.persist(result)
      return result.user
    },
    async register(email: string, password: string, name?: string) {
      const result = await postData<LoginResult>('/auth/register', { email, password, name })
      this.persist(result)
      return result.user
    },
    async loadMe() {
      const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
      if (!token) return null
      this.loading = true
      try {
        const user = await getData<UserInfo>('/auth/me')
        localStorage.setItem('sf.userRole', user.role)
        this.user = user
        return user
      } catch {
        this.user = null
        return null
      } finally {
        this.loading = false
      }
    },
    async logout() {
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
      if (refreshToken) {
        try {
          await postData('/auth/logout', { refreshToken })
        } catch {
          // 忽略
        }
      }
      this.clear()
    },
    clear() {
      localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
      localStorage.removeItem('sf.userRole')
      this.user = null
    },
    /** 同步读取本地缓存角色，用于挂载前判断（避免教师落到无权限页面） */
    cachedRole(): string {
      return localStorage.getItem('sf.userRole') ?? ''
    },
  },
})

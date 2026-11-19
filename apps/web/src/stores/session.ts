import { defineStore } from 'pinia'
import { DEVICE_TOKEN_STORAGE_KEY, type AccessPermission, type DeviceRole } from '@starflame/shared'
import { getData, postData } from '@/lib/api'

export type AccessRole = DeviceRole

export type { AccessPermission }

export interface LoginResult {
  deviceToken: string
  expiresAt: string | null
  role: AccessRole
  roleLabel?: string
  permission: AccessPermission
  device: { id: string; name: string; uuid: string | null; isReadOnly: boolean }
  class: { id: string; name: string; grade: string | null; school: string | null }
}

export interface DeviceMe {
  device: {
    id: string
    name: string
    isReadOnly: boolean
    role: AccessRole
    roleLabel?: string
    isGuest?: boolean
    permission: AccessPermission
    lastSeenAt: string | null
  }
  class: { id: string; name: string; grade: string | null; school: string | null }
  settings: Record<string, unknown>
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    token: localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY) ?? '',
    device: null as DeviceMe['device'] | null,
    classInfo: null as DeviceMe['class'] | null,
    settings: {} as Record<string, unknown>,
    role: 'terminal' as AccessRole,
    roleLabel: '' as string,
    permission: 'write' as AccessPermission,
    ready: false,
  }),
  getters: {
    bound: (state) => Boolean(state.token),
    classId: (state) => state.classInfo?.id ?? '',
    /** 只读授权：界面隐藏/禁用一切写操作 */
    readOnly: (state) => state.permission === 'read' || Boolean(state.device?.isReadOnly),
    /** 游客登录（只输班级码，恒定只读） */
    isGuest: (state) => state.role === 'guest',
    /** 身份中文名：服务端返回什么用什么，否则本地兜底 */
    roleText: (state) => state.roleLabel || state.device?.roleLabel || (state.role === 'guest' ? '游客' : ''),
  },
  actions: {
    /**
     * 授权码留空 = 游客只读登录（是否允许由班级设置决定）。
     * 设备名称可选：留空时服务端按授权码身份（一体机 / 老师 / 学生 / 家长 / 游客）自动命名。
     */
    async login(classCode: string, accessCode: string, uuid: string, deviceName?: string) {
      const result = await postData<LoginResult>('/device/login', {
        classCode,
        accessCode: accessCode || undefined,
        deviceName: deviceName?.trim() || undefined,
        uuid,
      })
      localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, result.deviceToken)
      this.token = result.deviceToken
      this.device = { ...result.device, role: result.role, permission: result.permission, lastSeenAt: null }
      this.classInfo = result.class
      this.role = result.role
      this.roleLabel = result.roleLabel ?? ''
      this.permission = result.permission
      this.ready = true
      return result
    },
    async loadMe() {
      if (!this.token) return null
      const result = await getData<DeviceMe>('/device/me')
      this.device = result.device
      this.classInfo = result.class
      this.settings = result.settings ?? {}
      this.role = result.device.role
      this.roleLabel = result.device.roleLabel ?? ''
      this.permission = result.device.permission
      this.ready = true
      return result
    },
    async heartbeat() {
      if (!this.token) return
      try {
        await postData('/device/heartbeat')
      } catch {
        // 心跳失败不阻塞界面
      }
    },
    async logout() {
      try {
        await postData('/device/logout')
      } catch {
        // 忽略
      }
      this.clear()
    },
    clear() {
      localStorage.removeItem(DEVICE_TOKEN_STORAGE_KEY)
      this.token = ''
      this.device = null
      this.classInfo = null
      this.settings = {}
      this.role = 'terminal'
      this.roleLabel = ''
      this.permission = 'write'
      this.ready = false
    },
  },
})

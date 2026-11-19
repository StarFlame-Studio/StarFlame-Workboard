import type { UserRole } from '@starflame/shared'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        username: string
        name: string
        role: UserRole
        avatarUrl: string | null
      }
      device?: {
        id: string
        classId: string
        name: string
        isReadOnly: boolean
        role: 'terminal' | 'teacher' | 'student' | 'parent' | 'guest'
        permission: 'read' | 'write'
        accessCodeId: string | null
      }
      validated?: unknown
    }
  }
}

export {}

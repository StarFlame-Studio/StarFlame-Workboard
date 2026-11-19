import { db } from '../db/index.js'
import { auditLogs } from '../db/schema.js'
import { newId } from './ids.js'
import { logger } from '../logger.js'

export interface AuditInput {
  actorType: 'user' | 'device' | 'system'
  actorId?: string | null
  classId?: string | null
  action: string
  target?: string | null
  detail?: unknown
  ip?: string | null
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: newId(),
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      classId: input.classId ?? null,
      action: input.action,
      target: input.target ?? null,
      detail: (input.detail ?? null) as never,
      ip: input.ip ?? null,
    })
  } catch (error) {
    logger.warn({ err: error }, 'audit write failed')
  }
}

import { eq } from 'drizzle-orm'
import { DEFAULT_SUBJECTS } from '@starflame/shared'
import { db } from '../db/index.js'
import { classes, subjects } from '../db/schema.js'
import { newId } from '../lib/ids.js'

export async function seedSubjects(classId: string): Promise<void> {
  const values = DEFAULT_SUBJECTS.map((subject, index) => ({
    id: newId(),
    classId,
    code: subject.code,
    name: subject.name,
    color: subject.color,
    icon: subject.icon,
    sortIndex: index,
    enabled: true,
  }))
  if (values.length > 0) {
    await db.insert(subjects).values(values)
  }
}

export async function getClassSettings(classId: string): Promise<Record<string, unknown>> {
  const rows = await db
    .select({ settings: classes.settings })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1)
  const raw = rows[0]?.settings
  if (!raw || typeof raw !== 'object') return {}
  return raw as Record<string, unknown>
}


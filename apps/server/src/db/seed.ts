import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db, pool } from './index.js'
import { systemSettings, users } from './schema.js'
import { hashPassword } from '../lib/password.js'
import { newId } from '../lib/ids.js'

async function main(): Promise<void> {
  const username = process.env.SEED_USERNAME ?? 'admin'
  const password = process.env.SEED_PASSWORD ?? 'admin123456'
  const name = process.env.SEED_NAME ?? '超级管理员'

  const existing = await db.select().from(users).where(eq(users.username, username)).limit(1)
  if (existing.length === 0) {
    await db.insert(users).values({
      id: newId(),
      username,
      passwordHash: await hashPassword(password),
      name,
      role: 'owner',
      status: 'active',
    })
    console.log('已创建超级管理员: ' + username + ' / ' + password)
  } else {
    console.log('超级管理员已存在: ' + username)
  }

  const defaults: Array<{ skey: string; value: unknown }> = [
    { skey: 'site', value: { name: '星焰作业板', slogan: '把今天交给大屏' } },
  ]
  for (const item of defaults) {
    const rows = await db.select().from(systemSettings).limit(1)
    if (rows.length === 0) {
      await db.insert(systemSettings).values(item).onDuplicateKeyUpdate({ set: { value: item.value } })
    }
  }

  await pool.end()
  console.log('种子数据完成')
}

main().catch(async (error) => {
  console.error('种子数据失败:', error)
  await pool.end()
  process.exit(1)
})

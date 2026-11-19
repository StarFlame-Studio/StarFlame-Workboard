import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('缺少 DATABASE_URL')
  process.exit(1)
}

const dir = path.resolve('drizzle')
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

const conn = await mysql.createConnection(url)
await conn.query(
  'CREATE TABLE IF NOT EXISTS _sf_migrations (filename varchar(191) NOT NULL PRIMARY KEY, applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
)
const [appliedRows] = await conn.query('SELECT filename FROM _sf_migrations')
const applied = new Set(appliedRows.map((r) => r.filename))

let total = 0
for (const file of files) {
  if (applied.has(file)) {
    console.log('SKIP ' + file)
    continue
  }
  const raw = fs.readFileSync(path.join(dir, file), 'utf8')
  const statements = raw.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)
  console.log('APPLY ' + file + ' (' + statements.length + ' statements)')
  for (const [i, stmt] of statements.entries()) {
    try {
      await conn.query(stmt)
    } catch (e) {
      console.error('FAIL#' + i + ' ' + stmt.split('\n')[0].slice(0, 90))
      console.error('  code=' + e.code + ' errno=' + e.errno)
      console.error('  msg=' + String(e.sqlMessage ?? e.message).slice(0, 400))
      await conn.end()
      process.exit(1)
    }
  }
  await conn.query('INSERT INTO _sf_migrations (filename) VALUES (?)', [file])
  total += statements.length
}
const [tables] = await conn.query("SELECT table_name t FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY 1")
console.log('DONE statements=' + total + ' tables=' + tables.length)
console.log(tables.map((r) => r.t).join(','))
await conn.end()

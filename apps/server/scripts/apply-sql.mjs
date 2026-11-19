import fs from 'node:fs'
import mysql from 'mysql2/promise'

const file = process.argv[2]
const url = process.env.DATABASE_URL
if (!file || !url) { console.error('usage: DATABASE_URL=... node apply-sql.mjs <file.sql>'); process.exit(1) }
const u = new URL(url)
const conn = await mysql.createConnection({
  host: u.hostname,
  port: Number(u.port || 3306),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, ''),
  multipleStatements: false,
})
const raw = fs.readFileSync(file, 'utf8')
const statements = raw.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)
console.log('APPLY', file, '(' + statements.length + ' statements)')
for (const stmt of statements) {
  try {
    await conn.query(stmt)
    console.log('  OK:', stmt.slice(0, 70).replace(/\s+/g, ' '))
  } catch (e) {
    console.log('  FAIL:', stmt.slice(0, 200))
    console.error(e.message)
    process.exitCode = 1
    break
  }
}
const [tables] = await conn.query('SHOW TABLES')
console.log('DONE tables=' + tables.length)
await conn.end()

import fs from 'node:fs'
import mysql from 'mysql2/promise'

const sqlText = fs.readFileSync('drizzle/0000_romantic_chimera.sql', 'utf8')
const statements = sqlText.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)
console.log('STATEMENTS=' + statements.length)

const c = await mysql.createConnection((process.env.DATABASE_URL || ''))
let ok = 0
for (const [i, stmt] of statements.entries()) {
  const head = stmt.split('\n')[0].slice(0, 70)
  try {
    await c.query(stmt)
    ok += 1
  } catch (e) {
    console.log('FAIL#' + i + ' ' + head)
    console.log('  code=' + e.code + ' errno=' + e.errno)
    console.log('  msg=' + String(e.sqlMessage ?? e.message).slice(0, 300))
    break
  }
}
console.log('OK_APPLIED=' + ok + '/' + statements.length)
await c.end()

import mysql from 'mysql2/promise'
const c = await mysql.createConnection((process.env.DATABASE_URL || ''))
const [rows] = await c.query("SELECT table_name AS t, engine, table_collation AS coll FROM information_schema.tables WHERE table_schema='starflame-workboard' ORDER BY table_name")
console.log(JSON.stringify({ count: rows.length, tables: rows.map((r) => r.t) }))
const [idx] = await c.query("SELECT COUNT(*) AS n FROM information_schema.statistics WHERE table_schema='starflame-workboard'")
console.log(JSON.stringify({ indexes: idx[0].n }))
await c.end()

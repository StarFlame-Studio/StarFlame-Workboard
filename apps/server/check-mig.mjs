import mysql from 'mysql2/promise'
const c = await mysql.createConnection((process.env.DATABASE_URL || ''))
const [m] = await c.query('SELECT * FROM __drizzle_migrations')
console.log(JSON.stringify({ migrations: m.length, rows: m.map((r) => ({ id: r.id, hash: String(r.hash).slice(0, 16), created: r.created_at })) }))
await c.end()

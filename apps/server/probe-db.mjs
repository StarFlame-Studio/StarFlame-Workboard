import mysql from 'mysql2/promise'

const host = process.env.DB_HOST || ''
const user = process.env.DB_USER || ''
const password = process.env.DB_PASSWORD || ''

async function main() {
  let conn
  try {
    conn = await mysql.createConnection({ host, user, password, connectTimeout: 15000 })
  } catch (e) {
    console.log(JSON.stringify({ stage: 'connect', ok: false, code: e.code, errno: e.errno, message: String(e.message).slice(0, 200) }))
    return
  }
  const [ver] = await conn.query('SELECT VERSION() AS v, @@global.time_zone AS tz, @@character_set_server AS cs')
  console.log(JSON.stringify({ stage: 'connect', ok: true, info: ver[0] }))
  const [dbs] = await conn.query('SHOW DATABASES')
  const names = dbs.map((d) => d.Database ?? d.database)
  console.log(JSON.stringify({ stage: 'databases', hasTarget: names.includes('starflame-workboard'), others: names.filter((n) => !['information_schema','mysql','performance_schema','sys'].includes(n)) }))
  const [grants] = await conn.query('SHOW GRANTS')
  console.log(JSON.stringify({ stage: 'grants', grants: grants.map((g) => Object.values(g)[0]) }))
  await conn.end()
}

main().catch((e) => { console.log(JSON.stringify({ stage: 'fatal', message: String(e.message).slice(0, 300) })) })

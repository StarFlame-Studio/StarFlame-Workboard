import mysql from 'mysql2/promise'

const DB = (process.env.DATABASE_URL || '')
const api = 'http://127.0.0.1:3002/api'
const out = {}

async function call(method, path, body, headers = {}) {
  const res = await fetch(api + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

// CORS 拒绝不再 500
const bad = await fetch(api + '/board/bootstrap', {
  method: 'OPTIONS',
  headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'GET' },
})
out.corsRejected = { status: bad.status, allowOrigin: bad.headers.get('access-control-allow-origin') }

// 绑定一台设备，改成只读后尝试写
const login = await call('POST', '/auth/login', { username: 'admin', password: process.env.SF_ADMIN_PASSWORD || '' })
const auth = { Authorization: 'Bearer ' + login.json.data.accessToken }
const cls = await call('POST', '/admin/classes', { name: '只读测试班' }, auth)
const bind = await call('POST', '/device/bind', {
  joinCode: cls.json.data.joinCode,
  password: cls.json.data.initialPassword,
  deviceName: '只读大屏',
  uuid: '99999999-8888-4777-8666-555555555555',
})
const dev = { 'x-device-token': bind.json.data.deviceToken }
const boot = await call('GET', '/board/bootstrap', null, dev)
const subjectId = boot.json.data.subjects[0].id

const conn = await mysql.createConnection(DB)
await conn.query('UPDATE devices SET is_read_only = 1 WHERE id = ?', [bind.json.data.device.id])
await conn.end()

const blocked = await call('PUT', '/board/homework', { subjectId, date: boot.json.data.date, content: '不应该写进去' }, dev)
const stillRead = await call('GET', '/board/bootstrap', null, dev)
out.readOnlyDevice = {
  writeStatus: blocked.status,
  writeCode: blocked.json.code,
  message: blocked.json.message,
  readStillWorks: stillRead.status === 200,
}

console.log(JSON.stringify(out, null, 1))

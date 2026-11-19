const api = 'http://127.0.0.1:3002/api'

async function call(method, path, body, headers = {}) {
  const res = await fetch(api + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json, headers: res.headers }
}

const out = {}

// 1) 登录 + 建班 + 绑定
const login = await call('POST', '/auth/login', { username: 'admin', password: process.env.SF_ADMIN_PASSWORD || '' })
const auth = { Authorization: 'Bearer ' + login.json.data.accessToken }
const cls = await call('POST', '/admin/classes', { name: '边界测试班', grade: '高三' }, auth)
const bind = await call('POST', '/device/bind', {
  joinCode: cls.json.data.joinCode,
  password: cls.json.data.initialPassword,
  deviceName: '测试大屏',
  uuid: '11111111-2222-4333-8444-555555555555',
})
const dev = { 'x-device-token': bind.json.data.deviceToken }
const boot = await call('GET', '/board/bootstrap', null, dev)
const subjectId = boot.json.data.subjects[0].id
const date = boot.json.data.date

// 2) 乐观锁：先写 version=1，再用过期 version 写
const first = await call('PUT', '/board/homework', { subjectId, date, content: 'v1 内容' }, dev)
const stale = await call('PUT', '/board/homework', { subjectId, date, content: '旧版本覆盖', version: first.json.data.version - 1 }, dev)
out.optimisticLock = { firstVersion: first.json.data.version, staleStatus: stale.status, staleCode: stale.json.code, message: stale.json.message }

// 3) 正确 version 可写
const good = await call('PUT', '/board/homework', { subjectId, date, content: 'v2 内容', version: first.json.data.version }, dev)
out.versionedWrite = { status: good.status, version: good.json.data.version }

// 4) 越权：普通教师访问非自己班级
const teacher = await call('POST', '/admin/users', { username: 'teacher1', password: process.env.SF_TEACHER_PASSWORD || '', name: '王老师', role: 'teacher' }, auth)
const tLogin = await call('POST', '/auth/login', { username: 'teacher1', password: process.env.SF_TEACHER_PASSWORD || '' })
const tAuth = { Authorization: 'Bearer ' + tLogin.json.data.accessToken }
const forbidden = await call('GET', '/board/bootstrap?classId=' + cls.json.data.id, null, tAuth)
out.forbidden = { status: forbidden.status, code: forbidden.json.code, message: forbidden.json.message }
const noAdmin = await call('GET', '/admin/users', null, tAuth)
out.adminGuard = { status: noAdmin.status, code: noAdmin.json.code }

// 5) 无令牌
const noToken = await call('GET', '/board/bootstrap')
out.noToken = { status: noToken.status, code: noToken.json.code }

// 6) CORS 预检
const cors = await fetch(api + '/board/bootstrap', {
  method: 'OPTIONS',
  headers: { Origin: 'http://localhost:3031', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-device-token' },
})
out.cors = { status: cors.status, allowOrigin: cors.headers.get('access-control-allow-origin') }
const badCors = await fetch(api + '/board/bootstrap', {
  method: 'OPTIONS',
  headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'GET' },
})
out.corsRejected = { status: badCors.status, allowOrigin: badCors.headers.get('access-control-allow-origin') }

// 7) 登录限流（5 次/分钟）
const attempts = []
for (let i = 0; i < 6; i += 1) {
  const r = await call('POST', '/auth/login', { username: 'admin', password: 'wrong-password' })
  attempts.push(r.status)
}
out.loginRateLimit = { statuses: attempts, lastCode: (await call('POST', '/auth/login', { username: 'admin', password: 'wrong-password' })).json.code }

console.log(JSON.stringify(out, null, 1))
console.log('CLASS_ID=' + cls.json.data.id)
console.log('DEVICE_ID=' + bind.json.data.device.id)

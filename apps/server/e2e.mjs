const api = 'http://127.0.0.1:3002/api'

async function call(method, path, body, headers = {}) {
  const res = await fetch(api + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

const out = {}

const login = await call('POST', '/auth/login', { username: 'admin', password: process.env.SF_ADMIN_PASSWORD || '' })
out.login = { status: login.status, code: login.json.code, role: login.json.data?.user?.role, hasToken: Boolean(login.json.data?.accessToken) }
if (!login.json.data) { console.log(JSON.stringify(out, null, 1)); process.exit(0) }
const auth = { Authorization: 'Bearer ' + login.json.data.accessToken }

const created = await call('POST', '/admin/classes', { name: '高二(3)班', grade: '高二', school: '星焰中学' }, auth)
out.createClass = { status: created.status, code: created.json.code, joinCode: created.json.data?.joinCode, pwd: created.json.data?.initialPassword }
if (!created.json.data) { console.log(JSON.stringify(out, null, 1)); process.exit(0) }

const joined = created.json.data.joinCode
const pwd = created.json.data.initialPassword

const bind = await call('POST', '/device/bind', { joinCode: joined, password: pwd, deviceName: '教室大屏', uuid: '550e8400-e29b-41d4-a716-446655440000' })
out.bind = { status: bind.status, code: bind.json.code, hasToken: Boolean(bind.json.data?.deviceToken), className: bind.json.data?.class?.name }
if (!bind.json.data) { console.log(JSON.stringify(out, null, 1)); process.exit(0) }
const dev = { 'x-device-token': bind.json.data.deviceToken }

const boot1 = await call('GET', '/board/bootstrap', null, dev)
out.bootstrap = { status: boot1.status, code: boot1.json.code, subjects: boot1.json.data?.subjects?.length, students: boot1.json.data?.students?.length, date: boot1.json.data?.date }
const chinese = boot1.json.data?.subjects?.[0]

const hw = await call('PUT', '/board/homework', { subjectId: chinese.id, date: boot1.json.data.date, content: '练习册 P32-34\n背诵《赤壁赋》' }, dev)
out.saveHomework = { status: hw.status, code: hw.json.code, version: hw.json.data?.version }

const imp = await call('POST', '/board/students/import', { text: '张三\n李四\n王五' }, dev)
out.importStudents = { status: imp.status, code: imp.json.code, imported: imp.json.data?.imported }

const boot2 = await call('GET', '/board/bootstrap', null, dev)
out.bootstrap2 = { code: boot2.json.code, homeworkCount: boot2.json.data?.stats?.homeworkCount, studentCount: boot2.json.data?.stats?.studentCount, firstHw: boot2.json.data?.homework?.[0]?.content?.split('\n')[0] }

const notice = await call('POST', '/board/notices', { title: '明天体检', content: '早上 7:30 空腹', level: 'urgent', pinned: true }, dev)
out.notice = { status: notice.status, code: notice.json.code }

const audit = await call('GET', '/admin/audit-logs', null, auth)
out.audit = { status: audit.status, total: audit.json.data?.total, actions: (audit.json.data?.items ?? []).slice(0, 5).map((i) => i.action) }

const overview = await call('GET', '/admin/overview', null, auth)
out.overview = overview.json.data

const badLogin = await call('POST', '/auth/login', { username: 'admin', password: 'wrong-pass' })
out.badLogin = { status: badLogin.status, code: badLogin.json.code, message: badLogin.json.message }

console.log(JSON.stringify(out, null, 1))

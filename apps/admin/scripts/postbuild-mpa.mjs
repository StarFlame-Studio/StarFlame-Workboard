// 把 foo.html 同时产出 foo/index.html，让 /foo、/foo/ 都能直达同一页面
import fs from 'node:fs'
import path from 'node:path'

const dist = path.resolve(import.meta.dirname, '../dist')
const pages = ['classes', 'class', 'notices', 'users', 'devices', 'audit', 'login']

for (const name of pages) {
  const source = path.join(dist, name + '.html')
  if (!fs.existsSync(source)) {
    console.warn('[mpa] 缺少 ' + name + '.html，跳过')
    continue
  }
  const targetDir = path.join(dist, name)
  fs.mkdirSync(targetDir, { recursive: true })
  fs.copyFileSync(source, path.join(targetDir, 'index.html'))
  console.log('[mpa] ' + name + '.html -> ' + name + '/index.html')
}

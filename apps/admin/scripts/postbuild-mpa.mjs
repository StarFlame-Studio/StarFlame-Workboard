// 后台地址不带 .html 后缀：/classes、/notices 等直达同名页面，由 Nginx 的
// pretty-url 规则（deploy/nginx/zyadmin.yanhuoyiyou.cn.pretty-url.conf）把
// 无后缀路径映射到 <name>.html。这里不再复制 <name>/index.html 目录，
// 避免同一页面出现 /classes、/classes/、/classes.html 三种地址。
import fs from 'node:fs'
import path from 'node:path'

const dist = path.resolve(import.meta.dirname, '../dist')
const pages = ['classes', 'class', 'notices', 'users', 'devices', 'audit', 'login']

for (const name of pages) {
  const source = path.join(dist, name + '.html')
  if (!fs.existsSync(source)) console.warn('[mpa] 缺少 ' + name + '.html，跳过')
}

console.log('[mpa] 共 ' + pages.length + ' 个页面入口，地址不带 .html 后缀')


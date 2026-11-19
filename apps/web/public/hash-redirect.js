// 旧版 hash 路由兼容：/#/settings → /settings
;(function () {
  var hash = window.location.hash || ''
  if (hash.indexOf('#/') !== 0) return
  var raw = hash.slice(2)
  var queryIndex = raw.indexOf('?')
  var path = (queryIndex === -1 ? raw : raw.slice(0, queryIndex)).replace(/\/$/, '')
  var paramPart = queryIndex === -1 ? '' : raw.slice(queryIndex)
  var map = {
    '': '/',
    bind: '/bind',
    settings: '/settings',
    list: '/list',
    exams: '/exams',
    templates: '/templates',
  }
  var target = map[path]
  if (!target) return
  window.location.replace(target + paramPart)
})()

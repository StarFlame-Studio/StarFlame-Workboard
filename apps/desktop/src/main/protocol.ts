import { protocol } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { RENDERER_DIR } from './paths'

/**
 * 以 app://local/... 加载内置前端产物。
 * 相比 file:// 的好处：同源、支持 fetch/XHR、相对路径与多页跳转都正常，
 * 也不受 Chromium 对 file:// 的跨源限制。
 */
export function registerAppProtocol(): void {
  protocol.registerFileProtocol('app', (request, callback) => {
    const rootDir = normalize(RENDERER_DIR)
    let pathname = '/'
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname)
    } catch {
      pathname = '/'
    }
    let target = normalize(join(rootDir, pathname))
    // 目录穿越防护：解析后必须仍在产物目录内
    if (target !== rootDir && !target.startsWith(rootDir + sep)) {
      callback({ error: -10 })
      return
    }
    // 前端用无扩展名的干净路径跳转（/welcome、/settings…），按 nginx try_files 语义补 .html
    if (!existsSync(target) && !extname(target)) {
      const withHtml = target + '.html'
      if (existsSync(withHtml)) target = withHtml
    }
    if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html')
    if (!existsSync(target)) target = join(rootDir, 'index.html')
    callback({ path: target })
  })
}

export const APP_ENTRY_URL = 'app://local/index.html'

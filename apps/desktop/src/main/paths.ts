import { app } from 'electron'
import { join } from 'node:path'

/** 内置前端产物目录：打包后在 resources/renderer，开发时在 apps/desktop/renderer */
export const RENDERER_DIR = app.isPackaged
  ? join(process.resourcesPath, 'renderer')
  : join(__dirname, '../../renderer')

/** 窗口图标（打包后由 extraResources 放到 resources/icon.ico） */
export const ICON_PATH = app.isPackaged
  ? join(process.resourcesPath, 'icon.ico')
  : join(__dirname, '../../build/icon.ico')

/** 本地缓存目录：看板快照、窗口状态等，比浏览器 IndexedDB 更抗清理 */
export const CACHE_DIR = join(app.getPath('userData'), 'cache')

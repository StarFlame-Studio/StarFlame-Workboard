import { BrowserWindow, screen, session } from 'electron'
import { join } from 'node:path'
import { APP_ENTRY_URL } from './protocol'
import { ICON_PATH } from './paths'
import { readJson, writeJson } from './store'
import { isQuitting } from './appState'

const STATE_FILE = 'window-state.json'
const FIRST_RUN_FILE = 'first-run.json'
/** app:// 下的 localStorage 分区名，首次启动要清掉，避免沿用上一台设备的登录态 */
const APP_ORIGIN = 'app://local'
const MIN_WIDTH = 800
const MIN_HEIGHT = 600

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

function loadState(): WindowState {
  const fallback: WindowState = { width: 1440, height: 900 }
  const saved = readJson<WindowState>(STATE_FILE, fallback)
  const width = Math.max(MIN_WIDTH, Math.round(saved.width || fallback.width))
  const height = Math.max(MIN_HEIGHT, Math.round(saved.height || fallback.height))
  // 位置校验：显示器换过之后旧坐标可能落在屏幕外，越界就居中显示
  if (typeof saved.x === 'number' && typeof saved.y === 'number') {
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return saved.x! < a.x + a.width && saved.x! + width > a.x && saved.y! < a.y + a.height && saved.y! + height > a.y
    })
    if (visible) return { width, height, x: saved.x, y: saved.y, maximized: saved.maximized === true }
  }
  return { width, height, maximized: saved.maximized === true }
}

function saveState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const maximized = win.isMaximized()
  const bounds = maximized ? win.getNormalBounds() : win.getBounds()
  writeJson(STATE_FILE, {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized,
  } satisfies WindowState)
}

/**
 * 首次启动：清掉内置页面分区里的本地数据。
 * 安装包在别的机器上做的测试登录态、或用户重装后期望重新登录，都靠这一步保证
 * 「装完第一次打开进的是欢迎页」，而不是直接进某个班级的看板。
 */
async function prepareFirstRun(): Promise<void> {
  const marker = readJson<{ initialized?: boolean }>(FIRST_RUN_FILE, {})
  if (marker.initialized === true) return
  try {
    await session.defaultSession.clearStorageData({
      origin: APP_ORIGIN,
      storages: ['localstorage', 'indexdb', 'cachestorage', 'websql', 'serviceworkers'],
    })
  } catch (err) {
    console.warn('[window] 首次启动清理本地数据失败（可继续）：', err instanceof Error ? err.message : err)
  }
  writeJson(FIRST_RUN_FILE, { initialized: true, at: new Date().toISOString() })
}

/** 单次重试间隔（毫秒），最多重试 LOAD_RETRY_LIMIT 次 */
const LOAD_RETRY_DELAY_MS = 600
const LOAD_RETRY_LIMIT = 3

let loadAttempts = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null

function loadEntry(win: BrowserWindow): Promise<void> {
  return win.loadURL(APP_ENTRY_URL).catch((err: unknown) => {
    console.warn('[window] 首次加载被重定向中断（通常正常）：', err instanceof Error ? err.message : err)
  })
}

/**
 * 加载失败 / 渲染进程崩溃后的自愈：延迟后重新加载入口页。
 * 连续失败到上限就展示内置兜底页（带「重新加载」按钮），避免一直白屏。
 */
function retryLoad(win: BrowserWindow): void {
  if (win.isDestroyed() || retryTimer) return
  if (loadAttempts >= LOAD_RETRY_LIMIT) {
    showFallbackPage(win)
    return
  }
  loadAttempts += 1
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (win.isDestroyed()) return
    void loadEntry(win)
  }, LOAD_RETRY_DELAY_MS * loadAttempts)
}

const FALLBACK_HTML = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" />
<title>星焰作业板</title><style>
  html,body{height:100%;margin:0;background:#16130F;color:#F7F6F4;
    font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:24px}
  h1{font-size:22px;margin:0;letter-spacing:.04em}
  p{margin:0;color:#B8AFA6;font-size:14px;line-height:1.8;max-width:520px}
  button{margin-top:6px;padding:10px 26px;border-radius:999px;border:0;cursor:pointer;
    background:linear-gradient(135deg,#E2683C,#F0A44B);color:#16130F;font-weight:700;font-size:14px}
</style></head><body><div class="wrap">
  <h1>页面没能加载出来</h1>
  <p>内置页面资源读取失败，通常是文件被安全软件临时锁住或安装目录不完整。<br />点击下面的按钮重试；若一直失败，请重新运行安装包修复安装。</p>
  <button onclick="location.replace('app://local/index.html?retry=' + Date.now())">重新加载</button>
</div></body></html>`

function showFallbackPage(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  loadAttempts = 0
  void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(FALLBACK_HTML)).catch(() => undefined)
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const state = loadState()
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    title: '星焰作业板',
    backgroundColor: '#16130F',
    autoHideMenuBar: true,
    icon: ICON_PATH,
    webPreferences: {
      // paintWhenInitiallyHidden 是 Electron 的真实选项，但 electron.d.ts 未声明
      ...({ paintWhenInitiallyHidden: true } as Record<string, unknown>),
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // 大屏看板常被切到后台，不能让时钟/跑马灯被节流
      backgroundThrottling: false,
    },
  })

  mainWindow = win
  await prepareFirstRun()
  if (state.maximized) win.maximize()
  // ready-to-show 在个别显卡驱动上可能不触发（窗口一直不显示＝用户看到「打不开」），
  // 再挂一个兜底定时器，超时无条件显示。
  const showOnce = (): void => {
    if (win.isDestroyed() || win.isVisible()) return
    win.show()
  }
  win.once('ready-to-show', showOnce)
  const showFallback = setTimeout(showOnce, 4000)
  win.once('closed', () => clearTimeout(showFallback))
  win.on('close', (event) => {
    saveState(win)
    // 关闭前台窗口只是收进托盘：真正退出走托盘菜单 / app.quit()
    if (isQuitting()) return
    event.preventDefault()
    win.hide()
  })
  win.on('closed', () => {
    mainWindow = null
  })

  // 前端会在没登录态把 index 跳到 welcome，此时 loadURL 抛 ERR_ABORTED(-3)，属正常流程；
  // 其它加载失败（-6 资源读不到、-102 连接被拒…）以前只打日志，页面就停在全白。
  // 这里改成有限次延迟重试，重试仍失败就用内置的「加载失败」兜底页，至少给用户解释与重试按钮。
  win.webContents.on('did-fail-load', (_event, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return
    if (code === -3) return
    console.warn('[window] 主框架加载失败 ' + code + ' ' + desc + ' ' + url)
    void retryLoad(win)
  })

  // 渲染进程崩溃 / 卡死是白屏最常见的两个来源：直接重建内容，别让用户对着空白窗口
  win.webContents.on('render-process-gone', (_event, details) => {
    console.warn('[window] 渲染进程退出：' + details.reason)
    if (win.isDestroyed()) return
    void retryLoad(win)
  })
  win.on('unresponsive', () => {
    console.warn('[window] 页面无响应，尝试重载')
    if (!win.isDestroyed()) win.webContents.reload()
  })

  await loadEntry(win)
  if (process.env.SF_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' })
  return win
}
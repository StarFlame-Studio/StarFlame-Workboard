/**
 * 设备信息解析：后台设备详情弹窗用。
 *
 * 客户端 UA 由浏览器 / Electron 自动带上，例如：
 *   Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)
 *     @starflame/desktop/1.1.5 Chrome/130.0.6723.191 Electron/33.4.11 Safari/537.36
 *   Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/157.0.0.0 Safari/537.36 Edg/157.0.0.0
 */

export interface UserAgentInfo {
  /** 操作系统平台，例如 Windows / macOS / Linux / Android / iOS */
  platform: string
  /** 平台版本，例如 Windows NT 10.0 → Windows 10 / 11 */
  platformVersion: string
  /** 运行形态：桌面客户端 / 浏览器 */
  runtime: string
  /** 客户端版本号（桌面端取 @starflame/desktop/x.y.z，否则取浏览器主版本） */
  version: string
  /** 内核版本，例如 Electron 33.4.11 / Chrome 130 */
  engine: string
  /** 原始 UA，便于排障时复制 */
  raw: string
}

/** Windows NT 版本号 → 常见系统名（10.0 无法区分 10 与 11，合并展示） */
const WINDOWS_VERSIONS: Record<string, string> = {
  '10.0': '10 / 11',
  '6.3': '8.1',
  '6.2': '8',
  '6.1': '7',
  '6.0': 'Vista',
  '5.1': 'XP',
}

function detectPlatform(ua: string): { platform: string; platformVersion: string } {
  const windows = /Windows NT ([\d.]+)/.exec(ua)
  if (windows) {
    return { platform: 'Windows', platformVersion: WINDOWS_VERSIONS[windows[1]] ?? 'Windows NT ' + windows[1] }
  }
  const mac = /Mac OS X ([\d_]+)/.exec(ua)
  if (mac) {
    return { platform: 'macOS', platformVersion: mac[1].replace(/_/g, '.') }
  }
  if (/iPhone|iPad|iPod/.test(ua)) {
    const ios = /OS ([\d_]+) like Mac OS X/.exec(ua)
    return { platform: /iPad/.test(ua) ? 'iPadOS' : 'iOS', platformVersion: ios ? ios[1].replace(/_/g, '.') : '' }
  }
  if (/Android/.test(ua)) {
    const android = /Android ([\d.]+)/.exec(ua)
    return { platform: 'Android', platformVersion: android ? android[1] : '' }
  }
  if (/Linux/.test(ua)) return { platform: 'Linux', platformVersion: '' }
  return { platform: '未知平台', platformVersion: '' }
}

/**
 * 解析 UA。桌面客户端判定以 @starflame/desktop 为准（网页端不会有这段），
 * 拿不到该标记时按浏览器主版本兜底。
 */
export function parseUserAgent(userAgent: string | null | undefined): UserAgentInfo {
  const ua = (userAgent ?? '').trim()
  if (!ua) {
    return { platform: '未知平台', platformVersion: '', runtime: '未上报', version: '', engine: '', raw: '' }
  }

  const { platform, platformVersion } = detectPlatform(ua)
  const app = /@starflame\/desktop\/([\d.]+)/.exec(ua)
  const electron = /Electron\/([\d.]+)/.exec(ua)
  const edge = /Edg(?:e|A)?\/([\d.]+)/.exec(ua)
  const chrome = /Chrome\/([\d.]+)/.exec(ua)
  const firefox = /Firefox\/([\d.]+)/.exec(ua)
  const safari = /Version\/([\d.]+).*Safari/.exec(ua)

  let runtime = '浏览器'
  let version = ''
  if (app) {
    runtime = '桌面客户端'
    version = app[1]
  } else if (edge) {
    runtime = 'Edge 浏览器'
    version = edge[1].split('.').slice(0, 3).join('.')
  } else if (firefox) {
    runtime = 'Firefox 浏览器'
    version = firefox[1]
  } else if (chrome) {
    runtime = 'Chrome 浏览器'
    version = chrome[1].split('.').slice(0, 3).join('.')
  } else if (safari) {
    runtime = 'Safari 浏览器'
    version = safari[1]
  }

  const engine = electron ? 'Electron ' + electron[1] : chrome ? 'Chrome ' + chrome[1].split('.')[0] : ''

  return { platform, platformVersion, runtime, version, engine, raw: ua }
}

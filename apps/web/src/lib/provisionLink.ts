/**
 * 预配链接（设置页「预配链接」标签生成）解析。
 *
 * 链接形如：
 *   /bind?classCode=xxx&accessCode=yyy&deviceName=大屏A&autoAuth=1&settings=%7B...%7D
 *
 * - classCode 必填，没有班级码就没法登录；
 * - accessCode 留空 = 游客只读登录（是否允许由班级设置 access.guestEnabled 决定）；
 * - autoAuth=0 时才需要用户手动点登录，默认打开链接就自动登录；
 * - settings 是班级设置快照，登录成功且设备有写权限时写回云端。
 */
export interface ProvisionLink {
  classCode: string
  accessCode: string
  deviceName: string
  /** 打开链接是否立刻自动登录（autoAuth=0 / false 时关闭） */
  autoLogin: boolean
  /** 预配置的班级设置快照 */
  settings: Record<string, unknown>
  /** 是否为预配链接（带班级码） */
  isProvision: boolean
  /** 链接未带授权码 → 以游客身份进入 */
  guest: boolean
}

function parseSettings(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  const candidates: string[] = [raw]
  try {
    candidates.push(decodeURIComponent(raw))
  } catch {
    // 非法转义时保持原样
  }
  for (const text of candidates) {
    if (!text.trim()) continue
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // 试下一个候选
    }
  }
  return {}
}

export function parseProvisionLink(search: string): ProvisionLink {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const classCode = (params.get('classCode') ?? '').trim()
  const accessCode = (params.get('accessCode') ?? '').trim()
  const deviceName = (params.get('deviceName') ?? '').trim()
  const autoFlag = (params.get('autoAuth') ?? '').trim().toLowerCase()
  const autoLogin = autoFlag !== '0' && autoFlag !== 'false'
  return {
    classCode,
    accessCode,
    deviceName,
    autoLogin,
    settings: parseSettings(params.get('settings')),
    isProvision: Boolean(classCode),
    guest: !accessCode,
  }
}

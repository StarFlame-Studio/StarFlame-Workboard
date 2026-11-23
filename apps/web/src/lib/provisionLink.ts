/**
 * 预配链接（设置页「预配链接」标签 / 教程里的教师端登录引导生成）解析。
 *
 * 短链接形如：
 *   /bind?c=班级码&k=授权码
 *
 * - c（班级码）必填，没有班级码就没法登录；
 * - k（授权码）留空 = 游客只读登录（是否允许由班级设置 access.guestEnabled 决定）；
 * - 打开链接固定自动登录，不再需要 autoAuth 参数。
 *
 * 同时兼容早期长链接（classCode / accessCode / deviceName / autoAuth / settings），
 * 老链接发出去以后还会被继续点开，不能解析失败。
 */
export interface ProvisionLink {
  classCode: string
  accessCode: string
  deviceName: string
  /** 打开链接是否立刻自动登录（短链接恒为 true；旧链接可用 autoAuth=0 / false 关闭） */
  autoLogin: boolean
  /** 预配置的班级设置快照（仅旧链接可能携带，新链接不再生成） */
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
  // 新短参数优先，老参数兜底
  const classCode = (params.get('c') ?? params.get('classCode') ?? '').trim()
  const accessCode = (params.get('k') ?? params.get('accessCode') ?? '').trim()
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

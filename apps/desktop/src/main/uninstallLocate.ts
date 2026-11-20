/**
 * 远程卸载的纯逻辑部分（不依赖 electron，便于在非 Windows 环境做单元测试）。
 *
 * Windows 上的实际信息源是注册表与安装目录，这里只负责解析这些字符串：
 * - reg query 的输出 → 卸载键路径 / 卸载命令；
 * - 卸载命令 → 可执行文件与参数；
 * - 目录文件列表 → 卸载器文件名；
 * - 参数整理 → 静默卸载参数（保证 /S，剔除会把卸载器拷到临时目录的 _?=）。
 */

export interface UninstallCommand {
  exe: string
  args: string[]
}

/** 把注册表里的 UninstallString / QuietUninstallString 拆成可执行文件与参数 */
export function splitCommand(raw: string): UninstallCommand | null {
  const text = raw.trim()
  if (!text) return null
  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1)
    if (end < 0) return null
    const exe = text.slice(1, end).trim()
    if (!exe) return null
    return { exe, args: splitArgs(text.slice(end + 1)) }
  }
  // 未加引号：路径可能含空格，取到 .exe 为止
  const idx = text.toLowerCase().indexOf('.exe')
  if (idx < 0) return { exe: text, args: [] }
  const exe = text.slice(0, idx + 4).trim()
  return { exe, args: splitArgs(text.slice(idx + 4)) }
}

/** 按空格拆参数，保留引号内的空格 */
function splitArgs(rest: string): string[] {
  const text = rest.trim()
  if (!text) return []
  const out: string[] = []
  let current = ''
  let quoted = false
  for (const ch of text) {
    if (ch === '"') {
      quoted = !quoted
      continue
    }
    if (!quoted && /\s/.test(ch)) {
      if (current) {
        out.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (current) out.push(current)
  return out
}

/**
 * 从 `reg query <Uninstall 根> /s /v DisplayName` 的输出里挑出匹配产品的卸载键。
 * reg 的输出以 HKEY_ 开头的行分段，段内是 "    DisplayName    REG_SZ    星焰作业板"。
 */
export function pickUninstallKeys(regOutput: string, keywords: string[]): string[] {
  const keys: string[] = []
  let currentKey = ''
  for (const line of regOutput.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('HKEY_')) {
      currentKey = trimmed
      continue
    }
    const match = /^DisplayName\s+REG_(?:EXPAND_)?SZ\s+(.+)$/.exec(trimmed)
    if (!match || !currentKey) continue
    const displayName = match[1].trim()
    if (!displayName) continue
    if (keywords.some((keyword) => displayName.toLowerCase().includes(keyword.toLowerCase()))) {
      keys.push(currentKey)
    }
  }
  return keys
}

/** 从 `reg query <键> /v <值名>` 的输出里取值（不存在返回 null） */
export function pickRegistryValue(regOutput: string, valueName: string): string | null {
  // 必须锚定行首：UninstallString 是 QuietUninstallString 的子串，不锚定会误命中
  const pattern = new RegExp('^' + valueName + '\\s+REG_(?:EXPAND_)?SZ\\s+(.+)')
  for (const line of regOutput.split(/\r?\n/)) {
    const match = pattern.exec(line.trim())
    if (match && match[1].trim()) return match[1].trim()
  }
  return null
}

/** 在目录文件列表里挑卸载器：优先「Uninstall <产品文件名>.exe」，其次任意 Uninstall*.exe */
export function pickUninstallerFile(files: string[], productFilename: string): string | null {
  const uninstallers = files.filter((name) => /^uninstall.*\.exe$/i.test(name))
  if (uninstallers.length === 0) return null
  const exact = uninstallers.find((name) => name.toLowerCase() === ('uninstall ' + productFilename + '.exe').toLowerCase())
  if (exact) return exact
  const withProduct = uninstallers.find((name) => name.toLowerCase().includes(productFilename.toLowerCase()))
  return withProduct ?? uninstallers[0]
}

/** 整理静默卸载参数：保证带 /S，去掉 _?=（带引号会让 NSIS 解析失败，不带也会把卸载器拷到临时目录） */
export function buildSilentArgs(args: string[]): string[] {
  const out = args.filter((arg) => !arg.startsWith('_?='))
  if (!out.some((arg) => arg.toLowerCase() === '/s')) out.push('/S')
  return out
}

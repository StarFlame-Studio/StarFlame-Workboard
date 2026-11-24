// 按 DESKTOP_CHANNEL 生成对应通道的打包配置
const { CHANNELS, UPDATE_BASE_URL } = require('./scripts/channels.cjs')

const channel = process.env.DESKTOP_CHANNEL || 'win10-x64'
const ch = CHANNELS[channel]
if (!ch) throw new Error('未知通道：' + channel)

const nsisExtra = ch.minWindows === '10' ? 'build/nsis-require-win10.nsh' : 'build/nsis-require-win7.nsh'

// 代码签名：构建机上有 build/certs/starflame.pfx 才启用，缺证书时自动跳过（不阻断打包）
const fs = require('node:fs')
const path = require('node:path')
const CERT_FILE = path.join(__dirname, 'build/certs/starflame.pfx')
// SF_SKIP_SIGN=1 可在没有 Windows 签名工具链的构建机上跳过签名
const hasCert = fs.existsSync(CERT_FILE) && process.env.SF_SKIP_SIGN !== '1'

// 构建机是 Linux，electron-builder 自带的 wine 缺少 PE 内置库、跑不起 signtool.exe，
// 所以这里用 Linux 原生 osslsigncode 直接签名（支持 SHA-256 + RFC3161 时间戳）。
const { execFileSync } = require('node:child_process')
function signWithOssl(config) {
  const file = config.path
  const pfx = config.cscInfo && 'file' in config.cscInfo ? config.cscInfo.file : CERT_FILE
  const pass = (config.cscInfo && config.cscInfo.password) || process.env.SF_CERT_PASSWORD || ''
  const out = file + '.signed'
  const baseArgs = [
    'sign',
    '-pkcs12', pfx,
    '-pass', pass,
    '-n', '焰火工作室',
    '-i', 'https://zy.yanhuoyiyou.cn',
    '-h', config.hash === 'sha1' ? 'sha1' : 'sha256',
    '-in', file,
    '-out', out,
  ]
  try {
    execFileSync('osslsigncode', [...baseArgs, '-ts', 'http://timestamp.digicert.com'], { stdio: 'inherit' })
  } catch (e) {
    // 时间戳服务不可达时退化为不带时间戳签名，避免整包发布被阻断
    console.warn('[sign] 时间戳服务失败，改为不带时间戳签名：' + (e && e.message))
    execFileSync('osslsigncode', baseArgs, { stdio: 'inherit' })
  }
  fs.renameSync(out, file)
}

const signOptions = hasCert
  ? {
      certificateFile: CERT_FILE,
      certificatePassword: process.env.SF_CERT_PASSWORD || '',
      publisherName: '焰火工作室',
      signingHashAlgorithms: ['sha256'],
      rfc3161TimeStampServer: 'http://timestamp.digicert.com',
      sign: signWithOssl,
    }
  : undefined

module.exports = {
  appId: 'cn.yanhuoyiyou.starflame.workboard',
  productName: '星焰作业板',
  // 可执行文件名保持 ASCII，避免中文路径在部分老系统上出问题
  executableName: 'StarflameWorkboard',
  copyright: 'Copyright © 2026 焰火工作室',
  electronVersion: ch.electronVersion,
  // 每个通道独立输出目录，避免 ia32 产物互相覆盖
  directories: { output: 'release/' + channel, buildResources: 'build' },
  files: ['dist/**/*', 'package.json', 'build/icon.ico'],
  extraResources: [
    { from: 'renderer', to: 'renderer' },
    { from: 'build/icon.ico', to: 'icon.ico' },
  ],
  asar: true,
  // 非 Windows 构建机（Linux/macOS）：让 electron-builder 自己下载便携版 Wine 11，
  // 用于编译 NSIS 安装包与生成卸载器；Windows 构建机上完全不使用
  ...(process.platform === 'win32' ? {} : { toolsets: { wine: '1.0.1' } }),
  // normal 在体积上仅比 maximum 大约 8%，但打包速度提升数倍
  compression: 'normal',
  win: {
    icon: 'build/icon.ico',
    target: [
      { target: 'nsis', arch: [ch.arch] },
      { target: 'zip', arch: [ch.arch] },
    ],
    artifactName: 'StarflameWorkboard-${version}-' + ch.arch + '.${ext}',
    requestedExecutionLevel: 'asInvoker',
    ...(signOptions ? { signtoolOptions: signOptions } : {}),
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: '星焰作业板',
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
    installerHeaderIcon: 'build/icon.ico',
    // 星焰风格外观：左侧栏 + 顶部横向小图
    installerSidebar: 'build/installerSidebar.bmp',
    uninstallerSidebar: 'build/installerSidebar.bmp',
    installerHeader: 'build/installerHeader.bmp',
    deleteAppDataOnUninstall: false,
    include: nsisExtra,
  },
  publish: [{ provider: 'generic', url: UPDATE_BASE_URL + '/' + channel + '/', channel: 'latest' }],
}

// 编译统一安装引导 Setup.exe：node scripts/build-bootstrap.mjs
import { spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { readFileSync } from 'node:fs'
import releaseVersion from './release-version.cjs'

const pkgDir = resolve(import.meta.dirname, '..')
const buildDir = join(pkgDir, 'build')
const outDir = join(pkgDir, 'release/bootstrap')
// 版本号单一来源：package.json 的 version
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'))
const version = pkg.version
const { versionCode } = releaseVersion
mkdirSync(outDir, { recursive: true })

// 复用 electron-builder 缓存里的 NSIS（含 NSISdl 插件），避免额外下载
// 查找顺序：显式指定 → electron-builder 的 Windows NSIS → 系统安装的 makensis（Linux/macOS）
const candidates = [
  process.env.MAKENSIS,
  join(homedir(), 'AppData/Local/electron-builder/Cache/nsis-3.0.4.1/nsis-3.0.4.1-w8az6/Bin/makensis.exe'),
  join(homedir(), 'AppData/Local/electron-builder/Cache/nsis-3.0.4.1/nsis-3.0.4.1-w8az6/makensis.exe'),
  '/usr/bin/makensis',
  '/usr/local/bin/makensis',
]
const makensis = candidates.find((p) => p && existsSync(p))
if (!makensis) {
  console.error('[bootstrap] 找不到 makensis：可设置环境变量 MAKENSIS 指定路径，或先跑一次 node scripts/pack.mjs win10-x64 让它下载 NSIS')
  process.exit(1)
}

// Windows 版 makensis 用 /V2 /D...，POSIX 版只认 -V2 -D...
const optPrefix = makensis.toLowerCase().endsWith('.exe') ? '/' : '-'
const args = [optPrefix + 'V2', optPrefix + 'DAPP_VERSION=' + version, optPrefix + 'DAPP_VERSION_CODE=' + versionCode, join(buildDir, 'bootstrap.nsi')]
const r = spawnSync(makensis, args, {
  cwd: buildDir,
  stdio: 'inherit',
})
if (r.status !== 0) {
  console.error('[bootstrap] 编译失败')
  process.exit(r.status ?? 1)
}

const produced = join(buildDir, 'bootstrap-out.exe')
const target = join(outDir, 'StarflameWorkboard-Setup-' + version + '-' + versionCode + '.exe')
renameSync(produced, target)
console.log('[bootstrap] 完成 → ' + target)
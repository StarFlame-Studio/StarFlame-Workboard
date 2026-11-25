// 打包入口：node scripts/pack.mjs <channel|all>
// 通过 DESKTOP_CHANNEL 让 electron-builder 配置按通道切换 Electron 版本 / 架构 / 更新源
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const requireHere = createRequire(import.meta.url)
const { CHANNELS } = requireHere('./channels.cjs')
const pkgDir = resolve(import.meta.dirname, '..')
const builderCli = resolve(pkgDir, 'node_modules/electron-builder/out/cli/cli.js')

const { versionCode } = requireHere('./release-version.cjs')

// latest.yml 缺省只有 semver 版本号；客户端自 v1.2.1 起优先比较数字版本号，
// 所以这里把 APP_VERSION_CODE 作为自定义字段 versionCode 写进去（GenericProvider 会原样透传）。
const constantsText = readFileSync(resolve(pkgDir, '../../packages/shared/src/constants.ts'), 'utf8')

// 显示版本号必须与共享常量一致，否则 latest.yml 的 version 与客户端自身的 version 会对不上
const sharedVersion = ((/APP_VERSION\s*=\s*'([^']+)'/.exec(constantsText) || [])[1] || '').trim()
const pkgVersion = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8')).version
if (!sharedVersion || sharedVersion !== pkgVersion) {
  console.error(
    '[pack] 版本号不一致：packages/shared/src/constants.ts APP_VERSION=' +
      (sharedVersion || '?') +
      '，apps/desktop/package.json version=' +
      pkgVersion,
  )
  process.exit(1)
}

/** 给 electron-builder 生成的 latest.yml 补上数字版本号（每个通道各一份） */
function stampVersionCode(ch) {
  const file = resolve(pkgDir, 'release', ch, 'latest.yml')
  if (!existsSync(file)) {
    console.error('[pack] 找不到 ' + file + '，无法写入 versionCode')
    process.exit(1)
  }
  const text = readFileSync(file, 'utf8')
  const next = /^versionCode:/m.test(text) ? text.replace(/^versionCode:.*$/m, 'versionCode: ' + versionCode) : 'versionCode: ' + versionCode + '\n' + text
  writeFileSync(file, next)
  console.log('[pack] ' + ch + ' latest.yml 写入 versionCode=' + versionCode)
}
if (!existsSync(builderCli)) {
  console.error('[pack] 找不到 electron-builder，请先执行 pnpm install')
  process.exit(1)
}

const target = process.argv[2] || 'win10-x64'
const list = target === 'all' ? Object.keys(CHANNELS) : [target]
for (const ch of list) {
  if (!CHANNELS[ch]) {
    console.error('未知通道：' + ch + '，可选：' + Object.keys(CHANNELS).join(', ') + ' 或 all')
    process.exit(1)
  }
}

// 二进制镜像（Electron 运行时、NSIS 等）
const mirrorEnv = {
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://npmmirror.com/mirrors/electron-builder-binaries/',
}

const step = (args, env, label) => {
  const r = spawnSync(process.execPath, args, {
    cwd: pkgDir,
    stdio: 'inherit',
    env: { ...process.env, ...mirrorEnv, ...env },
  })
  if (r.status !== 0) {
    console.error('[pack] ' + label + ' 失败')
    process.exit(r.status ?? 1)
  }
}

// 渲染进程与通道无关，只构建一次
step(['scripts/build-renderer.mjs'], {}, 'build-renderer')

for (const ch of list) {
  step(['scripts/build-main.mjs'], { DESKTOP_CHANNEL: ch }, 'build-main:' + ch)
  step(
    [builderCli, '--win', '--publish', 'never', '--config', 'electron-builder.config.cjs'],
    { DESKTOP_CHANNEL: ch },
    'electron-builder:' + ch,
  )
  stampVersionCode(ch)
  console.log('[pack] ' + ch + ' 完成 → apps/desktop/release/' + ch)
}

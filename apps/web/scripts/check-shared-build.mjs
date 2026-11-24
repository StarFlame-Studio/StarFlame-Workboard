// 构建前校验 packages/shared 的 dist 与源码常量一致。
// 背景：v1.2.0 曾出现「先 build web、后 build shared」，页面里打进了旧 dist，
// 桌面端关于页于是显示上一个版本号。这里把版本号读出来比对，不一致直接构建失败。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../../..')
const srcFile = resolve(repoRoot, 'packages/shared/src/constants.ts')
const distFile = resolve(repoRoot, 'packages/shared/dist/constants.js')

function readAppVersion(text) {
  const version = /APP_VERSION\s*=\s*'([^']+)'/.exec(text)?.[1] ?? ''
  const code = Number(/APP_VERSION_CODE\s*=\s*(\d+)/.exec(text)?.[1] ?? 0)
  return { version, code }
}

function readOrExit(file, label) {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    console.error('[check-shared-build] 读不到 ' + label + '：' + error.message)
    if (label.includes('dist')) {
      console.error('[check-shared-build] 请先执行 pnpm --filter @starflame/shared run build')
    }
    process.exit(1)
  }
}

const source = readAppVersion(readOrExit(srcFile, 'packages/shared/src/constants.ts'))
const dist = readAppVersion(readOrExit(distFile, 'packages/shared/dist/constants.js'))
if (!source.version || source.code <= 0) {
  console.error('[check-shared-build] 无法从源码解析 APP_VERSION / APP_VERSION_CODE')
  process.exit(1)
}
if (!dist.version) {
  console.error('[check-shared-build] 无法从 dist 解析 APP_VERSION，请重新构建 @starflame/shared')
  process.exit(1)
}
if (source.version !== dist.version || source.code !== dist.code) {
  console.error(
    '[check-shared-build] packages/shared 的 dist 与源码不一致：源码 ' +
      source.version + '(' + source.code + ')，dist ' + dist.version + '(' + dist.code + ')。' +
      '请先执行 pnpm --filter @starflame/shared run build，否则会把旧版本号打进页面。',
  )
  process.exit(1)
}
console.log('[check-shared-build] shared dist 与源码一致：' + source.version + '(' + source.code + ')')

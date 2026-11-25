const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const constants = readFileSync(resolve(__dirname, '../../../packages/shared/src/constants.ts'), 'utf8')
const versionCode = Number(/^export const APP_VERSION_CODE\s*=\s*(\d+)\s*$/m.exec(constants)?.[1])
if (!Number.isSafeInteger(versionCode) || versionCode <= 0) throw new Error('无法读取 APP_VERSION_CODE')

module.exports = { versionCode }

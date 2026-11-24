declare const __DESKTOP_CHANNEL__: string
declare const __APP_VERSION_CODE__: number

/** 编译期注入的通道名（win7-ia32 / win10-x64 / win10-ia32），本地调试为 dev */
export const CHANNEL: string = typeof __DESKTOP_CHANNEL__ === 'string' ? __DESKTOP_CHANNEL__ : 'dev'

/** 编译期注入的数字版本号（APP_VERSION_CODE，如 1011）；打包时从 packages/shared/src/constants.ts 读取 */
export const APP_VERSION_CODE: number = typeof __APP_VERSION_CODE__ === 'number' ? __APP_VERSION_CODE__ : 0

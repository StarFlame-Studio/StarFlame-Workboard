declare const __DESKTOP_CHANNEL__: string

/** 编译期注入的通道名（win7-ia32 / win10-x64 / win10-ia32），本地调试为 dev */
export const CHANNEL: string = typeof __DESKTOP_CHANNEL__ === 'string' ? __DESKTOP_CHANNEL__ : 'dev'

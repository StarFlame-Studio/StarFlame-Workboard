// 三通道构建矩阵：同一份前端源码，配不同 Electron 运行时
// win7-ia32  → Electron 22.3.27（官方最后一个支持 Win7/8 的版本），ia32 在 64 位 Win7 上同样可运行
// win10-*    → Electron 33（当前 33.x 线最新），按系统位数二选一
const UPDATE_BASE_URL = 'https://zy.yanhuoyiyou.cn/desktop'

const CHANNELS = {
  'win7-ia32': {
    electronVersion: '22.3.27',
    arch: 'ia32',
    label: 'Windows 7 SP1 / 8 / 8.1（32 位与 64 位）',
    minWindows: '7',
  },
  'win10-x64': {
    electronVersion: '33.4.11',
    arch: 'x64',
    label: 'Windows 10 / 11 64 位',
    minWindows: '10',
  },
  'win10-ia32': {
    electronVersion: '33.4.11',
    arch: 'ia32',
    label: 'Windows 10 / 11 32 位',
    minWindows: '10',
  },
}

module.exports = { CHANNELS, UPDATE_BASE_URL }

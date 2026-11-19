/** 全局退出标记：区分「用户关闭窗口」与「真的退出应用」（托盘/更新安装会用到） */
let quitting = false

export function setQuitting(value: boolean): void {
  quitting = value
}

export function isQuitting(): boolean {
  return quitting
}

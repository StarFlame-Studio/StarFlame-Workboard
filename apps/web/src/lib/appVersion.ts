import { ref } from 'vue'
import { APP_VERSION, APP_VERSION_CODE } from '@starflame/shared'
import { appInfo, isDesktop } from '@/lib/platform'

/**
 * 展示用的版本号。
 *
 * 网页端：构建时从 @starflame/shared 打进 bundle 的 APP_VERSION。
 * 桌面端：页面加载后替换成安装包里 package.json 的真实版本（app.getVersion()）。
 *
 * 为什么要覆盖：renderer 是 Vite 在打包时编译的，APP_VERSION 是那一刻 shared 的构建产物。
 * 如果打包前忘了先重建 shared（例如先 build web 后 build shared），安装包里就会留下旧版本号，
 * 而版本徽标读的是 app.getVersion()（正确），于是出现「左下角 v1.2.0、关于页 v1.1.7」的错位。
 * 桌面端统一以安装包版本为准后，界面显示不再受构建顺序影响。
 */
export const appVersion = ref<string>(APP_VERSION)
export const appVersionCode = ref<number>(APP_VERSION_CODE)

let pending: Promise<void> | null = null

/** 桌面端读取安装包真实版本（只请求一次；网页端直接返回） */
export function loadAppVersion(): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  if (!pending) {
    pending = appInfo()
      .then((info) => {
        if (!info) return
        if (info.version) appVersion.value = info.version
        if (typeof info.versionCode === 'number' && info.versionCode > 0) {
          appVersionCode.value = info.versionCode
        }
      })
      .catch(() => {
        // 读取失败就保留构建时常量，下次调用可以重试
        pending = null
      })
  }
  return pending
}

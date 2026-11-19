import { app, net } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { CHANNEL } from './env'
import { getMainWindow } from './window'
import { setQuitting } from './appState'

/**
 * 历史版本回退：从更新源下载指定版本的安装包并启动它。
 *
 * electron-builder 的 artifactName 是 StarflameWorkboard-<version>-<arch>.exe，
 * 所有历史版本都平铺在 <UPDATE_BASE_URL>/<channel>/ 下，因此回退只需要拼 URL。
 */
const UPDATE_BASE_URL = 'https://zy.yanhuoyiyou.cn/desktop'

/** 通道 → 安装包架构后缀（与 electron-builder.config.cjs 里的 ch.arch 对应） */
const CHANNEL_ARCH: Record<string, string> = {
  'win7-ia32': 'ia32',
  'win10-x64': 'x64',
  'win10-ia32': 'ia32',
}

const HEAD_TIMEOUT_MS = 15000
/** 安装包最小体积：小于 1MB 一定是错误页或半截文件 */
const MIN_INSTALLER_BYTES = 1024 * 1024

export interface RollbackProgress {
  version: string
  state: 'downloading' | 'launching' | 'done' | 'error'
  /** 下载进度百分比（0~100） */
  percent: number
  received: number
  total: number
  message?: string
}

export interface RollbackResult {
  ok: boolean
  message?: string
  file?: string
}

let busy = false

function emit(progress: RollbackProgress): void {
  const win = getMainWindow()
  if (win) win.webContents.send('sf:update:rollback', progress)
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(err)
}

function headerNumber(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const num = Number(raw)
  return Number.isFinite(num) ? num : 0
}

/** 先探测远端是否存在该版本的安装包，给出「暂未提供」这类可读错误 */
function headSize(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'HEAD', url })
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      request.abort()
      reject(new Error('连接更新服务器超时，请检查网络后重试'))
    }, HEAD_TIMEOUT_MS)
    const done = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    request.on('response', (response) => {
      const status = response.statusCode
      const total = headerNumber(response.headers['content-length'])
      response.on('data', () => undefined)
      response.on('end', () => {
        done(() => {
          if (status >= 200 && status < 300) resolve(total)
          else reject(new Error('该版本暂未提供安装包（HTTP ' + status + '）'))
        })
      })
    })
    request.on('error', (err) => done(() => reject(new Error(errorMessage(err)))))
    request.end()
  })
}

function download(url: string, file: string, version: string, knownTotal: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(file)
    let received = 0
    let settled = false
    const fail = (err: Error): void => {
      if (settled) return
      settled = true
      out.destroy()
      try {
        unlinkSync(file)
      } catch {
        // 文件可能还没创建，忽略
      }
      reject(err)
    }
    const request = net.request({ method: 'GET', url })
    request.on('response', (response) => {
      const status = response.statusCode
      if (!(status >= 200 && status < 300)) {
        response.on('data', () => undefined)
        fail(new Error('下载安装包失败（HTTP ' + status + '）'))
        return
      }
      const total = headerNumber(response.headers['content-length']) || knownTotal
      response.on('data', (chunk: Buffer) => {
        received += chunk.length
        const percent = total > 0 ? Math.min(100, Math.round((received / total) * 1000) / 10) : 0
        emit({ version, state: 'downloading', percent, received, total })
        out.write(chunk)
      })
      // Electron 的 IncomingMessage 类型里没有 pipe，这里手动把响应体写进文件流
      response.on('end', () => {
        out.end()
      })
      response.on('error', (err) => fail(new Error(errorMessage(err))))
    })
    out.on('finish', () => {
      if (settled) return
      settled = true
      resolve()
    })
    out.on('error', (err) => fail(new Error(errorMessage(err))))
    request.on('error', (err) => fail(new Error(errorMessage(err))))
    request.end()
  })
}

/**
 * 回退到指定版本：下载安装包 → 启动安装程序 → 自身退出。
 * 只在打包后的正式版本可用（开发态没有通道、也没有签名好的安装包）。
 */
export async function rollbackToVersion(version: string): Promise<RollbackResult> {
  if (!app.isPackaged) return { ok: false, message: '开发模式不支持回退版本' }
  if (busy) return { ok: false, message: '上一个回退请求还在处理中，请稍候' }
  if (!/^\d+\.\d+\.\d+$/.test(version)) return { ok: false, message: '版本号格式不正确' }

  const arch = CHANNEL_ARCH[CHANNEL]
  if (!arch) return { ok: false, message: '当前发行通道不支持回退版本' }

  const name = 'StarflameWorkboard-' + version + '-' + arch + '.exe'
  const url = UPDATE_BASE_URL + '/' + CHANNEL + '/' + name
  const dir = join(app.getPath('temp'), 'starflame-rollback')
  const file = join(dir, name)

  busy = true
  try {
    const total = await headSize(url)
    mkdirSync(dir, { recursive: true })
    if (existsSync(file)) {
      try {
        unlinkSync(file)
      } catch {
        // 旧文件被占用时直接覆盖写入
      }
    }
    emit({ version, state: 'downloading', percent: 0, received: 0, total })
    await download(url, file, version, total)

    const size = existsSync(file) ? statSync(file).size : 0
    if (size < MIN_INSTALLER_BYTES) throw new Error('下载的安装包不完整，请稍后重试')

    emit({ version, state: 'launching', percent: 100, received: size, total: size, message: '正在启动安装程序…' })
    setQuitting(true)
    // 独立进程启动安装包，主进程随即退出，安装程序才能覆盖旧文件
    const child = spawn(file, [], { detached: true, stdio: 'ignore' })
    child.unref()
    emit({
      version,
      state: 'done',
      percent: 100,
      received: size,
      total: size,
      message: '安装程序已启动，按提示完成安装后即回到该版本',
    })
    setTimeout(() => app.quit(), 800)
    return { ok: true, file }
  } catch (err) {
    const message = errorMessage(err)
    emit({ version, state: 'error', percent: 0, received: 0, total: 0, message })
    return { ok: false, message }
  } finally {
    busy = false
  }
}

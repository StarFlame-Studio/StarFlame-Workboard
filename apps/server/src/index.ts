import http from 'node:http'
import { createApp } from './app.js'
import { env } from './env.js'
import { logger } from './logger.js'
import { pingDatabase } from './db/index.js'
import { initSocket } from './realtime/socket.js'
import { warmupTimeSync } from './lib/ntp.js'
import { warmupHitokotoPool } from './services/hitokotoPool.js'

const app = createApp()
const server = http.createServer(app)

initSocket(server)

// 启动即校准一次阿里云 NTP，避免首个 /public/time 请求等待超时
warmupTimeSync()

// 启动即在后台补满一言缓存池，大屏首屏不必等一次补池
warmupHitokotoPool()

server.listen(env.port, () => {
  logger.info('星焰作业板 API 已启动: http://127.0.0.1:' + env.port + '/api/health')
})

pingDatabase().then((ok) => {
  if (ok) {
    logger.info('数据库连接正常')
  } else {
    logger.warn('数据库连接失败，请检查 DATABASE_URL（服务仍已启动）')
  }
})

function shutdown(signal: string): void {
  logger.info('收到 ' + signal + '，正在关闭服务')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 8000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

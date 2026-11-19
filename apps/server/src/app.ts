import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { API_PREFIX } from '@starflame/shared'
import { env } from './env.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import healthRouter from './routes/health.js'
import authRouter from './routes/auth.js'
import adminRouter from './routes/admin.js'
import deviceRouter from './routes/device.js'
import boardRouter from './routes/board.js'
import miscRouter from './routes/misc.js'
import publicRouter from './routes/public.js'

export function createApp() {
  const app = express()

  if (env.trustProxy) app.set('trust proxy', 1)
  app.disable('x-powered-by')

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  )

  app.use(
    cors({
      origin(origin, callback) {
        // 不在白名单时不抛错，只是不下发 CORS 头，浏览器自然拦截
        callback(null, !origin || env.corsOrigins.includes(origin))
      },
      credentials: true,
      maxAge: 86400,
    }),
  )

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: false }))

  app.use(API_PREFIX + '/health', healthRouter)
  app.use(API_PREFIX + '/auth', authRouter)
  app.use(API_PREFIX + '/admin', adminRouter)
  app.use(API_PREFIX + '/device', deviceRouter)
  app.use(API_PREFIX + '/board', boardRouter)
  app.use(API_PREFIX + '/misc', miscRouter)
  app.use(API_PREFIX + '/public', publicRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

import { Router } from 'express'
import { pingDatabase } from '../db/index.js'

const router = Router()

router.get('/', async (_req, res) => {
  const dbOk = await pingDatabase()
  res.status(dbOk ? 200 : 503).json({
    code: 0,
    message: dbOk ? 'ok' : 'database unavailable',
    data: {
      status: dbOk ? 'ok' : 'degraded',
      uptime: Math.round(process.uptime()),
      db: dbOk,
      time: new Date().toISOString(),
    },
  })
})

export default router

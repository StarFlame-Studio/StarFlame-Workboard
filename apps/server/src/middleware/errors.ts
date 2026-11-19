import type { NextFunction, Request, Response } from 'express'
import { ERROR_CODE } from '@starflame/shared'
import { HttpError } from '../lib/http.js'
import { logger } from '../logger.js'

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ code: ERROR_CODE.NOT_FOUND, message: '接口不存在: ' + req.method + ' ' + req.path, data: null })
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err)
    return
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ code: err.code, message: err.message, data: null, details: err.details ?? null })
    return
  }
  const anyErr = err as { type?: string; message?: string }
  if (anyErr && anyErr.type === 'entity.parse.failed') {
    res.status(400).json({ code: ERROR_CODE.BAD_REQUEST, message: '请求体不是合法 JSON', data: null })
    return
  }
  if (anyErr && anyErr.type === 'entity.too.large') {
    res.status(400).json({ code: ERROR_CODE.BAD_REQUEST, message: '请求体过大', data: null })
    return
  }
  logger.error({ err, url: req.originalUrl, method: req.method }, 'unhandled error')
  res.status(500).json({ code: ERROR_CODE.INTERNAL, message: '服务器内部错误', data: null })
}

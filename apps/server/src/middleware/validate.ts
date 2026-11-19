import type { NextFunction, Request, Response } from 'express'
import type { ZodTypeAny } from 'zod'
import { badRequest } from '../lib/http.js'

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body ?? {})
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
      next(badRequest('参数校验失败', fields))
      return
    }
    req.validated = parsed.data
    next()
  }
}

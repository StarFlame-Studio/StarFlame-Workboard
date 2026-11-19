import type { Response } from 'express'
import { ERROR_CODE } from '@starflame/shared'

export class HttpError extends Error {
  readonly status: number
  readonly code: number
  readonly details?: unknown

  constructor(status: number, code: number, message: string, details?: unknown) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function ok<T>(res: Response, data: T, message = 'ok'): void {
  res.json({ code: ERROR_CODE.OK, message, data })
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, ERROR_CODE.BAD_REQUEST, message, details)
}
export function unauthorized(message = '未登录或凭证已过期'): HttpError {
  return new HttpError(401, ERROR_CODE.UNAUTHORIZED, message)
}
export function badCredentials(message = '账号或密码错误'): HttpError {
  return new HttpError(401, ERROR_CODE.BAD_CREDENTIALS, message)
}
export function badBindCode(message = '班级码或授权码错误'): HttpError {
  return new HttpError(401, ERROR_CODE.BAD_BIND_CODE, message)
}
export function forbidden(message = '没有权限'): HttpError {
  return new HttpError(403, ERROR_CODE.FORBIDDEN, message)
}
export function notFound(message = '资源不存在'): HttpError {
  return new HttpError(404, ERROR_CODE.NOT_FOUND, message)
}
export function accessDisabled(message = '授权码已停用，请联系管理员'): HttpError {
  return new HttpError(403, ERROR_CODE.ACCESS_DISABLED, message)
}
export function accessExpired(message = '授权码已过期，请联系管理员'): HttpError {
  return new HttpError(403, ERROR_CODE.ACCESS_EXPIRED, message)
}
export function guestDisabled(message = '该班级未开启游客登录，请输入授权码'): HttpError {
  return new HttpError(403, ERROR_CODE.GUEST_DISABLED, message)
}
export function classNotFound(message = '班级ID不存在'): HttpError {
  return new HttpError(404, ERROR_CODE.CLASS_NOT_FOUND, message)
}
export function classCodeTaken(message = '班级码已被占用，请换一个'): HttpError {
  return new HttpError(409, ERROR_CODE.CLASS_CODE_TAKEN, message)
}
export function classUidTaken(message = '班级ID已被占用，请换一个'): HttpError {
  return new HttpError(409, ERROR_CODE.CLASS_UID_TAKEN, message)
}
export function accessCodeTaken(message = '授权码已被占用，请换一个'): HttpError {
  return new HttpError(409, ERROR_CODE.ACCESS_CODE_TAKEN, message)
}
export function conflict(message: string): HttpError {
  return new HttpError(409, ERROR_CODE.CONFLICT, message)
}

export function param(req: { params: Record<string, string | string[]> }, key: string): string {
  const value = req.params[key]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

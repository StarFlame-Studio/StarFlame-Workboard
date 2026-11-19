import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { SignOptions } from 'jsonwebtoken'
import { env } from '../env.js'

export interface AccessPayload {
  sub: string
  role: string
  typ: 'user'
}

export function signAccessToken(payload: AccessPayload): string {
  const options: SignOptions = { expiresIn: env.accessTokenTtl as SignOptions['expiresIn'] }
  return jwt.sign(payload, env.jwtSecret, options)
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.jwtSecret) as AccessPayload
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex')
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function addDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

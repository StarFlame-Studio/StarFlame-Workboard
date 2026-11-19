import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { env } from '../env.js'
import * as schema from './schema.js'

export const pool = mysql.createPool({
  uri: env.databaseUrl,
  connectionLimit: 10,
  waitForConnections: true,
  enableKeepAlive: true,
})

export const db = drizzle(pool, { schema, mode: 'default' })

export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}

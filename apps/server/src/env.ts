import 'dotenv/config'

function read(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (value === undefined || value === '') {
    throw new Error('缺少环境变量: ' + name)
  }
  return value
}

const isProd = (process.env.NODE_ENV ?? 'development') === 'production'

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 3002),
  databaseUrl: read('DATABASE_URL', 'mysql://root:root@127.0.0.1:3306/starflame-workboard'),
  jwtSecret: read('JWT_SECRET', 'dev-only-secret-please-change'),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '2h',
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 30),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3031,http://localhost:3032')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY !== 'false',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  qiniu: {
    accessKey: process.env.QINIU_ACCESS_KEY ?? '',
    secretKey: process.env.QINIU_SECRET_KEY ?? '',
    bucket: process.env.QINIU_BUCKET ?? '',
    domain: process.env.QINIU_DOMAIN ?? 'oss.yanhuoyiyou.cn',
  },
}

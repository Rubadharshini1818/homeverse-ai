import 'dotenv/config'

function required(name, minimumLength = 1) {
  const value = process.env[name]?.trim()
  if (!value || value.length < minimumLength) {
    throw new Error(`${name} must be configured with at least ${minimumLength} characters`)
  }
  return value
}

const port = Number(process.env.PORT || 4000)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port')
}

const nodeEnv = process.env.NODE_ENV || 'development'
const cookieSameSite = process.env.COOKIE_SAME_SITE || (nodeEnv === 'production' ? 'none' : 'lax')
if (!['strict', 'lax', 'none'].includes(cookieSameSite)) {
  throw new Error('COOKIE_SAME_SITE must be strict, lax, or none')
}
if (cookieSameSite === 'none' && nodeEnv !== 'production') {
  throw new Error('COOKIE_SAME_SITE=none requires HTTPS and NODE_ENV=production')
}

export const config = {
  port,
  nodeEnv,
  frontendOrigins: (process.env.FRONTEND_ORIGIN || 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  mongoUri: required('MONGODB_URI'),
  jwtSecret: required('JWT_SECRET', 32),
  accessTokenMinutes: Number(process.env.ACCESS_TOKEN_MINUTES || 15),
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS || 30),
  cookieSameSite,
  replicateApiToken: process.env.REPLICATE_API_TOKEN?.trim() || ''
}

if (!Number.isInteger(config.accessTokenMinutes) || config.accessTokenMinutes < 1
  || !Number.isInteger(config.refreshTokenDays) || config.refreshTokenDays < 1) {
  throw new Error('Token lifetimes must be positive integers')
}

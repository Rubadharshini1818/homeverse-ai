import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config.js'
import { optionalAuthentication } from './middleware/auth.js'
import authRoutes from './routes/auth.js'
import designsRoutes from './routes/designs.js'
import partnersRoutes from './routes/partners.js'
import propertiesRoutes from './routes/properties.js'
import recordsRoutes from './routes/records.js'
import { streamMedia } from './services/media.js'

const app = express()
function isOriginAllowed(origin) {
  if (!origin) return true
  const clean = origin.replace(/\/+$/, '')
  if (config.frontendOrigins.includes(clean)) return true
  try {
    const url = new URL(clean)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.vercel.app')) {
      return true
    }
  } catch {}
  return false
}

app.disable('x-powered-by')
app.set('trust proxy', config.nodeEnv === 'production' ? 1 : false)
app.use(helmet())
app.use(cors({
  origin(origin, callback) {
    if (isOriginAllowed(origin)) return callback(null, true)
    const error = new Error('This origin is not allowed to access the HomeverseAI API.')
    error.status = 403
    return callback(error)
  },
  credentials: true
}))
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb' }))
app.use(cookieParser())
app.use((req, _res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) req.body = {}
  next()
})
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
    && req.headers.origin
    && !isOriginAllowed(req.headers.origin)) {
    return res.status(403).json({ error: { message: 'This origin is not allowed to modify HomeverseAI data.' } })
  }
  return next()
})

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api/auth', authRoutes)
app.use('/api/properties', propertiesRoutes)
app.use('/api/partners', partnersRoutes)
app.use('/api/designs', designsRoutes)
app.use('/api', recordsRoutes)
app.get('/api/media/:id', optionalAuthentication, streamMedia)

app.use((_req, res) => {
  res.status(404).json({ error: { message: 'The requested API resource was not found.' } })
})

app.use((error, _req, res, _next) => {
  let status = Number.isInteger(error.status) ? error.status : 500
  let message = status >= 500 ? 'The request could not be completed. Please try again.' : error.message
  let details = error.details

  if (error.name === 'ValidationError') {
    status = 400
    message = 'Some details are invalid.'
    details = Object.fromEntries(Object.entries(error.errors).map(([field, issue]) => [field, issue.message]))
  } else if (error.name === 'CastError') {
    status = 400
    message = 'A request value is invalid.'
  } else if (error.name === 'MulterError') {
    status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    message = error.code === 'LIMIT_FILE_SIZE'
      ? 'An uploaded file exceeds the 25 MB per-file limit.'
      : 'The uploaded files could not be accepted.'
  }

  if (status >= 500) console.error(error)
  return res.status(status).json({ error: { message, ...(details ? { details } : {}) } })
})

export default app

import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { User } from '../models.js'

export async function authenticate(req, res, next) {
  const token = req.cookies.homeverse_access
  if (!token) {
    return res.status(401).json({ error: { message: 'Please sign in to continue.' } })
  }

  try {
    const claims = jwt.verify(token, config.jwtSecret)
    const user = await User.findById(claims.sub)
    if (!user || user.role !== claims.role) {
      return res.status(401).json({ error: { message: 'Your session is no longer valid. Please sign in again.' } })
    }
    req.user = user
    return next()
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: { message: 'Your session has expired. Please sign in again.' } })
    }
    return next(error)
  }
}

export function optionalAuthentication(req, _res, next) {
  const token = req.cookies.homeverse_access
  if (!token) return next()
  try {
    const claims = jwt.verify(token, config.jwtSecret)
    User.findById(claims.sub).then((user) => {
      if (user && user.role === claims.role) req.user = user
      next()
    }).catch(next)
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') return next()
    return next(error)
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: { message: 'You do not have permission to perform this action.' } })
    }
    return next()
  }
}

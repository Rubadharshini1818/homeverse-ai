import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { rateLimit } from 'express-rate-limit'
import { config } from '../config.js'
import { authenticate } from '../middleware/auth.js'
import {
  CustomerProfile,
  OwnerProfile,
  PartnerProfile,
  Session,
  User
} from '../models.js'
import { httpError } from '../utils.js'

const router = Router()
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { message: 'Too many authentication attempts. Try again later.' } }
})
const accessCookie = 'homeverse_access'
const refreshCookie = 'homeverse_refresh'

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: config.cookieSameSite,
    path: '/api',
    maxAge
  }
}

function clearCookies(res) {
  res.clearCookie(accessCookie, cookieOptions(0))
  res.clearCookie(refreshCookie, cookieOptions(0))
}

function tokenDigest(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function profileFor(user) {
  if (user.role === 'CUSTOMER') return CustomerProfile.findOne({ userId: user._id }).lean()
  if (user.role === 'PROPERTY_OWNER') return OwnerProfile.findOne({ userId: user._id }).lean()
  return PartnerProfile.findOne({ userId: user._id }).lean()
}

export async function publicUser(user) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    profile: await profileFor(user)
  }
}

async function issueSession(user, res, existingSession = null) {
  const refreshToken = randomBytes(48).toString('base64url')
  const expiresAt = new Date(Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000)
  if (existingSession) {
    existingSession.tokenHash = tokenDigest(refreshToken)
    existingSession.expiresAt = expiresAt
    await existingSession.save()
  } else {
    await Session.create({ userId: user._id, tokenHash: tokenDigest(refreshToken), expiresAt })
  }
  const accessToken = jwt.sign(
    { sub: String(user._id), role: user.role },
    config.jwtSecret,
    { expiresIn: `${config.accessTokenMinutes}m` }
  )
  res.cookie(accessCookie, accessToken, cookieOptions(config.accessTokenMinutes * 60 * 1000))
  res.cookie(refreshCookie, refreshToken, cookieOptions(config.refreshTokenDays * 24 * 60 * 60 * 1000))
  return publicUser(user)
}

function normalizedPhone(phone) {
  return String(phone || '').trim().replace(/[\s().-]/g, '')
}

export function validateRegistration(body = {}) {
  const errors = {}
  if (typeof body.fullName !== 'string' || body.fullName.trim().length < 2 || body.fullName.trim().length > 120) {
    errors.fullName = 'Enter a name between 2 and 120 characters.'
  }
  if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }
  if (normalizedPhone(body.phone).length < 8 || normalizedPhone(body.phone).length > 20) {
    errors.phone = 'Enter a valid phone number.'
  }
  if (typeof body.password !== 'string' || body.password.length < 8 || Buffer.byteLength(body.password, 'utf8') > 72) {
    errors.password = 'Password must be at least 8 characters and no more than 72 UTF-8 bytes.'
  }
  if (!['CUSTOMER', 'PROPERTY_OWNER', 'HOME_PARTNER'].includes(body.role)) {
    errors.role = 'Select a valid account type.'
  }
  if (body.role === 'HOME_PARTNER' && !['INTERIOR', 'HOMECARE'].includes(body.partnerType)) {
    errors.partnerType = 'Select an Interior or HomeCare partner type.'
  }
  if (body.role === 'PROPERTY_OWNER') {
    if (typeof body.governmentId !== 'string' || body.governmentId.trim().length < 2 || body.governmentId.trim().length > 100) {
      errors.governmentId = 'Enter a valid government ID.'
    }
    if (typeof body.address !== 'string' || !body.address.trim()) errors.address = 'Enter your address.'
    if (typeof body.city !== 'string' || !body.city.trim()) errors.city = 'Enter your city.'
  }
  if (body.role === 'HOME_PARTNER') {
    if (typeof body.specialization !== 'string' || body.specialization.trim().length < 2 || body.specialization.trim().length > 300) {
      errors.specialization = 'Enter a specialization of up to 300 characters.'
    }
    if (typeof body.address !== 'string' || !body.address.trim()) errors.address = 'Enter your address.'
    if (typeof body.city !== 'string' || !body.city.trim()) errors.city = 'Enter your city.'
    if (body.partnerType === 'HOMECARE'
      && !['Electrician', 'Plumber', 'Carpenter', 'Painter', 'Cleaning Service', 'AC Service', 'Appliance Repair', 'Pest Control', 'Other Home Services'].includes(body.serviceCategory)) {
      errors.serviceCategory = 'Choose a supported HomeCare service category.'
    }
    if (body.experience !== undefined && body.experience !== '') {
      const experience = Number(body.experience)
      if (!Number.isFinite(experience) || experience < 0 || experience > 100) {
        errors.experience = 'Experience must be between 0 and 100 years.'
      }
    }
  }
  if (Object.keys(errors).length) {
    const error = new Error('Please correct the highlighted registration details.')
    error.status = 400
    error.details = errors
    throw error
  }
}

async function createRoleProfile(user, body, session) {
  if (user.role === 'CUSTOMER') {
    await CustomerProfile.create([{
      userId: user._id,
      address: body.address || '',
      city: body.city || '',
      state: body.state || '',
      pinCode: body.pinCode || ''
    }], { session })
    return
  }
  if (user.role === 'PROPERTY_OWNER') {
    await OwnerProfile.create([{
      userId: user._id,
      governmentId: body.governmentId || '',
      address: body.address || '',
      city: body.city || '',
      state: body.state || '',
      pinCode: body.pinCode || '',
      companyName: body.companyName || ''
    }], { session })
    return
  }
  await PartnerProfile.create([{
    userId: user._id,
    partnerType: body.partnerType,
    companyName: body.companyName || '',
    experience: Math.max(0, Number(body.experience) || 0),
    specialization: body.specialization || '',
    about: body.about || '',
    address: body.address || '',
    city: body.city || '',
    state: body.state || '',
    pinCode: body.pinCode || '',
    services: body.serviceCategory
      ? [{ title: body.serviceCategory, category: body.serviceCategory }]
      : []
  }], { session })
  // Note: visitingCard and certifications are uploaded after account creation (Step 3 of wizard)
}

router.post('/register', authLimiter, async (req, res, next) => {
  let databaseSession
  try {
    validateRegistration(req.body)
    databaseSession = await User.startSession()
    let user
    await databaseSession.withTransaction(async () => {
      const email = req.body.email.trim().toLowerCase()
      const phone = normalizedPhone(req.body.phone)
      const passwordHash = await bcrypt.hash(req.body.password, 12)
      const [createdUser] = await User.create([{
        fullName: req.body.fullName.trim(),
        email,
        phone,
        passwordHash,
        role: req.body.role
      }], { session: databaseSession })
      await createRoleProfile(createdUser, req.body, databaseSession)
      user = createdUser
    })
    const result = await issueSession(user, res)
    return res.status(201).json({ user: result })
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0]
      return res.status(409).json({
        error: { message: field === 'phone' ? 'An account already uses this phone number.' : 'An account already uses this email address.' }
      })
    }
    return next(error)
  } finally {
    await databaseSession?.endSession()
  }
})

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    const password = req.body.password
    if (!email || typeof password !== 'string') {
      return res.status(400).json({ error: { message: 'Email and password are required.' } })
    }
    const user = await User.findOne({ email }).select('+passwordHash')
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: { message: 'Email or password is incorrect.' } })
    }
    const result = await issueSession(user, res)
    return res.json({ user: result })
  } catch (error) {
    return next(error)
  }
})

router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies[refreshCookie]
    if (!token) return res.status(401).json({ error: { message: 'Your session has expired. Please sign in again.' } })
    const session = await Session.findOne({ tokenHash: tokenDigest(token), expiresAt: { $gt: new Date() } })
    if (!session) {
      clearCookies(res)
      return res.status(401).json({ error: { message: 'Your session has expired. Please sign in again.' } })
    }
    const user = await User.findById(session.userId)
    if (!user) {
      await session.deleteOne()
      clearCookies(res)
      return res.status(401).json({ error: { message: 'Your account is no longer available.' } })
    }
    const result = await issueSession(user, res, session)
    return res.json({ user: result })
  } catch (error) {
    return next(error)
  }
})

router.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies[refreshCookie]
    if (token) await Session.deleteOne({ tokenHash: tokenDigest(token) })
    clearCookies(res)
    return res.json({ message: 'You have been signed out.' })
  } catch (error) {
    return next(error)
  }
})

router.get('/me', authenticate, async (req, res, next) => {
  try {
    return res.json({ user: await publicUser(req.user) })
  } catch (error) {
    return next(error)
  }
})

router.patch('/profile', authenticate, async (req, res, next) => {
  let databaseSession
  try {
    const userUpdates = {}
    if (req.body.fullName !== undefined) {
      const fullName = String(req.body.fullName).trim()
      if (fullName.length < 2 || fullName.length > 120) throw httpError(400, 'Name must be between 2 and 120 characters.')
      userUpdates.fullName = fullName
    }
    if (req.body.email !== undefined) {
      const email = String(req.body.email).trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Enter a valid email address.')
      userUpdates.email = email
    }
    if (req.body.phone !== undefined) {
      const phone = normalizedPhone(req.body.phone)
      if (phone.length < 8 || phone.length > 20) throw httpError(400, 'Enter a valid phone number.')
      userUpdates.phone = phone
    }
    const profile = req.body.profile || {}
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw httpError(400, 'Profile updates must be an object.')
    const textFields = (fields, limits = {}) => Object.fromEntries(fields
      .filter((field) => profile[field] !== undefined)
      .map((field) => {
        if (typeof profile[field] !== 'string') throw httpError(400, `${field} must be text.`)
        const value = String(profile[field]).trim()
        if (value.length > (limits[field] || 500)) {
          throw httpError(400, `${field} is too long.`)
        }
        return [field, value]
      }))
    let profileModel
    let allowedFields
    if (req.user.role === 'CUSTOMER') {
      profileModel = CustomerProfile
      allowedFields = ['address', 'city', 'state', 'pinCode']
    } else if (req.user.role === 'PROPERTY_OWNER') {
      profileModel = OwnerProfile
      allowedFields = ['governmentId', 'address', 'city', 'state', 'pinCode', 'companyName']
    } else {
      profileModel = PartnerProfile
      allowedFields = ['address', 'city', 'state', 'pinCode', 'companyName', 'specialization', 'about']
    }
    const profileUpdates = textFields(allowedFields)
    databaseSession = await User.startSession()
    await databaseSession.withTransaction(async () => {
      if (Object.keys(userUpdates).length) {
        Object.assign(req.user, userUpdates)
        await req.user.save({ session: databaseSession })
      }
      if (Object.keys(profileUpdates).length) {
        await profileModel.updateOne(
          { userId: req.user._id },
          { $set: profileUpdates },
          { runValidators: true, session: databaseSession }
        )
      }
    })
    return res.json({ user: await publicUser(req.user) })
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0]
      return res.status(409).json({
        error: { message: field === 'phone' ? 'An account already uses this phone number.' : 'An account already uses this email address.' }
      })
    }
    return next(error)
  } finally {
    await databaseSession?.endSession()
  }
})

export default router

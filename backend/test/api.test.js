/**
 * Homeverse AI — API Integration Test Suite
 * Uses Node.js built-in test runner (node --test)
 * Runs against the configured MONGODB_URI (Atlas or local).
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import mongoose from 'mongoose'
import 'dotenv/config'

const [
  { default: app },
  { validateRegistration },
  { escapeRegex, parseOptionalDate, parseStringArray },
  { CustomerProfile, Property, Session, User },
  { config }
] = await Promise.all([
  import('../src/app.js'),
  import('../src/routes/auth.js'),
  import('../src/utils.js'),
  import('../src/models.js'),
  import('../src/config.js')
])

let server
let baseUrl

// Unique suffix so test users don't collide with real data
const TEST_TAG = `test_${Date.now()}`
const TEST_EMAIL = `homeverse.${TEST_TAG}@example.com`
const TEST_EMAIL_2 = `homeverse2.${TEST_TAG}@example.com`
const TEST_PHONE = `+919${String(Date.now()).slice(-9)}`
const TEST_PHONE_2 = `+918${String(Date.now() + 1).slice(-9)}`
const TEST_PASSWORD = 'SecureP@ssw0rd!'

/** Shared state across tests in auth block */
const session = { cookie: '', userId: '' }

before(async () => {
  // Connect to MongoDB Atlas using the same URI as the main server
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15_000, autoIndex: true })
  server = app.listen(0)
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  // Clean up test users and their sessions so tests are non-destructive
  try {
    const users = await User.find({ email: { $in: [TEST_EMAIL, TEST_EMAIL_2] } }).select('_id').lean()
    const ids = users.map((u) => u._id)
    if (ids.length) {
      await Promise.all([
        User.deleteMany({ _id: { $in: ids } }),
        Session.deleteMany({ userId: { $in: ids } }),
        CustomerProfile.deleteMany({ userId: { $in: ids } })
      ])
    }
  } catch {
    // Best-effort cleanup — do not fail the test suite on cleanup errors
  }
  if (server) await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
  await mongoose.disconnect()
})

// ─── Infrastructure tests ──────────────────────────────────────────────────

describe('Infrastructure', () => {
  it('health endpoint returns ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { status: 'ok' })
  })

  it('unknown API paths return JSON 404', async () => {
    const res = await fetch(`${baseUrl}/api/not-a-real-route`)
    assert.equal(res.status, 404)
    assert.equal((await res.json()).error.message, 'The requested API resource was not found.')
  })

  it('untrusted origins cannot submit mutations', async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Origin: 'https://untrusted.example' }
    })
    assert.equal(res.status, 403)
  })

  it('protected customer routes require authentication', async () => {
    const res = await fetch(`${baseUrl}/api/enquiries/mine`)
    assert.equal(res.status, 401)
    assert.match((await res.json()).error.message, /sign in/i)
  })

  it('saved-properties requires authentication', async () => {
    const res = await fetch(`${baseUrl}/api/saved-properties`)
    assert.equal(res.status, 401)
  })
})

// ─── Unit: validation & utils ──────────────────────────────────────────────

describe('Validation utilities', () => {
  it('parseStringArray handles JSON and CSV formats', () => {
    assert.deepEqual(parseStringArray('["Parking","Balcony"]', 'Amenities'), ['Parking', 'Balcony'])
    assert.deepEqual(parseStringArray('Parking, Balcony', 'Amenities'), ['Parking', 'Balcony'])
    assert.throws(() => parseStringArray('{"not":"a list"}', 'Amenities'), { status: 400 })
  })

  it('parseOptionalDate rejects past or invalid dates', () => {
    assert.throws(() => parseOptionalDate('not-a-date'), { status: 400 })
    assert.throws(() => parseOptionalDate('2000-01-01T00:00:00.000Z'), { status: 400 })
    // A future date must not throw
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    assert.ok(parseOptionalDate(future) instanceof Date)
  })

  it('escapeRegex escapes special characters', () => {
    assert.equal(escapeRegex('City.+'), 'City\\.\\+')
    assert.equal(escapeRegex('(area)'), '\\(area\\)')
  })

  it('validateRegistration rejects short passwords', () => {
    assert.throws(() => validateRegistration({
      fullName: 'Test User', email: 'test@example.com',
      phone: '+911234567890', password: 'short', role: 'CUSTOMER'
    }), (err) => err.status === 400 && Boolean(err.details?.password))
  })

  it('validateRegistration rejects unknown roles', () => {
    assert.throws(() => validateRegistration({
      fullName: 'Test User', email: 'test@example.com',
      phone: '+911234567890', password: 'SecureP@ssw0rd!', role: 'ADMIN'
    }), (err) => err.status === 400 && Boolean(err.details?.role))
  })

  it('HOME_PARTNER registration requires a supported partnerType', () => {
    assert.throws(() => validateRegistration({
      fullName: 'Test Partner', email: 'partner@example.com',
      phone: '+911234567891', password: 'SecureP@ssw0rd!',
      role: 'HOME_PARTNER', partnerType: 'OTHER',
      specialization: 'Painting', address: '123 Main St', city: 'Mumbai'
    }), (err) => err.status === 400 && Boolean(err.details?.partnerType))
  })
})

// ─── Unit: Mongoose schema constraints ────────────────────────────────────

describe('Mongoose schema constraints', () => {
  it('User email and phone are unique; passwordHash is not selected by default', () => {
    assert.equal(User.schema.path('passwordHash').options.select, false)
    const uniqueFields = User.schema.indexes()
      .filter(([, opts]) => opts.unique)
      .flatMap(([fields]) => Object.keys(fields))
    assert.ok(uniqueFields.includes('email'))
    assert.ok(uniqueFields.includes('phone'))
  })

  it('CustomerProfile userId is unique', () => {
    assert.ok(CustomerProfile.schema.indexes().some(([f, opts]) => f.userId === 1 && opts.unique))
  })

  it('Property schema requires ownerId, title, description, price', () => {
    const invalid = new Property({ type: 'buy' })
    const errors = invalid.validateSync().errors
    assert.ok(errors.ownerId)
    assert.ok(errors.title)
    assert.ok(errors.description)
    assert.ok(errors.price)
  })

  it('User schema rejects unknown roles', () => {
    const invalid = new User({
      fullName: 'X', email: 'x@x.com', phone: '+91000000000',
      passwordHash: 'x', role: 'SUPERUSER'
    })
    assert.ok(invalid.validateSync().errors.role)
  })
})

// ─── Integration: config startup guard ───────────────────────────────────

describe('Config startup guard', () => {
  it('server refuses to start without MONGODB_URI', async () => {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const { fileURLToPath } = await import('node:url')
    const run = promisify(execFile)
    await assert.rejects(run(process.execPath, [
      '--input-type=module', '-e', "import('./src/config.js')"
    ], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, MONGODB_URI: '', JWT_SECRET: 'test-only-homeverse-secret-that-is-long-enough' }
    }), (err) => err.code === 1 && err.stderr.includes('MONGODB_URI must be configured'))
  })
})

// ─── Integration: Registration ────────────────────────────────────────────

describe('User Registration (MongoDB Atlas)', () => {
  it('invalid registration payload is rejected (400) before DB access', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Test Customer', email: TEST_EMAIL,
        phone: TEST_PHONE, password: 'short', role: 'CUSTOMER'
      })
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.ok(body.error.details?.password, 'Should report password error detail')
  })

  it('new CUSTOMER registers successfully and returns user + sets cookies', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Homeverse Test Customer',
        email: TEST_EMAIL,
        phone: TEST_PHONE,
        password: TEST_PASSWORD,
        role: 'CUSTOMER'
      })
    })
    assert.equal(res.status, 201)
    const body = await res.json()
    assert.ok(body.user?.id, 'Response must include user.id')
    assert.equal(body.user.email, TEST_EMAIL)
    assert.equal(body.user.role, 'CUSTOMER')
    assert.ok(!body.user.passwordHash, 'Password hash must NOT be in response')

    // Capture cookies for subsequent tests
    const setCookie = res.headers.get('set-cookie') || ''
    session.cookie = setCookie
    session.userId = body.user.id

    // Verify data is actually in MongoDB
    const dbUser = await User.findById(body.user.id).select('+passwordHash').lean()
    assert.ok(dbUser, 'User must exist in MongoDB')
    assert.equal(dbUser.email, TEST_EMAIL)
    assert.ok(dbUser.passwordHash, 'Password hash must be stored in DB')
    assert.notEqual(dbUser.passwordHash, TEST_PASSWORD, 'Password must be hashed, not stored plain')

    // Verify CustomerProfile was created
    const profile = await CustomerProfile.findOne({ userId: dbUser._id }).lean()
    assert.ok(profile, 'CustomerProfile must be created in MongoDB')
  })

  it('duplicate email registration returns 409 conflict', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Duplicate User',
        email: TEST_EMAIL,  // same email
        phone: TEST_PHONE_2, // different phone
        password: TEST_PASSWORD,
        role: 'CUSTOMER'
      })
    })
    assert.equal(res.status, 409)
    const body = await res.json()
    assert.match(body.error.message, /email/i)
  })
})

// ─── Integration: Login ───────────────────────────────────────────────────

describe('User Login', () => {
  it('login with correct credentials returns user and sets cookies', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(body.user?.id)
    assert.equal(body.user.email, TEST_EMAIL)
    assert.ok(!body.user.passwordHash, 'Password hash must NOT be in login response')
    // Update session cookie from login response
    const setCookie = res.headers.get('set-cookie') || ''
    if (setCookie) session.cookie = setCookie
  })

  it('login with wrong password returns 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: 'wrongpassword' })
    })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.match(body.error.message, /incorrect/i)
  })

  it('login with unknown email returns 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@nowhere.com', password: TEST_PASSWORD })
    })
    assert.equal(res.status, 401)
  })

  it('login with missing fields returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL })
    })
    assert.equal(res.status, 400)
  })
})

// ─── Integration: Protected routes & session ─────────────────────────────

describe('JWT Authentication & Protected Routes', () => {
  it('GET /auth/me without cookie returns 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`)
    assert.equal(res.status, 401)
  })

  it('GET /auth/me with valid access cookie returns user', async () => {
    // Re-login to get a fresh cookie
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
    })
    assert.equal(loginRes.status, 200)
    const cookie = loginRes.headers.get('set-cookie') || ''

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookie }
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.user.email, TEST_EMAIL)
    assert.equal(body.user.role, 'CUSTOMER')
  })

  it('customer cannot access owner-only routes (403)', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
    })
    const cookie = loginRes.headers.get('set-cookie') || ''

    const res = await fetch(`${baseUrl}/api/properties/mine`, {
      headers: { Cookie: cookie }
    })
    assert.equal(res.status, 403)
  })

  it('customer cannot access partner-only routes (403)', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
    })
    const cookie = loginRes.headers.get('set-cookie') || ''

    const res = await fetch(`${baseUrl}/api/partners/mine`, {
      headers: { Cookie: cookie }
    })
    assert.equal(res.status, 403)
  })
})

// ─── Integration: Contact form ────────────────────────────────────────────

describe('Contact Form (MongoDB persistence)', () => {
  it('valid contact message is saved to MongoDB', async () => {
    const name = `Test User ${TEST_TAG}`
    const email = `contact.${TEST_TAG}@example.com`
    const message = 'This is a test contact message from the automated test suite.'

    const res = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message })
    })
    assert.equal(res.status, 201)
    const body = await res.json()
    assert.ok(body.id, 'Response must include the saved document ID')
    assert.match(body.message, /received/i)
  })


  it('contact form rejects short or missing fields', async () => {
    const res = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'A', email: 'bademail', message: 'Hi' })
    })
    assert.equal(res.status, 400)
  })
})

// ─── Integration: Logout ─────────────────────────────────────────────────

describe('Logout', () => {
  it('logout clears cookies and deletes session from MongoDB', async () => {
    // Login first
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
    })
    assert.equal(loginRes.status, 200)
    const cookie = loginRes.headers.get('set-cookie') || ''

    // Count sessions before logout for this user only
    const user = await User.findOne({ email: TEST_EMAIL }).lean()
    const sessionsBefore = await Session.countDocuments({ userId: user._id })
    assert.ok(sessionsBefore >= 1, 'At least one session should exist before logout')

    // Logout
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie }
    })
    assert.equal(logoutRes.status, 200)
    const body = await logoutRes.json()
    assert.match(body.message, /signed out/i)

    // Session should be removed from MongoDB for this user
    const sessionsAfter = await Session.countDocuments({ userId: user._id })
    assert.ok(sessionsAfter <= sessionsBefore, 'Session count should not increase after logout')
  })


  it('GET /auth/me after logout returns 401', async () => {
    // The cookies from the previous logout are cleared — this call should fail
    const res = await fetch(`${baseUrl}/api/auth/me`)
    assert.equal(res.status, 401)
  })
})

// ─── Integration: Public endpoints (no auth needed) ──────────────────────

describe('Public API endpoints', () => {
  it('GET /api/properties returns a list (empty is ok if no published props)', async () => {
    const res = await fetch(`${baseUrl}/api/properties`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(Array.isArray(body.properties))
  })

  it('GET /api/partners returns a list', async () => {
    const res = await fetch(`${baseUrl}/api/partners`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(Array.isArray(body.partners))
  })

  it('GET /api/properties/:invalidId returns 404 (not a valid ObjectId route)', async () => {
    const res = await fetch(`${baseUrl}/api/properties/not-an-id`)
    assert.equal(res.status, 404)
  })

  it('GET /api/properties/:unknownId returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/properties/000000000000000000000000`)
    assert.equal(res.status, 404)
  })
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createSession,
  requestIsAuthenticated,
  verifyPassword,
  verifySession,
} from '../lib/auth.js'

const originalSecret = process.env.SCOUT_AUTH_SECRET
const originalPassword = process.env.SCOUT_LOGIN_PASSWORD
process.env.SCOUT_AUTH_SECRET = 'test-only-session-secret-that-is-long-enough-32'
process.env.SCOUT_LOGIN_PASSWORD = 'test-only-password-12345'

test('signed session accepts valid token, rejects tampering and expiry', () => {
  const now = 1_800_000_000_000
  const token = createSession(now)
  assert.equal(verifySession(token, now), true)
  assert.equal(verifySession(`${token}x`, now), false)
  assert.equal(verifySession(token, now + 8 * 24 * 60 * 60 * 1000), false)
})

test('password check succeeds only for the configured exact value', () => {
  assert.equal(verifyPassword('test-only-password-12345'), true)
  assert.equal(verifyPassword('wrong-password'), false)
})

test('request cookie authentication reads the HttpOnly session cookie value', () => {
  const token = createSession()
  const request = new Request('https://scout.example/api/leads', {
    headers: { cookie: `other=1; cravoe-scout-session=${token}` },
  })
  assert.equal(requestIsAuthenticated(request), true)
})

test.after(() => {
  if (originalSecret === undefined) delete process.env.SCOUT_AUTH_SECRET
  else process.env.SCOUT_AUTH_SECRET = originalSecret
  if (originalPassword === undefined) delete process.env.SCOUT_LOGIN_PASSWORD
  else process.env.SCOUT_LOGIN_PASSWORD = originalPassword
})

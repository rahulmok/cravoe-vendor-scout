import test from 'node:test'
import assert from 'node:assert/strict'
import { createSession, SESSION_COOKIE } from '../lib/auth.js'
import { guardApi } from '../lib/api-guard.js'

const env = {
  secret: process.env.SCOUT_AUTH_SECRET,
  password: process.env.SCOUT_LOGIN_PASSWORD,
  url: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  places: process.env.GOOGLE_PLACES_API_KEY,
}
process.env.SCOUT_AUTH_SECRET = 'test-only-session-secret-that-is-long-enough-32'
process.env.SCOUT_LOGIN_PASSWORD = 'test-only-password-12345'
delete process.env.SUPABASE_URL
delete process.env.SUPABASE_SERVICE_ROLE_KEY
delete process.env.GOOGLE_PLACES_API_KEY

test('allows authenticated demo scouting with local throttling when Supabase is not configured', async () => {
  const token = createSession()
  const request = new Request('https://scout.example/api/scout', {
    method: 'POST', headers: {
      origin: 'https://scout.example',
      cookie: `${SESSION_COOKIE}=${token}`,
    },
  })
  assert.equal(await guardApi(request, { scope: 'scout', perMinute: 1, perDay: 2 }), null)
  const second = await guardApi(request, { scope: 'scout', perMinute: 1, perDay: 2 })
  assert.equal(second.status, 429)
})

test('fails closed for provider-cost APIs if Supabase rate limiting is unavailable', async () => {
  const token = createSession()
  process.env.GOOGLE_PLACES_API_KEY = 'configured-provider-key'
  const request = new Request('https://scout.example/api/scout', {
    method: 'POST', headers: { origin: 'https://scout.example', cookie: `${SESSION_COOKIE}=${token}` },
  })
  const response = await guardApi(request, { scope: 'scout' })
  assert.equal(response.status, 503)
  delete process.env.GOOGLE_PLACES_API_KEY
})

test.after(() => {
  for (const [name, value] of Object.entries({
    SCOUT_AUTH_SECRET: env.secret,
    SCOUT_LOGIN_PASSWORD: env.password,
    SUPABASE_URL: env.url,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceKey,
    GOOGLE_PLACES_API_KEY: env.places,
  })) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

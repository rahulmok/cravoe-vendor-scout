import { timingSafeEqual, createHmac } from 'node:crypto'

export const SESSION_COOKIE = 'cravoe-scout-session'
const SESSION_SECONDS = 60 * 60 * 24 * 7

function configuredPassword() {
  return process.env.INTERNAL_APP_PASSPHRASE || process.env.SCOUT_LOGIN_PASSWORD || ''
}

function secret() {
  const value = process.env.INTERNAL_SESSION_SECRET || process.env.SCOUT_AUTH_SECRET
  if (!value || value.length < 32) throw new Error('Missing or weak INTERNAL_SESSION_SECRET')
  return value
}

function sign(value) {
  return createHmac('sha256', secret()).update(value).digest('base64url')
}

export function authIsConfigured() {
  return configuredPassword().length >= 8 &&
    String(process.env.INTERNAL_SESSION_SECRET || process.env.SCOUT_AUTH_SECRET || '').length >= 32
}

export function verifyPassword(candidate) {
  const expected = configuredPassword()
  if (expected.length < 8 || typeof candidate !== 'string') return false
  const left = Buffer.from(candidate)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function createSession(now = Date.now()) {
  const expires = Math.floor(now / 1000) + SESSION_SECONDS
  const payload = `owner:${expires}`
  return `${payload}.${sign(payload)}`
}

export function verifySession(token, now = Date.now()) {
  if (typeof token !== 'string') return false
  const split = token.lastIndexOf('.')
  if (split < 0) return false
  const payload = token.slice(0, split)
  const signature = token.slice(split + 1)
  const match = /^owner:(\d+)$/.exec(payload)
  if (!match || Number(match[1]) <= Math.floor(now / 1000)) return false
  try {
    const expected = Buffer.from(sign(payload))
    const received = Buffer.from(signature)
    return expected.length === received.length && timingSafeEqual(expected, received)
  } catch {
    return false
  }
}

export function sessionCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: SESSION_SECONDS }
}

export function requestIsAuthenticated(request) {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const value = cookieHeader.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`))
  return verifySession(value?.slice(SESSION_COOKIE.length + 1))
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try { return new URL(origin).host === new URL(request.url).host }
  catch { return false }
}

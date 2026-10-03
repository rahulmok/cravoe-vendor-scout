import { NextResponse } from 'next/server'
import { authIsConfigured, createSession, SESSION_COOKIE, sessionCookieOptions, verifyPassword } from '../../../../lib/auth.js'
import { guardApi } from '../../../../lib/api-guard.js'
import { isRecord, readJson } from '../../../../lib/http.js'

export async function POST(request) {
  const denied = await guardApi(request, { scope: 'auth-login', auth: false, perMinute: 8, perDay: 40 })
  if (denied) return denied
  try {
    if (!authIsConfigured()) {
      return NextResponse.json({ error: 'Internal authentication is not configured.' }, { status: 503 })
    }
    const body = await readJson(request, 4096)
    if (!isRecord(body) || typeof body.password !== 'string' || body.password.length > 1024) {
      return NextResponse.json({ error: 'Invalid login request.' }, { status: 400 })
    }
    if (!verifyPassword(body.password)) return NextResponse.json({ error: 'Invalid password.' }, { status: 401 })
    const response = NextResponse.json({ ok: true })
    response.cookies.set(SESSION_COOKIE, createSession(), sessionCookieOptions())
    return response
  } catch {
    return NextResponse.json({ error: 'Login could not be completed.' }, { status: 500 })
  }
}

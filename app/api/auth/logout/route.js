import { NextResponse } from 'next/server'
import { SESSION_COOKIE, sessionCookieOptions } from '../../../../lib/auth.js'
import { guardApi } from '../../../../lib/api-guard.js'

export async function POST(request) {
  const denied = await guardApi(request, { scope: 'auth-logout', perMinute: 20, perDay: 100 })
  if (denied) return denied
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 })
  return response
}

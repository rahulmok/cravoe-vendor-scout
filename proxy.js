import { NextResponse } from 'next/server'
import { requestIsAuthenticated } from './lib/auth.js'

export function proxy(request) {
  const pathname = request.nextUrl.pathname
  if (pathname === '/login' || pathname === '/api/auth/login' || pathname.startsWith('/_next/')) {
    return NextResponse.next()
  }
  if (requestIsAuthenticated(request)) return NextResponse.next()
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  return NextResponse.redirect(new URL('/login', request.url))
}

export const config = { matcher: ['/((?!favicon.ico|robots.txt|sitemap.xml).*)'] }

import { requestIsAuthenticated, sameOrigin } from './auth.js'
import { consumeRateLimit, SupabaseUnavailableError } from './supabase.js'
import { safeErrorMessage } from './http.js'

function consumeLocalLimit(actor, scope, limit, windowSeconds) {
  const buckets = globalThis.__cravoeScoutRateLimits ??= new Map()
  const windowStart = Math.floor(Date.now() / (windowSeconds * 1000))
  const key = `${actor}:${scope}:${windowSeconds}:${windowStart}`
  const count = (buckets.get(key) ?? 0) + 1
  buckets.set(key, count)
  return count <= limit
}

function localFallbackResult({ scope, auth, perMinute, perDay }) {
  const canRunWithoutPersistence = scope === 'auth-login' || scope === 'auth-logout'
    || (scope === 'scout' && !process.env.GOOGLE_PLACES_API_KEY)
  if (!canRunWithoutPersistence) return null
  const actor = auth ? 'owner' : 'login'
  const minuteOk = consumeLocalLimit(actor, `${scope}:minute`, perMinute, 60)
  const dayOk = consumeLocalLimit(actor, `${scope}:day`, perDay, 86400)
  return minuteOk && dayOk
}

export async function guardApi(request, { scope, perMinute = 30, perDay = 200, auth = true } = {}) {
  if (!sameOrigin(request)) return Response.json({ error: 'Request rejected' }, { status: 403 })
  if (auth && !requestIsAuthenticated(request)) return Response.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const actor = auth ? 'owner' : 'login'
    const minuteOk = await consumeRateLimit({ actor, scope: `${scope}:minute`, limit: perMinute, windowSeconds: 60 })
    const dayOk = await consumeRateLimit({ actor, scope: `${scope}:day`, limit: perDay, windowSeconds: 86400 })
    if (!minuteOk || !dayOk) return Response.json({ error: 'Rate limit reached. Try again later.' }, { status: 429 })
  } catch (error) {
    if (error instanceof SupabaseUnavailableError) {
      const fallback = localFallbackResult({ scope, auth, perMinute, perDay })
      if (fallback === true) return null
      if (fallback === false) return Response.json({ error: 'Rate limit reached. Try again later.' }, { status: 429 })
    }
    const status = 503
    return Response.json({ error: safeErrorMessage({ status }) }, { status })
  }
  return null
}

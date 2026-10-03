export async function readJson(request, maxBytes = 32 * 1024) {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('Expected JSON request'), { status: 415 })
  }
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw Object.assign(new Error('Request too large'), { status: 413 })
  const text = await request.text()
  if (new TextEncoder().encode(text).length > maxBytes) throw Object.assign(new Error('Request too large'), { status: 413 })
  try { return JSON.parse(text) }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }) }
}

export function safeErrorMessage(error) {
  const status = Number(error?.status ?? 0)
  if (status === 413) return 'Request too large'
  if (status === 415) return 'Expected a JSON request'
  if (status === 400) return 'Invalid request body'
  if (status === 404) return 'Record not found'
  if (status === 409) return 'This record conflicts with existing data'
  if (status === 503) return 'Persistence service unavailable. Check server configuration.'
  return 'Request could not be completed. Please try again.'
}

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

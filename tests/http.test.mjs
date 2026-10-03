import test from 'node:test'
import assert from 'node:assert/strict'
import { readJson, safeErrorMessage } from '../lib/http.js'

test('readJson accepts bounded JSON objects', async () => {
  const request = new Request('https://scout.example/api', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true }),
  })
  assert.deepEqual(await readJson(request, 32), { ok: true })
})

test('readJson rejects wrong content type, malformed JSON and oversized payloads', async () => {
  await assert.rejects(readJson(new Request('https://scout.example/api', { method: 'POST', body: '{}' }), 32), { status: 415 })
  await assert.rejects(readJson(new Request('https://scout.example/api', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
  }), 32), { status: 400 })
  await assert.rejects(readJson(new Request('https://scout.example/api', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ too: 'large' }),
  }), 4), { status: 413 })
})

test('provider and database errors are not exposed to clients', () => {
  assert.equal(safeErrorMessage(new Error('secret token=do-not-return')), 'Request could not be completed. Please try again.')
  assert.equal(safeErrorMessage({ status: 503 }), 'Persistence service unavailable. Check server configuration.')
})

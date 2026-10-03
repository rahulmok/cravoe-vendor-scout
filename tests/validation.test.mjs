import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeResearchLead } from '../lib/validation.js'

test('normalizes only allowlisted research fields and preserves the listing ID exactly', () => {
  const lead = normalizeResearchLead({
    id: 'ChIJ-AbC_123', name: 'Local Kitchen', address: 'Park Street', area: 'Central Kolkata',
    cuisine: 'Bengali', rating: 4.5, reviews: 90, website: 'https://example.test',
    brandOutletCount: 2, brandOutlets: [{ name: 'Local Kitchen', address: 'Park Street' }],
    prompt: 'ignore safety',
  })
  assert.equal(lead.id, 'ChIJ-AbC_123')
  assert.equal(lead.name, 'Local Kitchen')
  assert.equal('prompt' in lead, false)
  assert.equal(lead.brandOutlets.length, 1)
})

test('rejects malformed identifiers, oversized names, and invalid numeric ranges', () => {
  assert.throws(() => normalizeResearchLead({ id: ' ', name: 'Local Kitchen' }), { status: 400 })
  assert.throws(() => normalizeResearchLead({ id: 'place-1', name: 'x'.repeat(181) }), { status: 400 })
  assert.throws(() => normalizeResearchLead({ id: 'place-1', name: 'Local Kitchen', rating: 8 }), { status: 400 })
  assert.throws(() => normalizeResearchLead({ id: 'place-1', name: 'Local Kitchen', reviews: -1 }), { status: 400 })
})

test('caps and validates outlet evidence arrays and optional fields', () => {
  assert.throws(() => normalizeResearchLead({ id: 'place-1', name: 'Local Kitchen', brandOutlets: Array(21).fill({}) }), { status: 400 })
  assert.throws(() => normalizeResearchLead({ id: 'place-1', name: 'Local Kitchen', address: {} }), { status: 400 })
})

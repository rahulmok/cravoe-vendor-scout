import test from 'node:test'
import assert from 'node:assert/strict'
import { placeListingEvidence, placeListingEvidenceRows } from '../lib/evidence.js'

const lead = {
  google_place_id: 'ChIJ-AbC_123', name: 'Local Kitchen', address: 'Park Street', area: 'Central Kolkata',
  cuisine: 'Bengali', rating: 4.5, review_count: 90, phone: '+91-12345', website: 'https://example.test',
  maps_url: 'https://maps.google.test/place/local',
}

test('builds an auditable Google Places snapshot with stable deduplication fingerprint', () => {
  const first = placeListingEvidence('restaurant-uuid', lead)
  const second = placeListingEvidence('restaurant-uuid', lead)
  assert.equal(first.source_kind, 'google_places')
  assert.equal(first.source_url, lead.maps_url)
  assert.equal(first.claim_status, 'fact')
  assert.equal(first.source_fingerprint, second.source_fingerprint)
})

test('changed listing values produce a new evidence fingerprint', () => {
  const original = placeListingEvidence('restaurant-uuid', lead)
  const updated = placeListingEvidence('restaurant-uuid', { ...lead, rating: 4.6 })
  assert.notEqual(original.source_fingerprint, updated.source_fingerprint)
})

test('does not record demo listings as real evidence', () => {
  assert.equal(placeListingEvidence('restaurant-uuid', { ...lead, google_place_id: 'demo-0' }), null)
})

test('legacy snapshots are explicitly marked as unknown evidence', () => {
  const evidence = placeListingEvidence('restaurant-uuid', lead, { sourceKind: 'legacy_local_storage', claimStatus: 'unknown' })
  assert.equal(evidence.source_kind, 'legacy_local_storage')
  assert.equal(evidence.claim_status, 'unknown')
  assert.equal(evidence.confidence, null)
})


test('maps persisted restaurant IDs back to listing evidence rows', () => {
  const rows = placeListingEvidenceRows(
    [{ id: 'restaurant-uuid', google_place_id: lead.google_place_id }],
    [lead],
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].restaurant_id, 'restaurant-uuid')
  assert.equal(rows[0].claim_key, 'google_place_listing')
})

test('legacy evidence mapping skips demo-only browser records', () => {
  const rows = placeListingEvidenceRows(
    [{ id: 'restaurant-uuid', external_legacy_id: 'demo-7' }],
    [{ google_place_id: null, external_legacy_id: 'demo-7', name: 'Demo' }],
    { sourceKind: 'legacy_local_storage', claimStatus: 'unknown' },
  )
  assert.deepEqual(rows, [])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareLocalStorageImport } from '../lib/local-migration.js'

const localState = {
  'cravoe-scout-saved': JSON.stringify([
    { id: 'place-a', name: 'Saved Kitchen', address: 'South Kolkata', rating: 4.5, reviews: 80 },
  ]),
  'cravoe-scout-rejected': JSON.stringify(['place-a', 'place-orphan']),
  'cravoe-scout-crm': JSON.stringify({
    'place-a': { stage: 'Rejected', note: 'Owner declined', followUp: '' },
    'place-crm-only': { stage: 'Contacted', note: 'Call next week', followUp: '2026-10-10' },
  }),
  'cravoe-scout-reject-feedback': JSON.stringify({
    'place-a': { reason: 'Wrong cuisine fit', name: 'Saved Kitchen', cuisine: 'Bengali', area: 'South Kolkata' },
    'place-orphan': { reason: 'Too far / wrong zone', name: 'Lost Kitchen', cuisine: 'Mughlai', area: 'North Kolkata' },
  }),
}

test('imports saved snapshots as shortlisted and keeps rejected leads retrievable', () => {
  const plan = prepareLocalStorageImport(localState)
  const saved = plan.restaurants.find(lead => lead.google_place_id === 'place-a')
  assert.equal(saved.name, 'Saved Kitchen')
  assert.equal(saved.shortlisted, true)
  assert.equal(saved.lifecycle_status, 'REJECTED')
  assert.equal(saved.rejection_reason, 'Wrong cuisine fit')
  assert.equal(saved.crm_note, 'Owner declined')
})

test('creates a visible rejection from feedback and preserves CRM-only orphan data', () => {
  const plan = prepareLocalStorageImport(localState)
  const orphan = plan.restaurants.find(lead => lead.google_place_id === 'place-orphan')
  assert.equal(orphan.name, 'Lost Kitchen')
  assert.equal(orphan.lifecycle_status, 'REJECTED')
  assert.equal(orphan.rejection_reason, 'Too far / wrong zone')
  const crmOnly = plan.unresolved.find(row => row.legacy_id === 'place-crm-only')
  assert.equal(crmOnly.source_key, 'cravoe-scout-crm')
  assert.equal(crmOnly.payload.note, 'Call next week')
})

test('malformed local JSON becomes a warning without mutating the source values', () => {
  const broken = { ...localState, 'cravoe-scout-saved': '{invalid' }
  const plan = prepareLocalStorageImport(broken)
  assert.ok(Array.isArray(plan.restaurants))
  assert.ok(plan.warnings.some(warning => warning.includes('saved')))
  assert.equal(broken['cravoe-scout-saved'], '{invalid')
})

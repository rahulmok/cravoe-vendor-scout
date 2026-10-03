import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LIFECYCLE_STATUSES,
  RESEARCH_STATUSES,
  lifecycleFromLegacyStage,
  normalizeLifecycle,
  transitionLifecycle,
} from '../lib/lead-state.js'

test('defines all lifecycle and research states explicitly', () => {
  assert.deepEqual(LIFECYCLE_STATUSES, ['NEW', 'RESEARCHING', 'QUALIFIED', 'REVIEW', 'REJECTED', 'CONTACTED', 'INTERESTED', 'ONBOARDED'])
  assert.deepEqual(RESEARCH_STATUSES, ['pending', 'researching', 'complete', 'partial', 'failed'])
})

test('maps legacy CRM stages to the explicit lifecycle', () => {
  assert.equal(lifecycleFromLegacyStage('New'), 'NEW')
  assert.equal(lifecycleFromLegacyStage('Contacted'), 'CONTACTED')
  assert.equal(lifecycleFromLegacyStage('Replied'), 'INTERESTED')
  assert.equal(lifecycleFromLegacyStage('Meeting'), 'INTERESTED')
  assert.equal(lifecycleFromLegacyStage('Onboarded'), 'ONBOARDED')
  assert.equal(lifecycleFromLegacyStage('Rejected'), 'REJECTED')
  assert.equal(lifecycleFromLegacyStage('unknown'), 'NEW')
})

test('rejecting requires a reason and restoration clears it', () => {
  assert.throws(() => transitionLifecycle({ current: 'QUALIFIED', next: 'REJECTED' }), /reason/i)
  assert.deepEqual(transitionLifecycle({ current: 'QUALIFIED', next: 'REJECTED', rejectionReason: 'Wrong cuisine fit' }), {
    status: 'REJECTED', rejectionReason: 'Wrong cuisine fit',
  })
  assert.deepEqual(transitionLifecycle({ current: 'REJECTED', restoreTo: 'QUALIFIED' }), {
    status: 'QUALIFIED', rejectionReason: null,
  })
  assert.deepEqual(transitionLifecycle({ current: 'REJECTED', restoreTo: 'REJECTED' }), {
    status: 'REVIEW', rejectionReason: null,
  })
})

test('non-rejected states clear stale rejection reasons', () => {
  assert.deepEqual(transitionLifecycle({ current: 'REVIEW', next: 'CONTACTED', rejectionReason: 'old reason' }), {
    status: 'CONTACTED', rejectionReason: null,
  })
})

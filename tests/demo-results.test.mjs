import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareDemoResults } from '../lib/scout-results.js'

test('demo leads are visible as clearly-labeled review candidates', () => {
  const demo = [{ id: 'demo-1', name: 'Sample Kitchen', rating: 4.5, reviews: 320, score: 78 }]
  const [lead] = prepareDemoResults(demo)

  assert.equal(lead.researched, false)
  assert.equal(lead.fitStatus, 'REVIEW')
  assert.equal(lead.demo, true)
  assert.equal(lead.estimatedOutlets, null)
  assert.equal(lead.hiddenGem, false)
})

test('demo preparation does not claim verified outlet counts', () => {
  const [lead] = prepareDemoResults([{ id: 'demo-2', name: 'Sample', estimatedOutlets: 4 }])
  assert.equal(lead.estimatedOutlets, null)
  assert.equal(lead.researched, false)
  assert.match(lead.researchReason, /demo/i)
})

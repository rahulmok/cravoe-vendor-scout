import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBrandName } from '../lib/validation.js'

test('normalizes case, whitespace, punctuation, and diacritics without fuzzy merging', () => {
  assert.equal(normalizeBrandName(' Café-au  Lait '), 'cafe au lait')
  assert.notEqual(normalizeBrandName('Bengal Kitchen 1'), normalizeBrandName('Bengal Kitchen 2'))
})

test('preserves normalized non-Latin restaurant names', () => {
  assert.equal(normalizeBrandName('রসুই ঘর'), 'রসুই ঘর')
})

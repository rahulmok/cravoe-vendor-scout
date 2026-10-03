import { createHash } from 'node:crypto'

export function placeListingEvidence(restaurantId, lead, { sourceKind = 'google_places', claimStatus = 'fact' } = {}) {
  const googlePlaceId = String(lead?.google_place_id ?? lead?.id ?? '')
  if (!restaurantId || !googlePlaceId || googlePlaceId.startsWith('demo-')) return null

  const claimValue = {
    name: String(lead.name ?? ''),
    address: String(lead.address ?? ''),
    area: String(lead.area ?? ''),
    cuisine: String(lead.cuisine ?? ''),
    rating: lead.rating ?? null,
    review_count: lead.review_count ?? lead.reviews ?? null,
    phone: String(lead.phone ?? ''),
    website: String(lead.website ?? ''),
  }
  const providedUrl = String(lead.maps_url ?? lead.maps ?? '')
  let sourceUrl = null
  try {
    const parsed = new URL(providedUrl)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') sourceUrl = parsed.toString()
  } catch {}
  if (!sourceUrl && sourceKind === 'google_places') {
    sourceUrl = `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(googlePlaceId)}`
  }
  const sourceFingerprint = createHash('sha256')
    .update(JSON.stringify([sourceKind, googlePlaceId, claimValue]))
    .digest('hex')

  return {
    restaurant_id: restaurantId,
    source_fingerprint: sourceFingerprint,
    source_kind: sourceKind,
    source_name: sourceKind === 'google_places' ? 'Google Places' : 'Legacy local storage snapshot',
    source_url: sourceUrl,
    evidence_type: 'restaurant_listing_snapshot',
    claim_key: 'google_place_listing',
    claim_value: claimValue,
    claim_status: claimStatus,
    confidence: claimStatus === 'fact' ? 'high' : null,
  }
}

export const LIFECYCLE_STATUSES = Object.freeze([
  'NEW', 'RESEARCHING', 'QUALIFIED', 'REVIEW', 'REJECTED', 'CONTACTED', 'INTERESTED', 'ONBOARDED',
])

export const RESEARCH_STATUSES = Object.freeze(['pending', 'researching', 'complete', 'partial', 'failed'])

const LEGACY_STAGE_MAP = Object.freeze({
  new: 'NEW', contacted: 'CONTACTED', replied: 'INTERESTED', interested: 'INTERESTED',
  meeting: 'INTERESTED', onboarded: 'ONBOARDED', rejected: 'REJECTED',
  researching: 'RESEARCHING', qualified: 'QUALIFIED', review: 'REVIEW',
})

export function normalizeLifecycle(value) {
  const normalized = String(value ?? '').trim().toUpperCase()
  return LIFECYCLE_STATUSES.includes(normalized) ? normalized : 'REVIEW'
}

export function lifecycleFromLegacyStage(value) {
  return LEGACY_STAGE_MAP[String(value ?? '').trim().toLowerCase()] ?? 'NEW'
}

export function researchStatusFromLead(lead = {}) {
  if (lead.researchStatus && RESEARCH_STATUSES.includes(lead.researchStatus)) return lead.researchStatus
  if (lead.researchError) return 'failed'
  if (lead.researching) return 'researching'
  if (lead.researched) return 'complete'
  return 'pending'
}

export function lifecycleFromResearch(lead = {}) {
  const fit = String(lead.fitStatus ?? '').toUpperCase()
  if (fit === 'REJECT' || lead.tooBigForCravoe || lead.automaticReject) return 'REJECTED'
  if (fit === 'STRONG_FIT' || fit === 'POSSIBLE_FIT') return 'QUALIFIED'
  return 'REVIEW'
}

export function transitionLifecycle({ current, next, restoreTo, rejectionReason }) {
  const previous = normalizeLifecycle(current)
  const requestedRestore = String(restoreTo ?? '').toUpperCase()
  const status = restoreTo
    ? previous === 'REJECTED' && LIFECYCLE_STATUSES.includes(requestedRestore) && requestedRestore !== 'REJECTED'
      ? requestedRestore
      : previous === 'REJECTED' ? 'REVIEW' : previous
    : normalizeLifecycle(next)

  if (status === 'REJECTED') {
    const reason = String(rejectionReason ?? '').trim()
    if (!reason) throw new Error('A rejection reason is required')
    return { status, rejectionReason: reason }
  }
  return { status, rejectionReason: null }
}

export function legacyLeadToRestaurant(lead = {}, crm = {}, feedback = {}) {
  const legacyId = String(lead.id ?? lead.google_place_id ?? '').trim()
  const stage = crm.stage ?? (feedback.reason ? 'Rejected' : lead.status ?? 'New')
  const lifecycle = feedback.reason || String(stage).toLowerCase() === 'rejected'
    ? 'REJECTED' : lifecycleFromLegacyStage(stage)
  const rejectionReason = lifecycle === 'REJECTED'
    ? String(feedback.reason ?? '').trim() || 'Legacy rejection — reason not recorded' : null
  return {
    google_place_id: legacyId.startsWith('demo-') ? null : legacyId || null,
    external_legacy_id: legacyId || null,
    name: String(lead.name ?? feedback.name ?? '').trim() || 'Imported restaurant (name unavailable)',
    address: String(lead.address ?? '').trim() || null,
    area: String(lead.area ?? feedback.area ?? '').trim() || null,
    cuisine: String(lead.cuisine ?? feedback.cuisine ?? '').trim() || null,
    rating: Number.isFinite(Number(lead.rating)) ? Number(lead.rating) : null,
    review_count: Number.isFinite(Number(lead.reviews)) ? Number(lead.reviews) : null,
    phone: String(lead.phone ?? '').trim() || null,
    website: String(lead.website ?? '').trim() || null,
    maps_url: String(lead.maps ?? '').trim() || null,
    score: Number.isFinite(Number(lead.score)) ? Number(lead.score) : null,
    lifecycle_status: lifecycle,
    research_status: researchStatusFromLead(lead),
    contact_state: lifecycle === 'ONBOARDED' ? 'onboarded'
      : lifecycle === 'INTERESTED' ? 'interested'
        : lifecycle === 'CONTACTED' ? 'contacted' : 'not_contacted',
    rejection_reason: rejectionReason,
    legacy_stage: String(stage ?? 'New'),
    legacy_snapshot: lead,
    crm_note: String(crm.note ?? '').trim(),
    follow_up_at: String(crm.followUp ?? '').trim() || null,
  }
}

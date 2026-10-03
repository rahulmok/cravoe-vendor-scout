import { lifecycleFromLegacyStage, researchStatusFromLead } from './lead-state.js'

export function legacyLeadToRestaurant(lead = {}, crm = {}, feedback = {}) {
  const legacyId = String(lead.id ?? lead.google_place_id ?? '').trim()
  const stage = crm.stage ?? (feedback.reason ? 'Rejected' : lead.status ?? 'New')
  const lifecycle = feedback.reason || String(stage).toLowerCase() === 'rejected'
    ? 'REJECTED' : lifecycleFromLegacyStage(stage)
  const rejectionReason = lifecycle === 'REJECTED'
    ? String(feedback.reason ?? '').trim() || 'Legacy rejection — reason not recorded' : null
  const numeric = value => value === undefined || value === null || value === '' || !Number.isFinite(Number(value))
    ? null : Number(value)

  return {
    google_place_id: legacyId.startsWith('demo-') ? null : legacyId || null,
    external_legacy_id: legacyId || null,
    name: String(lead.name ?? feedback.name ?? '').trim() || 'Imported restaurant (name unavailable)',
    address: String(lead.address ?? '').trim() || null,
    area: String(lead.area ?? feedback.area ?? '').trim() || null,
    cuisine: String(lead.cuisine ?? feedback.cuisine ?? '').trim() || null,
    rating: numeric(lead.rating),
    review_count: numeric(lead.reviews),
    phone: String(lead.phone ?? '').trim() || null,
    website: String(lead.website ?? '').trim() || null,
    maps_url: String(lead.maps ?? '').trim() || null,
    score: numeric(lead.score),
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

export function prepareLocalStorageImport(localState = {}) {
  const warnings = []
  const parse = key => {
    const raw = localState[key]
    if (raw === undefined || raw === null || raw === '') return null
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw }
    catch { warnings.push(`${key} could not be parsed and was left untouched`); return null }
  }

  const saved = parse('cravoe-scout-saved')
  const rejected = parse('cravoe-scout-rejected')
  const crm = parse('cravoe-scout-crm')
  const feedback = parse('cravoe-scout-reject-feedback')
  const savedRows = Array.isArray(saved) ? saved : []
  const rejectedIds = Array.isArray(rejected) ? rejected.map(String) : []
  const crmRows = crm && typeof crm === 'object' && !Array.isArray(crm) ? crm : {}
  const feedbackRows = feedback && typeof feedback === 'object' && !Array.isArray(feedback) ? feedback : {}
  const leads = new Map()
  const unresolved = []

  for (const row of savedRows) {
    if (row && typeof row === 'object' && row.id) leads.set(String(row.id), row)
  }
  for (const id of rejectedIds) {
    if (!leads.has(id) && feedbackRows[id]?.snapshot) leads.set(id, feedbackRows[id].snapshot)
    if (!leads.has(id) && feedbackRows[id]?.name) {
      leads.set(id, { id, name: feedbackRows[id].name, cuisine: feedbackRows[id].cuisine, area: feedbackRows[id].area })
    }
    if (!leads.has(id)) unresolved.push({ source_key: 'cravoe-scout-rejected', legacy_id: id, payload: id })
  }
  for (const [id, row] of Object.entries(crmRows)) {
    if (!leads.has(id)) unresolved.push({ source_key: 'cravoe-scout-crm', legacy_id: id, payload: row })
  }

  const savedIds = new Set(savedRows.filter(row => row && row.id).map(row => String(row.id)))
  const restaurants = [...leads.entries()].map(([id, lead]) => ({
    ...legacyLeadToRestaurant({ ...lead, id }, crmRows[id] ?? {}, feedbackRows[id] ?? {}),
    shortlisted: savedIds.has(id),
  }))
  return {
    restaurants,
    unresolved,
    warnings,
    rawState: Object.fromEntries([
      'cravoe-scout-saved', 'cravoe-scout-rejected', 'cravoe-scout-crm', 'cravoe-scout-reject-feedback',
    ].filter(key => Object.hasOwn(localState, key)).map(key => [key, localState[key]])),
  }
}

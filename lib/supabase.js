import { LIFECYCLE_STATUSES, RESEARCH_STATUSES } from './lead-state.js'
import { normalizeBrandName } from './validation.js'
import { placeListingEvidenceRows } from './evidence.js'

export class SupabaseUnavailableError extends Error {
  constructor() {
    super('Persistence service unavailable')
    this.name = 'SupabaseUnavailableError'
    this.status = 503
  }
}

function getConfig() {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key || !/^https:\/\//i.test(url)) throw new SupabaseUnavailableError()
  return { url: url.replace(/\/$/, ''), key }
}

function endpoint(path, query = {}) {
  const { url } = getConfig()
  const target = new URL(`/rest/v1/${path}`, url)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) target.searchParams.set(key, String(value))
  }
  return target
}

export async function supabaseRequest(path, { method = 'GET', query, body, prefer, headers = {} } = {}) {
  const { key } = getConfig()
  let response
  try {
    response = await fetch(endpoint(path, query), {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    })
  } catch {
    throw new SupabaseUnavailableError()
  }
  if (!response.ok) {
    const error = new Error(`Supabase request failed (${response.status})`)
    error.status = response.status
    throw error
  }
  if (response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

export async function consumeRateLimit({ actor = 'owner', scope, limit, windowSeconds }) {
  const result = await supabaseRequest('rpc/vendor_scout_consume_api_rate_limit', {
    method: 'POST',
    body: { p_actor: actor, p_scope: scope, p_limit: limit, p_window_seconds: windowSeconds },
  })
  return result === true || result?.allowed === true || result?.[0]?.allowed === true
}

export async function recordStatusTransition({ placeId, status, reason = null, actor = 'owner', manual = true, restore = false }) {
  return supabaseRequest('rpc/vendor_scout_transition_restaurant_status', {
    method: 'POST',
    body: {
      p_google_place_id: placeId,
      p_new_status: status,
      p_rejection_reason: reason,
      p_actor: actor,
      p_manual: manual,
      p_restore: restore,
    },
  })
}

export async function updateRestaurantCrm({ placeId, status = null, rejectionReason = null, restore = false, note, noteProvided = false, followUp, followUpProvided = false, shortlisted = null }) {
  return supabaseRequest('rpc/vendor_scout_update_restaurant_crm', {
    method: 'POST',
    body: {
      p_google_place_id: placeId,
      p_new_status: status,
      p_rejection_reason: rejectionReason,
      p_restore: restore,
      p_note: note ?? null,
      p_note_provided: noteProvided,
      p_follow_up: followUp ?? null,
      p_follow_up_provided: followUpProvided,
      p_shortlisted: shortlisted,
      p_actor: 'owner',
    },
  })
}

export async function startResearchRun({ placeId, provider = 'Vertex Gemini + Google Search', actor = 'owner' }) {
  const result = await supabaseRequest('rpc/vendor_scout_start_restaurant_research', {
    method: 'POST',
    body: { p_google_place_id: placeId, p_provider: provider, p_actor: actor },
  })
  return Array.isArray(result) ? result[0] : result
}

export async function finishResearchRun({ runId, placeId, status, result = {}, errorCode = null, actor = 'owner' }) {
  if (!RESEARCH_STATUSES.includes(status)) throw new Error('Invalid research state')
  return supabaseRequest('rpc/vendor_scout_finish_restaurant_research', {
    method: 'POST',
    body: { p_run_id: runId, p_google_place_id: placeId, p_status: status, p_result: result, p_error_code: errorCode, p_actor: actor },
  })
}

export function validateLifecycle(value) {
  return LIFECYCLE_STATUSES.includes(String(value ?? '').toUpperCase())
}

export function validateResearchStatus(value) {
  return RESEARCH_STATUSES.includes(String(value ?? '').toLowerCase())
}

export function safeProviderError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? 0)
  if (status === 429) return 'The research provider is busy. Try again later.'
  if (status === 401 || status === 403) return 'The research provider is not configured correctly.'
  return 'The external provider is temporarily unavailable.'
}

function inFilter(values) {
  const quote = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  return `in.(${values.map(quote).join(',')})`
}

async function ensureBrandsForRows(rows) {
  const brandByName = new Map()
  for (const row of rows) {
    const name = String(row.name || '').trim()
    if (!name || name === 'Imported restaurant (name unavailable)') continue
    const normalized = normalizeBrandName(name)
    if (normalized && !brandByName.has(normalized)) {
      brandByName.set(normalized, { normalized_name: normalized, canonical_name: name })
    }
  }
  const brands = [...brandByName.values()]
  if (!brands.length) return rows
  await supabaseRequest('vendor_scout_brands', {
    method: 'POST', query: { on_conflict: 'normalized_name' }, body: brands,
    prefer: 'resolution=merge-duplicates,return=minimal',
  })
  const names = brands.map(brand => brand.normalized_name)
  const stored = await supabaseRequest('vendor_scout_brands', {
    query: { select: 'id,normalized_name', normalized_name: inFilter(names) },
  })
  const idByName = new Map(stored.map(brand => [brand.normalized_name, brand.id]))
  if (idByName.size !== names.length) throw new Error('Brand persistence incomplete')
  const brandAliases = brands.map(brand => ({
    brand_id: idByName.get(brand.normalized_name),
    alias: brand.canonical_name,
    normalized_alias: brand.normalized_name,
    source: 'restaurant_name',
  }))
  await supabaseRequest('vendor_scout_restaurant_aliases', {
    method: 'POST', query: { on_conflict: 'brand_id,normalized_alias' }, body: brandAliases,
    prefer: 'resolution=ignore-duplicates,return=minimal',
  })
  return rows.map(row => ({ ...row, brand_id: idByName.get(normalizeBrandName(String(row.name || '').trim())) ?? null }))
}

async function persistEvidenceRows(rows) {
  if (!rows.length) return
  await supabaseRequest('vendor_scout_restaurant_evidence', {
    method: 'POST',
    query: { on_conflict: 'restaurant_id,source_fingerprint' },
    body: rows,
    prefer: 'resolution=ignore-duplicates,return=minimal',
  })
}

async function persistRestaurantAliases(sourceRows, storedRows, source) {
  const sourceById = new Map(sourceRows.map(row => [row.google_place_id || row.external_legacy_id, row]))
  const aliases = storedRows.flatMap(row => {
    const sourceRow = sourceById.get(row.google_place_id || row.external_legacy_id)
    const normalized = normalizeBrandName(sourceRow?.name || '')
    return normalized ? [{
      restaurant_id: row.id,
      alias: String(sourceRow.name),
      normalized_alias: normalized,
      source,
    }] : []
  })
  if (!aliases.length) return
  await supabaseRequest('vendor_scout_restaurant_aliases', {
    method: 'POST', query: { on_conflict: 'restaurant_id,normalized_alias' }, body: aliases,
    prefer: 'resolution=ignore-duplicates,return=minimal',
  })
}

export async function upsertDiscoveredRestaurants(rows) {
  if (!rows.length) return []
  const brandedRows = await ensureBrandsForRows(rows)
  const stored = await supabaseRequest('vendor_scout_restaurants', {
    method: 'POST', query: { on_conflict: 'google_place_id', select: 'id,google_place_id,external_legacy_id,name' },
    body: brandedRows, prefer: 'resolution=merge-duplicates,return=representation',
  })
  await persistRestaurantAliases(brandedRows, stored || [], 'google_places')
  await persistEvidenceRows(placeListingEvidenceRows(stored || [], brandedRows, {
    sourceKind: 'google_places',
    claimStatus: 'fact',
  }))
  return stored
}

export async function listRestaurants(view = 'active', limit = 200) {
  const query = {
    select: 'id,google_place_id,external_legacy_id,name,address,area,cuisine,rating,review_count,phone,website,maps_url,score,shortlisted,lifecycle_status,research_status,rejection_reason,contact_state,follow_up_at,updated_at,vendor_scout_restaurant_notes(note_key,content)',
    order: 'updated_at.desc',
    limit: Math.max(1, Math.min(200, Number(limit) || 200)),
    lifecycle_status: view === 'rejected' ? 'eq.REJECTED' : 'neq.REJECTED',
  }
  return supabaseRequest('vendor_scout_restaurants', { query })
}

export async function updateRestaurant(placeId, patch) {
  return supabaseRequest('vendor_scout_restaurants', {
    method: 'PATCH',
    query: { google_place_id: `eq.${placeId}` },
    body: patch,
    prefer: 'return=representation',
  })
}

export async function upsertRestaurantNote(restaurantId, content) {
  if (!String(content ?? '').trim()) return []
  return supabaseRequest('vendor_scout_restaurant_notes', {
    method: 'POST',
    query: { on_conflict: 'restaurant_id,note_key' },
    body: { restaurant_id: restaurantId, note_key: 'primary', content: String(content).slice(0, 4000), author: 'owner' },
    prefer: 'resolution=merge-duplicates,return=representation',
  })
}

export async function upsertOutreachEvent({ restaurantId, state, note = null, followUpAt = null }) {
  return supabaseRequest('vendor_scout_outreach_events', {
    method: 'POST',
    body: { restaurant_id: restaurantId, state, note, follow_up_at: followUpAt, actor: 'owner' },
    prefer: 'return=minimal',
  })
}

export async function getRestaurantByPlaceId(placeId) {
  const rows = await supabaseRequest('vendor_scout_restaurants', {
    query: { select: 'id,google_place_id,lifecycle_status,research_status', google_place_id: `eq.${placeId}`, limit: 1 },
  })
  return rows?.[0] ?? null
}

export async function deleteRestaurantNote(restaurantId) {
  return supabaseRequest('vendor_scout_restaurant_notes', {
    method: 'DELETE', query: { restaurant_id: `eq.${restaurantId}`, note_key: 'eq.primary' }, prefer: 'return=minimal',
  })
}

export async function createMigrationBatch({ fingerprint, rawPayload, summary }) {
  const created = await supabaseRequest('vendor_scout_migration_imports', {
    method: 'POST', query: { on_conflict: 'fingerprint' },
    body: { fingerprint, raw_payload: rawPayload, summary },
    prefer: 'resolution=ignore-duplicates,return=representation',
  })
  if (created?.[0]) return created[0]
  const existing = await supabaseRequest('vendor_scout_migration_imports', {
    query: { select: 'id,fingerprint,summary', fingerprint: `eq.${fingerprint}`, limit: 1 },
  })
  return existing?.[0] ?? null
}

export async function updateMigrationBatch(id, summary) {
  return supabaseRequest('vendor_scout_migration_imports', {
    method: 'PATCH', query: { id: `eq.${id}` }, body: { summary }, prefer: 'return=minimal',
  })
}

export async function upsertImportedRestaurants(rows) {
  const noteByKey = new Map(rows.map(row => [row.google_place_id ?? row.external_legacy_id, row.crm_note]))
  const safeRows = rows.map(({ crm_note, legacy_stage, legacy_snapshot, ...row }) => ({
    ...row,
    follow_up_at: /^\d{4}-\d{2}-\d{2}$/.test(String(row.follow_up_at ?? '')) ? row.follow_up_at : null,
    metadata: { ...(row.metadata ?? {}), imported_from_local_storage: true, legacy_stage, legacy_snapshot },
  }))
  const brandedRows = await ensureBrandsForRows(safeRows)
  const placed = brandedRows.filter(row => row.google_place_id)
  const legacy = brandedRows.filter(row => !row.google_place_id && row.external_legacy_id)
  for (const [subset, conflict] of [[placed, 'google_place_id'], [legacy, 'external_legacy_id']]) {
    if (subset.length) await supabaseRequest('vendor_scout_restaurants', {
      method: 'POST', query: { on_conflict: conflict }, body: subset,
      prefer: 'resolution=ignore-duplicates,return=minimal',
    })
  }
  const found = []
  for (const [subset, key] of [[placed, 'google_place_id'], [legacy, 'external_legacy_id']]) {
    const ids = [...new Set(subset.map(row => row[key]).filter(Boolean))]
    for (let index = 0; index < ids.length; index += 40) {
      const group = ids.slice(index, index + 40)
      found.push(...await supabaseRequest('vendor_scout_restaurants', {
        query: { select: 'id,google_place_id,external_legacy_id,name', [key]: inFilter(group) },
      }))
    }
  }
  await persistRestaurantAliases(brandedRows, found, 'browser_local_storage')
  await persistEvidenceRows(placeListingEvidenceRows(found, brandedRows, {
    sourceKind: 'legacy_local_storage',
    claimStatus: 'unknown',
  }))
  const notes = found.flatMap(row => {
    const content = noteByKey.get(row.google_place_id ?? row.external_legacy_id)
    return content ? [{ restaurant_id: row.id, note_key: 'primary', content: String(content).slice(0, 4000), author: 'owner' }] : []
  })
  if (notes.length) await supabaseRequest('vendor_scout_restaurant_notes', {
    method: 'POST', query: { on_conflict: 'restaurant_id,note_key' }, body: notes,
    prefer: 'resolution=ignore-duplicates,return=minimal',
  })
  return found
}

export async function insertLegacyImportRows(importId, rows, restaurantByLegacyId = new Map()) {
  if (!rows.length) return []
  const body = rows.map(row => ({
    import_id: importId, restaurant_id: restaurantByLegacyId.get(row.legacy_id) ?? null,
    source_key: row.source_key, legacy_id: row.legacy_id, payload: row.payload,
    resolution_status: restaurantByLegacyId.has(row.legacy_id) ? 'imported' : 'unresolved',
  }))
  return supabaseRequest('vendor_scout_legacy_import_rows', {
    method: 'POST', query: { on_conflict: 'import_id,source_key,legacy_id' }, body,
    prefer: 'resolution=ignore-duplicates,return=minimal',
  })
}

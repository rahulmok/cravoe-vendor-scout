import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { guardApi } from '../../../../lib/api-guard.js'
import { isRecord, readJson, safeErrorMessage } from '../../../../lib/http.js'
import { prepareLocalStorageImport } from '../../../../lib/local-migration.js'
import {
  createMigrationBatch,
  insertLegacyImportRows,
  updateMigrationBatch,
  upsertImportedRestaurants,
} from '../../../../lib/supabase.js'

const STORAGE_KEYS = [
  'cravoe-scout-saved', 'cravoe-scout-rejected', 'cravoe-scout-crm', 'cravoe-scout-reject-feedback',
]

export async function POST(request) {
  const denied = await guardApi(request, { scope: 'local-import', perMinute: 2, perDay: 5 })
  if (denied) return denied
  try {
    const body = await readJson(request, 1024 * 1024)
    if (!isRecord(body) || !isRecord(body.localState)) return NextResponse.json({ error: 'Local browser state is required.' }, { status: 400 })
    const localState = Object.fromEntries(STORAGE_KEYS
      .filter(key => Object.hasOwn(body.localState, key))
      .map(key => [key, body.localState[key]]))
    if (!Object.keys(localState).length) return NextResponse.json({ error: 'No supported Vendor Scout data was found.' }, { status: 400 })
    if (Object.values(localState).some(value => typeof value === 'string' && value.length > 400_000)) {
      return NextResponse.json({ error: 'A local data item is too large to import.' }, { status: 413 })
    }

    const fingerprint = createHash('sha256')
      .update(JSON.stringify(Object.entries(localState).sort(([a], [b]) => a.localeCompare(b))))
      .digest('hex')
    const plan = prepareLocalStorageImport(localState)
    const batch = await createMigrationBatch({
      fingerprint,
      rawPayload: localState,
      summary: { status: 'importing', restaurants: plan.restaurants.length, unresolved: plan.unresolved.length },
    })
    if (!batch?.id) return NextResponse.json({ error: 'Migration batch could not be recorded.' }, { status: 500 })

    const found = await upsertImportedRestaurants(plan.restaurants)
    const restaurantByLegacyId = new Map()
    for (const row of found) {
      if (row.external_legacy_id) restaurantByLegacyId.set(row.external_legacy_id, row.id)
      if (row.google_place_id) restaurantByLegacyId.set(row.google_place_id, row.id)
    }
    await insertLegacyImportRows(batch.id, plan.unresolved, restaurantByLegacyId)
    const summary = {
      status: 'complete',
      restaurants: found.length,
      unresolved: plan.unresolved.length,
      warnings: plan.warnings,
    }
    await updateMigrationBatch(batch.id, summary)
    return NextResponse.json({ ok: true, importId: batch.id, ...summary })
  } catch (error) {
    const status = Number(error?.status) || 500
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: status >= 400 && status <= 599 ? status : 500 })
  }
}

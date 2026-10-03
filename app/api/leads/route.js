import { NextResponse } from 'next/server'
import { guardApi } from '../../../lib/api-guard.js'
import { isRecord, readJson, safeErrorMessage } from '../../../lib/http.js'
import { LIFECYCLE_STATUSES } from '../../../lib/lead-state.js'
import { getRestaurantByPlaceId, listRestaurants, updateRestaurantCrm } from '../../../lib/supabase.js'

function toClientLead(row) {
  const lifecycleStatus = row.lifecycle_status
  return {
    id: row.google_place_id || row.external_legacy_id,
    name: row.name,
    address: row.address || '',
    area: row.area || '',
    cuisine: row.cuisine || '',
    rating: Number(row.rating || 0),
    reviews: Number(row.review_count || 0),
    phone: row.phone || '',
    website: row.website || '',
    maps: row.maps_url || '',
    score: Number(row.score || 0),
    lifecycleStatus,
    researchStatus: row.research_status,
    rejectionReason: row.rejection_reason,
    contactState: row.contact_state,
    followUp: row.follow_up_at || '',
    shortlisted: Boolean(row.shortlisted),
    note: row.restaurant_notes?.find(note => note.note_key === 'primary')?.content || '',
    researched: ['complete', 'partial'].includes(row.research_status),
    fitStatus: lifecycleStatus === 'REJECTED' ? 'REJECT'
      : lifecycleStatus === 'QUALIFIED' ? 'POSSIBLE_FIT' : 'REVIEW',
  }
}

export async function GET(request) {
  const denied = await guardApi(request, { scope: 'leads-read', perMinute: 60, perDay: 1000 })
  if (denied) return denied
  try {
    const view = new URL(request.url).searchParams.get('view') || 'active'
    if (!['active', 'rejected'].includes(view)) return NextResponse.json({ error: 'Invalid lead view.' }, { status: 400 })
    const rows = await listRestaurants(view, 200)
    return NextResponse.json({ leads: rows.map(toClientLead) })
  } catch (error) {
    const status = Number(error?.status) || 500
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: status >= 400 && status <= 599 ? status : 500 })
  }
}

export async function PATCH(request) {
  const denied = await guardApi(request, { scope: 'lead-update', perMinute: 60, perDay: 1000 })
  if (denied) return denied
  try {
    const body = await readJson(request, 12 * 1024)
    if (!isRecord(body) || typeof body.placeId !== 'string' || body.placeId.length < 1 || body.placeId.length > 256) {
      return NextResponse.json({ error: 'A valid listing ID is required.' }, { status: 400 })
    }
    const placeId = body.placeId
    const restoring = body.restore === true
    if (restoring && body.lifecycleStatus !== undefined) return NextResponse.json({ error: 'Restore and status override cannot be combined.' }, { status: 400 })
    const status = body.lifecycleStatus === undefined ? null : String(body.lifecycleStatus).toUpperCase()
    if (status !== null && !LIFECYCLE_STATUSES.includes(status)) return NextResponse.json({ error: 'Invalid lifecycle status.' }, { status: 400 })
    if (Object.hasOwn(body, 'rejectionReason') && typeof body.rejectionReason !== 'string') return NextResponse.json({ error: 'Rejection reason must be text.' }, { status: 400 })
    const reason = typeof body.rejectionReason === 'string' ? body.rejectionReason.trim() : null
    if (status === 'REJECTED' && (!reason || reason.length > 500)) {
      return NextResponse.json({ error: 'A rejection reason of 1–500 characters is required.' }, { status: 400 })
    }
    if (Object.hasOwn(body, 'note') && (typeof body.note !== 'string' || body.note.length > 4000)) {
      return NextResponse.json({ error: 'Note must be 4,000 characters or fewer.' }, { status: 400 })
    }
    let followUp = null
    if (Object.hasOwn(body, 'followUp')) {
      followUp = body.followUp === '' || body.followUp === null ? null : String(body.followUp)
      if (followUp) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(followUp)
        const parsed = match && new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
        if (!parsed || parsed.getUTCFullYear() !== Number(match[1]) || parsed.getUTCMonth() + 1 !== Number(match[2]) || parsed.getUTCDate() !== Number(match[3])) {
          return NextResponse.json({ error: 'Follow-up date must be a valid YYYY-MM-DD date.' }, { status: 400 })
        }
      }
    }
    if (Object.hasOwn(body, 'shortlisted') && typeof body.shortlisted !== 'boolean') return NextResponse.json({ error: 'Shortlist state must be boolean.' }, { status: 400 })
    if (!restoring && status === null && !Object.hasOwn(body, 'note') && !Object.hasOwn(body, 'followUp') && !Object.hasOwn(body, 'shortlisted')) {
      return NextResponse.json({ error: 'No supported lead changes were provided.' }, { status: 400 })
    }

    const restaurant = await getRestaurantByPlaceId(placeId)
    if (!restaurant) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    const result = await updateRestaurantCrm({
      placeId, status, rejectionReason: reason, restore: restoring,
      note: body.note, noteProvided: Object.hasOwn(body, 'note'),
      followUp, followUpProvided: Object.hasOwn(body, 'followUp'),
      shortlisted: Object.hasOwn(body, 'shortlisted') ? body.shortlisted : null,
    })
    return NextResponse.json({ ok: true, lifecycleStatus: result?.lifecycle_status || restaurant.lifecycle_status, shortlisted: result?.shortlisted })
  } catch (error) {
    const status = Number(error?.status) || 500
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: status >= 400 && status <= 599 ? status : 500 })
  }
}

function invalid() {
  throw Object.assign(new Error('Invalid research lead'), { status: 400 })
}

function boundedString(value, max, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) invalid()
    return ''
  }
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid()
  if (required && value.trim().length < 2) invalid()
  return value
}

function boundedNumber(value, min, max, { integer = false } = {}) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid()
  return value
}

export function normalizeBrandName(value) {
  if (typeof value !== 'string') return ''
  const latinName = /^[\p{Script=Latin}\p{M}\p{N}\p{P}\p{Z}]*$/u.test(value)
  const folded = latinName ? value.normalize('NFKD').replace(/\p{M}/gu, '') : value
  return folded.toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function normalizeResearchLead(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  const id = boundedString(value.id, 256, { required: true })
  if (!id.trim()) invalid()
  const name = boundedString(value.name, 180, { required: true })
  const address = boundedString(value.address, 400)
  const area = boundedString(value.area, 120)
  const cuisine = boundedString(value.cuisine, 120)
  const website = boundedString(value.website, 2048)
  if (website && !/^https?:\/\//i.test(website)) invalid()

  let brandOutlets = []
  if (value.brandOutlets !== undefined && value.brandOutlets !== null) {
    if (!Array.isArray(value.brandOutlets) || value.brandOutlets.length > 20) invalid()
    brandOutlets = value.brandOutlets.map(outlet => {
      if (!outlet || typeof outlet !== 'object' || Array.isArray(outlet)) invalid()
      return {
        name: boundedString(outlet.name, 180),
        address: boundedString(outlet.address, 400),
      }
    })
  }

  return {
    id,
    name,
    address,
    area,
    cuisine,
    website,
    rating: boundedNumber(value.rating, 0, 5),
    reviews: boundedNumber(value.reviews, 0, 100_000_000, { integer: true }),
    score: boundedNumber(value.score, 0, 100, { integer: true }),
    brandOutletCount: boundedNumber(value.brandOutletCount, 0, 1000, { integer: true }) ?? 0,
    brandOutlets,
  }
}

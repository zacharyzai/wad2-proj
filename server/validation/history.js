// Validate confirmed contract JSON, not raw AI output. Do not normalize bill cents as dollars.
import { BILL_CATEGORIES, BILL_PLACES, DOSE_UNITS, FREQUENCY_TYPES, SUBSIDY_SCHEMES, TIMINGS, WITH_FOOD } from '../services/normalizeScan.js'

const fail = (field) => { throw new Error(`Invalid confirmed scan: ${field}`) }
function object(value, keys, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((k) => !keys.includes(k))) fail(field)
}
function text(value, field, required = false) {
  if (value == null && !required) return null
  if (typeof value !== 'string' || !value.trim() || value.length > 2000 || /data:image\//i.test(value)) fail(field)
  return value.trim()
}
function choice(value, values, field, optional = false) {
  if (value == null && optional) return null
  if (!values.includes(value)) fail(field)
  return value
}
function list(value, field, max, min = 0) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(field)
  return value
}
function money(value, field) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1e12) fail(field)
  return value
}

export function checkConfirmedScan(body) {
  try {
    object(body, ['scan'], 'body must contain only scan')
    const s = body.scan
    object(s, ['type', 'source', 'unclear', 'medication', 'bill'], 'scan fields (photos and personal fields are not accepted)')
    if (Buffer.byteLength(JSON.stringify(s)) > 64 * 1024) fail('scan exceeds 64 KiB')
    const type = choice(s.type, ['medication', 'bill'], 'type')
    const source = choice(s.source, ['sample', 'mock', 'ai'], 'source')
    // Confirm clears resolved flags before sending. Saving cannot silently mark unresolved data as checked.
    list(s.unclear, 'unclear must be an empty array', 0)
    if (type === 'medication') {
      if (s.bill !== undefined) fail('bill on a medication scan')
      const m = s.medication
      object(m, ['name', 'strength', 'doseAmount', 'doseUnit', 'timesPerDay', 'timing', 'withFood', 'frequencyType', 'rawInstruction', 'warnings'], 'medication fields')
      if (typeof m.doseAmount !== 'number' || !Number.isFinite(m.doseAmount) || m.doseAmount <= 0 || m.doseAmount > 100) fail('doseAmount')
      const frequencyType = choice(m.frequencyType, FREQUENCY_TYPES, 'frequencyType')
      const times = m.timesPerDay ?? null
      if ((times !== null || frequencyType === 'daily') && (!Number.isInteger(times) || times < 1 || times > 6)) fail('timesPerDay')
      const timing = m.timing == null ? null : list(m.timing, 'timing', TIMINGS.length).map((t) => choice(t, TIMINGS, 'timing'))
      if (timing && new Set(timing).size !== timing.length) fail('duplicate timing')
      if (frequencyType === 'daily' && timing?.length && timing.length !== times) fail('timing count must match timesPerDay')
      return { scan: { type, source, medication: {
        name: text(m.name, 'name', true), strength: text(m.strength, 'strength'), doseAmount: m.doseAmount,
        doseUnit: choice(m.doseUnit, DOSE_UNITS, 'doseUnit', true), timesPerDay: times, timing,
        withFood: choice(m.withFood, WITH_FOOD, 'withFood', true), frequencyType,
        rawInstruction: text(m.rawInstruction, 'rawInstruction'),
        warnings: list(m.warnings, 'warnings', 50).map((w) => text(w, 'warning', true)),
      } } }
    }
    if (s.medication !== undefined) fail('medication on a bill scan')
    const b = s.bill
    object(b, ['clinic', 'place', 'visitDate', 'items', 'subsidies', 'medisaveCents', 'totalPayableCents'], 'bill fields')
    const visitDate = b.visitDate ?? null
    if (visitDate !== null && (typeof visitDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate) || !Number.isFinite(Date.parse(visitDate)) || new Date(visitDate).toISOString().slice(0, 10) !== visitDate)) fail('visitDate')
    const items = list(b.items, 'items', 100, 1).map((i) => {
      object(i, ['description', 'category', 'amountCents'], 'item fields')
      return { description: text(i.description, 'description', true), category: choice(i.category, BILL_CATEGORIES, 'category'), amountCents: money(i.amountCents, 'amountCents') }
    })
    const subsidies = list(b.subsidies, 'subsidies', 100).map((s) => {
      object(s, ['scheme', 'amountCents', 'includedInItems'], 'subsidy fields')
      if (s.includedInItems !== undefined && typeof s.includedInItems !== 'boolean') fail('includedInItems')
      return { scheme: choice(s.scheme, SUBSIDY_SCHEMES, 'scheme'), amountCents: money(s.amountCents, 'subsidy amountCents'), includedInItems: s.includedInItems ?? false }
    })
    const medisaveCents = money(b.medisaveCents, 'medisaveCents')
    const totalPayableCents = money(b.totalPayableCents, 'totalPayableCents')
    const sum = (xs) => xs.reduce((t, x) => t + x.amountCents, 0)
    if (sum(items) - sum(subsidies.filter((s) => !s.includedInItems)) - medisaveCents !== totalPayableCents) fail('bill totals do not balance')
    return { scan: { type, source, bill: { clinic: text(b.clinic, 'clinic'), place: choice(b.place, BILL_PLACES, 'place', true), visitDate, items, subsidies, medisaveCents, totalPayableCents } } }
  } catch (error) {
    return { error: error.message }
  }
}

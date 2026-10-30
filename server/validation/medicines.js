// The medicine list saved to an account (PUT /api/schedule, src/stores/medicines.js shape). Checked field by field, so only
// contract fields, sizes and our own enums are stored: never a photo or anything else a client adds.
// Lenient where Confirm is: a medicine typed in Ask has only a name and instructions.
import { DOSE_UNITS, FREQUENCY_TYPES, TIMINGS, WITH_FOOD } from '../services/normalizeScan.js'
import { validDate, validDays, validTime } from '../../src/rules/schedule.js'

export const MAX_MEDICINES = 10 // same limit as src/stores/medicines.js
const MED_KEYS = ['name', 'strength', 'doseAmount', 'doseUnit', 'quantity', 'timesPerDay', 'timing', 'withFood', 'frequencyType', 'rawInstruction', 'warnings']

const fail = (field) => { throw new Error(`Invalid medicine: ${field}`) }
const plain = (value, keys, field) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((k) => !keys.includes(k))) fail(field)
  return value
}
const text = (value, field, max = 2000) => {
  if (value == null) return null
  if (typeof value !== 'string' || !value.trim() || value.length > max || /data:image\//i.test(value)) fail(field)
  return value.trim()
}
const number = (value, field, max, integer = false) => {
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max || (integer && !Number.isInteger(value))) fail(field)
  return value
}
const choice = (value, values, field) => (value == null ? null : values.includes(value) ? value : fail(field))

function checkMedicine(raw) {
  plain(raw, ['id', 'source', 'sample', 'medication', 'schedule'], 'fields')
  if (typeof raw.id !== 'string' || !/^[A-Za-z0-9-]{1,40}$/.test(raw.id)) fail('id')
  const m = plain(raw.medication, MED_KEYS, 'medication fields')
  const timing = m.timing == null ? null : Array.isArray(m.timing) && new Set(m.timing).size === m.timing.length ? m.timing.map((t) => choice(t, TIMINGS, 'timing')) : fail('timing')
  if (m.warnings != null && (!Array.isArray(m.warnings) || m.warnings.length > 50)) fail('warnings')
  const medicine = {
    id: raw.id,
    source: choice(raw.source, ['label', 'typed'], 'source') ?? fail('source'),
    sample: raw.sample === true,
    medication: {
      name: text(m.name, 'name', 200) ?? fail('name'), strength: text(m.strength, 'strength', 200),
      doseAmount: number(m.doseAmount, 'doseAmount', 100), doseUnit: choice(m.doseUnit, DOSE_UNITS, 'doseUnit'),
      quantity: number(m.quantity, 'quantity', 100000), timesPerDay: number(m.timesPerDay, 'timesPerDay', 6, true), timing,
      withFood: choice(m.withFood, WITH_FOOD, 'withFood'), frequencyType: choice(m.frequencyType, FREQUENCY_TYPES, 'frequencyType'),
      rawInstruction: text(m.rawInstruction, 'rawInstruction'), warnings: (m.warnings ?? []).map((w) => text(w, 'warning') ?? fail('warning')),
    },
  }
  if (raw.schedule != null) {
    const s = plain(raw.schedule, ['startDate', 'days', 'times'], 'schedule fields')
    const times = plain(s.times ?? {}, TIMINGS, 'schedule times')
    if (Object.values(times).some((t) => !validTime(t))) fail('schedule times')
    if (s.startDate != null && !validDate(s.startDate)) fail('startDate')
    if (s.days != null && !validDays(s.days)) fail('days')
    medicine.schedule = { ...(s.startDate != null && { startDate: s.startDate }), ...(s.days != null && { days: s.days }), times: { ...times } }
  }
  return medicine
}

export function checkMedicines(raw) {
  try {
    if (!Array.isArray(raw) || raw.length > MAX_MEDICINES) fail(`medicines must be a list of at most ${MAX_MEDICINES}`)
    if (Buffer.byteLength(JSON.stringify(raw)) > 64 * 1024) fail('list exceeds 64 KiB')
    const medicines = raw.map(checkMedicine)
    if (new Set(medicines.map((m) => m.id)).size !== medicines.length) fail('duplicate id')
    return { medicines }
  } catch (error) {
    return { error: error.message }
  }
}

// Turns raw AI output into the contract shape (docs/scan-contract.md).
// AI output is untrusted: anything missing, invalid or out of range becomes null and its path goes in `unclear`.
// Only known fields are copied, so anything extra the model returns (e.g. a patient name) is dropped.

export const DOSE_UNITS = ['tablet', 'capsule', 'ml', 'puff', 'drop', 'other']
export const TIMINGS = ['morning', 'afternoon', 'evening', 'bedtime']
export const WITH_FOOD = ['before', 'after', 'with', 'any']
export const FREQUENCY_TYPES = ['daily', 'as_needed', 'weekly', 'tapering', 'other']
export const BILL_CATEGORIES = ['consultation', 'medication', 'investigation', 'procedure', 'other']
export const SUBSIDY_SCHEMES = ['government', 'chas', 'pioneer', 'merdeka', 'other']

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
const posInt = (v) => (Number.isInteger(v) && v > 0 ? v : null)
const oneOf = (v, list) => (list.includes(v) ? v : null)
// AI reads dollars off the bill; the contract stores integer cents.
const cents = (v) => (num(v) === null ? null : Math.round(v * 100))
const isoDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

export function normalizeMedication(raw = {}) {
  const timing = Array.isArray(raw.timing) ? [...new Set(raw.timing.filter((t) => TIMINGS.includes(t)))] : []
  const medication = {
    name: str(raw.name),
    strength: str(raw.strength),
    doseAmount: num(raw.doseAmount),
    doseUnit: oneOf(raw.doseUnit, DOSE_UNITS),
    timesPerDay: posInt(raw.timesPerDay),
    timing: timing.length ? timing : null,
    withFood: oneOf(raw.withFood, WITH_FOOD),
    frequencyType: oneOf(raw.frequencyType, FREQUENCY_TYPES),
    rawInstruction: str(raw.rawInstruction),
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(str).filter(Boolean) : [],
  }

  // Optional fields (strength, doseUnit, timing, withFood) may be null simply because the label doesn't say.
  const required = ['name', 'doseAmount', 'frequencyType']
  if (medication.frequencyType === 'daily') required.push('timesPerDay')
  const unclear = required.filter((k) => medication[k] === null).map((k) => `medication.${k}`)

  return { type: 'medication', source: 'ai', unclear, medication }
}

export function normalizeBill(raw = {}) {
  const unclear = []
  const list = (v) => (Array.isArray(v) ? v : [])

  const items = list(raw.items).map((line, i) => {
    const item = {
      description: str(line?.description),
      category: oneOf(line?.category, BILL_CATEGORIES) ?? 'other',
      amountCents: cents(line?.amount),
    }
    if (item.description === null) unclear.push(`bill.items.${i}.description`)
    if (item.amountCents === null) unclear.push(`bill.items.${i}.amountCents`)
    return item
  })

  const subsidies = list(raw.subsidies).map((line, i) => {
    const subsidy = { scheme: oneOf(line?.scheme, SUBSIDY_SCHEMES) ?? 'other', amountCents: cents(line?.amount) }
    if (subsidy.amountCents === null) unclear.push(`bill.subsidies.${i}.amountCents`)
    return subsidy
  })

  const bill = {
    clinic: str(raw.clinic),
    visitDate: isoDate(raw.visitDate),
    items,
    subsidies,
    medisaveCents: cents(raw.medisave),
    totalPayableCents: cents(raw.totalPayable),
  }

  if (!items.length) unclear.push('bill.items')
  if (bill.medisaveCents === null) unclear.push('bill.medisaveCents')
  if (bill.totalPayableCents === null) {
    unclear.push('bill.totalPayableCents')
  } else if (!unclear.length) {
    // Cross-check the AI's arithmetic; if it doesn't add up, ask the user to confirm the total.
    const sum = (xs) => xs.reduce((t, x) => t + x.amountCents, 0)
    if (sum(items) - sum(subsidies) - bill.medisaveCents !== bill.totalPayableCents) unclear.push('bill.totalPayableCents')
  }

  return { type: 'bill', source: 'ai', unclear, bill }
}

// Turns raw AI output into the contract shape (docs/scan-contract.md).
// AI output is untrusted: anything missing, invalid or out of range becomes null and its path goes in `unclear`.
// Only known fields are copied, so anything extra the model returns (e.g. a patient name) is dropped.
import { billGap } from '../../src/rules/billCheck.js'

export const DOSE_UNITS = ['tablet', 'capsule', 'ml', 'puff', 'drop', 'other']
export const TIMINGS = ['morning', 'afternoon', 'evening', 'bedtime']
export const WITH_FOOD = ['before', 'after', 'with', 'any']
export const FREQUENCY_TYPES = ['daily', 'as_needed', 'weekly', 'tapering', 'other']
export const BILL_CATEGORIES = ['consultation', 'medication', 'investigation', 'procedure', 'ward', 'tax', 'other']
// insurance: MediShield Life, Integrated Shield, private or employer insurance. Lowers what is paid, like a subsidy.
// paid: money already paid earlier (a deposit at admission, an earlier payment), taken off what is still due.
export const SUBSIDY_SCHEMES = ['government', 'chas', 'pioneer', 'merdeka', 'insurance', 'paid', 'other']
// Where the bill is from. It decides which subsidy rules can apply (src/rules/subsidies.js).
export const BILL_PLACES = ['polyclinic', 'gp', 'dental', 'specialist', 'hospital', 'tcm', 'pharmacy', 'lab', 'other']

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
const posInt = (v) => (Number.isInteger(v) && v > 0 ? v : null)
const oneOf = (v, list) => (list.includes(v) ? v : null)
// AI reads dollars off the bill; the contract stores integer cents.
// Bill amounts as printed can carry a sign: "-6,120.00", "(6,120.00)" or "S$ 1,500.00" (a string from some models).
// Returns signed dollars, or null. A minus or brackets means a deduction (see normalizeBill).
function signedDollars(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const t = v.replace(/s?\$|sgd|,|\s/gi, '')
  const m = t.match(/^(\()?([-−–])?(\d+(?:\.\d+)?)\)?$/)
  if (!m) return null
  return (m[1] || m[2] ? -1 : 1) * Number(m[3])
}
const dollarsToCents = (v) => (v === null ? null : Math.round(v * 100))
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

// Lines that lower the bill. Models sometimes copy them among the charges, or keep their minus sign; either way they are
// taken off, never added. A charge is only treated as one by these words (a minus sign always counts). "Claim" as a
// whole word only: "(NON CLAIMABLE)" on a medicine line is still a charge.
const DEDUCTION = /medi\s*shield|integrated\s*(shield|plan)|insurance|insurer|payout|\bclaims?\b|rebate|discount|deduct|deposit|prepaid|amount\s*paid|payments?\s*(received|made)/i
const MEDISAVE = /medi\s*save/i
// Totals the model listed as a charge: never added in.
const TOTAL_LINE = /^(sub\s*-?\s*total|grand\s*total|total|balance|amount\s*(due|payable)|nett?\s*(payable|amount|total))\b/i
const schemeFor = (d) =>
  /deposit|prepaid|amount\s*paid|payments?\b/i.test(d) ? 'paid'
  : /medi\s*shield|integrated|insur|payout|\bclaims?\b/i.test(d) ? 'insurance'
    : /chas/i.test(d) ? 'chas'
      : /pioneer|\bpg\b/i.test(d) ? 'pioneer'
        : /merdeka|\bmg\b/i.test(d) ? 'merdeka'
          : /subsid/i.test(d) ? 'government'
            : 'other'

export function normalizeBill(raw = {}) {
  const unclear = []
  const list = (v) => (Array.isArray(v) ? v : [])

  const subsidies = []
  const medisaveLines = []
  const charges = []
  // Printed subtotals under each group of charges ("Medications ... Subtotal $83.76"): they show which group a misread
  // amount is in (src/rules/billCheck.js). A subtotal the model put among the charges counts too.
  const subtotals = []
  const addSubtotal = (section, amount) => {
    const dollars = signedDollars(amount)
    if (str(section) && dollars !== null && dollars >= 0) subtotals.push({ section: str(section), amountCents: dollarsToCents(dollars) })
  }
  for (const line of list(raw.subtotals)) addSubtotal(line?.section, line?.amount)
  for (const line of list(raw.items)) {
    const description = str(line?.description)
    const dollars = signedDollars(line?.amount)
    if (description && TOTAL_LINE.test(description)) {
      if (/^sub/i.test(description) && !subtotals.some((s) => s.section === str(line?.section))) addSubtotal(line?.section, line?.amount)
      continue
    }
    // "GST at 7% is included in this bill": already inside the charges, so never added again.
    if (description && /\bgst\b/i.test(description) && /includ/i.test(description)) continue
    const off = dollars !== null && dollars < 0
    if (description && MEDISAVE.test(description) && dollars !== null) medisaveLines.push(Math.abs(dollars))
    else if (off || (description && DEDUCTION.test(description) && dollars !== null)) subsidies.push({ scheme: schemeFor(description ?? ''), amountCents: dollarsToCents(Math.abs(dollars)), includedInItems: false, moved: true })
    else charges.push({ description, category: oneOf(line?.category, BILL_CATEGORIES) ?? 'other', amountCents: dollars === null ? null : dollarsToCents(dollars), section: str(line?.section) })
  }
  const items = charges.map((item, i) => {
    if (item.description === null) unclear.push(`bill.items.${i}.description`)
    if (item.amountCents === null) unclear.push(`bill.items.${i}.amountCents`)
    return item
  })

  for (const line of list(raw.subsidies)) {
    const dollars = signedDollars(line?.amount)
    // The sign doesn't matter here: everything in subsidies lowers the bill.
    const subsidy = { scheme: oneOf(line?.scheme, SUBSIDY_SCHEMES) ?? 'other', amountCents: dollars === null ? null : dollarsToCents(Math.abs(dollars)), includedInItems: line?.includedInItems === true }
    // The same deduction listed twice (as a charge with a minus sign and as a subsidy) counts once.
    const twin = subsidies.findIndex((s) => s.moved && s.amountCents === subsidy.amountCents)
    if (twin >= 0) subsidies.splice(twin, 1)
    subsidies.push(subsidy)
  }
  subsidies.forEach((s, i) => {
    delete s.moved
    // includedInItems: already taken off the (net) item amounts, so shown but never subtracted again.
    if (s.amountCents === null) unclear.push(`bill.subsidies.${i}.amountCents`)
  })

  const medisave = signedDollars(raw.medisave)
  // A MediSave line among the charges only counts when the model didn't also give it as medisave.
  const medisaveDollars = medisave !== null && medisave !== 0 ? Math.abs(medisave) : medisaveLines.length ? medisaveLines.reduce((a, b) => a + b, 0) : medisave
  const total = signedDollars(raw.totalPayable)

  const bill = {
    clinic: str(raw.clinic),
    place: oneOf(raw.place, BILL_PLACES),
    visitDate: isoDate(raw.visitDate),
    items,
    subsidies,
    medisaveCents: dollarsToCents(medisaveDollars),
    totalPayableCents: total === null || total < 0 ? null : dollarsToCents(total),
    subtotals,
  }

  if (!items.length) unclear.push('bill.items')
  if (bill.medisaveCents === null) unclear.push('bill.medisaveCents')
  // Lines that don't add up to the total don't make the total unclear: it is copied from the bill, and Confirm and the
  // Bill page say how far off the lines are (billGap). Only a total that can't be read at all is flagged.
  if (bill.totalPayableCents === null) unclear.push('bill.totalPayableCents')

  return { type: 'bill', source: 'ai', unclear, bill }
}

// Readable, and its lines add up to the printed total (extractScan reads a bill once more when they don't).
export const addsUp = (scan) => scan.unclear.length === 0 && billGap(scan.bill) === 0

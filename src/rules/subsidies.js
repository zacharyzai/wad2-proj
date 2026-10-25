// Owner: Lokesh. Subsidy rules behind the bill questionnaire. Pure functions with no Vue, so server/test/subsidies.test.js can test them.
// Every figure must be on the official page in `sourceUrl` on the date in `checkedOn`. If a figure is unclear, `discount` stays null
// and the page only links to the source. Never invent a percentage or amount.
//
// answers (from the questionnaire; any of them may be missing):
//   birthYear     number
//   residency     'citizen' | 'pr' | 'other'
//   citizenSince  number (year) | 'birth'   (only used when residency is 'citizen')
//   income        'upTo1500' | '1501to2300' | 'above2300' | 'unsure'   (household monthly income per person, for CHAS)
//
// rule.eligible(normalizeAnswers(answers)) returns true, false, or 'unknown' when an answer it needs is missing.
// checkRules(answers) does both steps for every rule.

export const UNKNOWN = 'unknown'
const CHECKED_ON = '2026-10-21'
const FIRST_YEAR = 1900

// Where a scheme can be used. Each rule says where it applies. 'other' = hospital, specialist, TCM, pharmacy, lab and so on:
// no rule here has a confirmed figure there, so the page lists what may apply (with its official link) and never estimates.
export const PLACES = ['polyclinic', 'chasClinic', 'other']

// Years must be whole numbers after 1900 and not in the future (heuristic audit, Bill checklist).
export function validYear(year, thisYear = new Date().getFullYear()) {
  return Number.isInteger(year) && year > FIRST_YEAR && year <= thisYear
}

// Cleans raw answers: invalid or impossible values become null, so the rules treat them as missing.
export function normalizeAnswers(raw = {}, thisYear = new Date().getFullYear()) {
  const birthYear = validYear(raw.birthYear, thisYear) ? raw.birthYear : null
  const residency = ['citizen', 'pr', 'other'].includes(raw.residency) ? raw.residency : null
  let citizenYear = null
  if (residency === 'citizen') {
    if (raw.citizenSince === 'birth') citizenYear = birthYear
    else if (validYear(raw.citizenSince, thisYear) && (birthYear === null || raw.citizenSince >= birthYear)) citizenYear = raw.citizenSince
  }
  const income = ['upTo1500', '1501to2300', 'above2300'].includes(raw.income) ? raw.income : null
  return { birthYear, residency, citizenYear, income }
}

const isPioneer = (a) => {
  if (a.residency === null) return UNKNOWN
  if (a.residency !== 'citizen') return false
  if (a.birthYear === null) return UNKNOWN
  if (a.birthYear > 1949) return false
  if (a.citizenYear === null) return UNKNOWN
  return a.citizenYear <= 1986
}

const isMerdeka = (a) => {
  if (a.residency === null) return UNKNOWN
  if (a.residency !== 'citizen') return false
  if (a.birthYear === null) return UNKNOWN
  if (a.birthYear > 1959) return false
  if (a.citizenYear === null) return UNKNOWN
  if (a.citizenYear > 1996) return false
  // Born 1950–1959: citizen by 1996 is enough. Born 1949 or earlier: only if they didn't get the Pioneer Generation Package,
  // which everyone who became a citizen by 1986 did.
  return a.birthYear >= 1950 || a.citizenYear > 1986
}

const isCitizen = (a) => (a.residency === null ? UNKNOWN : a.residency === 'citizen')
const isResident = (a) => (a.residency === null ? UNKNOWN : a.residency === 'citizen' || a.residency === 'pr')

export const RULES = [
  {
    id: 'pioneer',
    scheme: 'pioneer',
    labelKey: 'scheme.pioneer',
    explainKey: 'bill.rules.pioneer',
    appliesAt: ['polyclinic', 'chasClinic'],
    eligible: isPioneer,
    sourceUrl: 'https://www.moh.gov.sg/managing-expenses/schemes-and-subsidies/pioneer-generation-package/',
    checkedOn: CHECKED_ON,
    // "Additional 50% off remaining bill for subsidised services and medications" at polyclinics and public SOCs.
    // The page doesn't say which bill lines count as subsidised, so the app shows this figure as text and never recalculates a total.
    discount: 50,
    discountAt: 'polyclinic',
  },
  {
    id: 'merdeka',
    scheme: 'merdeka',
    labelKey: 'scheme.merdeka',
    explainKey: 'bill.rules.merdeka',
    appliesAt: ['polyclinic', 'chasClinic'],
    eligible: isMerdeka,
    sourceUrl: 'https://www.moh.gov.sg/managing-expenses/schemes-and-subsidies/merdeka-generation-package/',
    checkedOn: CHECKED_ON,
    // "Additional 25% off remaining bill for subsidised services and medications" at polyclinics and public SOCs. Shown as text only.
    discount: 25,
    discountAt: 'polyclinic',
  },
  {
    id: 'chas',
    scheme: 'chas',
    labelKey: 'scheme.chas',
    explainKey: 'bill.rules.chas',
    // chas.sg FAQ: "CHAS subsidies are not applicable at the polyclinics, and are intended only for private GP and dental clinics."
    appliesAt: ['chasClinic'],
    eligible: isCitizen,
    sourceUrl: 'https://www.chas.sg/Applying-for-CHAS/Eligibility',
    checkedOn: CHECKED_ON,
    // Subsidy amounts depend on the card, the clinic and the condition; no single figure.
    discount: null,
    discountAt: null,
  },
  {
    id: 'polyclinic',
    scheme: 'government',
    labelKey: 'scheme.government',
    explainKey: 'bill.rules.polyclinic',
    appliesAt: ['polyclinic'],
    eligible: isResident,
    sourceUrl: 'https://www.moh.gov.sg/managing-expenses/keeping-healthcare-affordable/outpatient-treatment/',
    checkedOn: CHECKED_ON,
    // MOH gives no polyclinic subsidy percentage on this page.
    discount: null,
    discountAt: null,
  },
]

// CHAS card colour from household monthly income per person (chas.sg, tiers from 1 Jan 2025):
// Blue $1,500 and below, Orange $1,501–$2,300, Green above $2,300. null when not a citizen or the income isn't known.
export function chasTier(raw, thisYear) {
  const a = normalizeAnswers(raw, thisYear)
  if (a.residency !== 'citizen' || a.income === null) return null
  return { upTo1500: 'blue', '1501to2300': 'orange', above2300: 'green' }[a.income]
}

// Every rule with its result for these answers, e.g. [{ rule, result: true }, { rule, result: 'unknown' }, ...].
export function checkRules(raw, thisYear) {
  const answers = normalizeAnswers(raw, thisYear)
  return RULES.map((rule) => ({ rule, result: rule.eligible(answers) }))
}

// From the bill's `place` (read off the bill): GP and dental clinics are where CHAS works. Bills without one (older scans,
// samples) fall back to the clinic name: a polyclinic, or else treated as a (possibly CHAS) GP clinic.
export function billPlace(bill) {
  if (bill.place === 'polyclinic') return 'polyclinic'
  if (bill.place === 'gp' || bill.place === 'dental') return 'chasClinic'
  if (bill.place) return 'other'
  return /polyclinic/i.test(bill.clinic ?? '') ? 'polyclinic' : 'chasClinic'
}

const sumCents = (lines) => lines.reduce((total, line) => total + (line.amountCents ?? 0), 0)

// The bill after subsidies. MediSave is only a way of paying it, so it is not taken off here.
// A subsidy already inside net line amounts (includedInItems) isn't taken off again.
const remainingCents = (bill) => Math.max(0, sumCents(bill.items) - sumCents(bill.subsidies.filter((s) => !s.includedInItems)))

// "X% off remaining bill": a percent of the bill after subsidies. Integer cents, rounded to the nearest cent.
export function discountCents(bill, percent) {
  return Math.round((remainingCents(bill) * percent) / 100)
}

// Compares a bill with the answers:
//   onBill      subsidies already on the bill, each with its rule (null for 'other') and whether the answers match it
//   mayQualify  rules that are true or 'unknown' and not on the bill; `here` = usable at this kind of clinic;
//               amountCents only when the rule has a confirmed figure for this place, otherwise null ("check with the clinic")
//   remainingCents the bill after subsidies (before MediSave)
//   estimateCents  remainingCents minus those amounts, or null when nothing could be calculated. Compared with the bill
//                  after subsidies, not the cash total: MediSave already paid part of that, and may pay part of the new amount too.
export function compareWithBill(bill, raw, thisYear) {
  const place = billPlace(bill)
  const checks = checkRules(raw, thisYear)
  const resultFor = (scheme) => checks.find(({ rule }) => rule.scheme === scheme)
  const schemesOnBill = new Set(bill.subsidies.map((s) => s.scheme))

  const onBill = bill.subsidies.map((s) => {
    const check = resultFor(s.scheme)
    return { scheme: s.scheme, amountCents: s.amountCents, rule: check?.rule ?? null, result: check?.result ?? UNKNOWN }
  })

  const mayQualify = checks
    .filter(({ rule, result }) => result !== false && !schemesOnBill.has(rule.scheme))
    .map(({ rule, result }) => {
      const here = rule.appliesAt.includes(place)
      const amountCents = result === true && rule.discount !== null && rule.discountAt === place ? discountCents(bill, rule.discount) : null
      return { rule, result, here, amountCents }
    })
    .sort((a, b) => Number(b.here) - Number(a.here))

  const amounts = mayQualify.filter((m) => m.amountCents !== null)
  const remaining = remainingCents(bill)
  const estimateCents = amounts.length ? Math.max(0, remaining - sumCents(amounts)) : null
  return { place, onBill, mayQualify, remainingCents: remaining, estimateCents }
}

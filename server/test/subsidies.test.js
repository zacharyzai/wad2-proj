// Owner: Lokesh. Subsidy rules for the bill questionnaire (src/rules/subsidies.js). Sources and figures: see each rule's sourceUrl.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RULES, PLACES, UNKNOWN, checkRules, chasTier, normalizeAnswers, validYear, billPlace, discountCents, compareWithBill } from '../../src/rules/subsidies.js'
import bill1 from '../fixtures/bill-1.json' with { type: 'json' }
import bill2 from '../fixtures/bill-2.json' with { type: 'json' }
import bill3 from '../fixtures/bill-3.json' with { type: 'json' }
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import zh from '../../src/i18n/locales/zh.json' with { type: 'json' }
import ms from '../../src/i18n/locales/ms.json' with { type: 'json' }
import ta from '../../src/i18n/locales/ta.json' with { type: 'json' }

// Fixed "this year" so the tests don't change as time passes.
const YEAR = 2026
// { pioneer: true, merdeka: false, chas: true, polyclinic: true } for these answers.
const results = (answers) => Object.fromEntries(checkRules(answers, YEAR).map(({ rule, result }) => [rule.id, result]))
const citizen = (birthYear, citizenSince = 'birth') => ({ residency: 'citizen', birthYear, citizenSince })

test('Pioneer Generation case: born 1945, citizen since birth', () => {
  assert.deepEqual(results(citizen(1945)), { pioneer: true, merdeka: false, chas: true, polyclinic: true })
})

test('Merdeka Generation case: born 1955, citizen since 1990', () => {
  assert.deepEqual(results(citizen(1955, 1990)), { pioneer: false, merdeka: true, chas: true, polyclinic: true })
})

test('not eligible for PG or MG: born 1985 citizen, and non-citizens', () => {
  assert.deepEqual(results(citizen(1985)), { pioneer: false, merdeka: false, chas: true, polyclinic: true })
  assert.deepEqual(results({ residency: 'pr', birthYear: 1945 }), { pioneer: false, merdeka: false, chas: false, polyclinic: true })
  assert.deepEqual(results({ residency: 'other', birthYear: 1945 }), { pioneer: false, merdeka: false, chas: false, polyclinic: false })
})

test('birth year boundaries: 1949 / 1950 and 1959 / 1960', () => {
  assert.equal(results(citizen(1949)).pioneer, true)
  assert.equal(results(citizen(1949)).merdeka, false)
  assert.equal(results(citizen(1950)).pioneer, false)
  assert.equal(results(citizen(1950)).merdeka, true)
  assert.equal(results(citizen(1959)).merdeka, true)
  assert.equal(results(citizen(1960)).merdeka, false)
})

test('citizenship year boundaries: 1986 / 1987 (PG) and 1996 / 1997 (MG)', () => {
  // Born 1949 or earlier: citizen by 1986 is PG; citizen 1987–1996 is MG (they didn't get PG); later is neither.
  assert.deepEqual([results(citizen(1940, 1986)).pioneer, results(citizen(1940, 1986)).merdeka], [true, false])
  assert.deepEqual([results(citizen(1940, 1987)).pioneer, results(citizen(1940, 1987)).merdeka], [false, true])
  assert.deepEqual([results(citizen(1940, 1996)).pioneer, results(citizen(1940, 1996)).merdeka], [false, true])
  assert.deepEqual([results(citizen(1940, 1997)).pioneer, results(citizen(1940, 1997)).merdeka], [false, false])
  // Born 1950–1959: citizen by 1996.
  assert.equal(results(citizen(1955, 1996)).merdeka, true)
  assert.equal(results(citizen(1955, 1997)).merdeka, false)
})

test('missing answers give "unknown", never a guess', () => {
  assert.deepEqual(results({}), { pioneer: UNKNOWN, merdeka: UNKNOWN, chas: UNKNOWN, polyclinic: UNKNOWN })
  // Citizen, but no birth year yet.
  assert.deepEqual(results({ residency: 'citizen' }), { pioneer: UNKNOWN, merdeka: UNKNOWN, chas: true, polyclinic: true })
  // Old enough, but citizenship year not given.
  assert.deepEqual([results({ residency: 'citizen', birthYear: 1945 }).pioneer, results({ residency: 'citizen', birthYear: 1945 }).merdeka], [UNKNOWN, UNKNOWN])
  // Too young for either scheme: the birth year alone decides.
  assert.deepEqual([results({ residency: 'citizen', birthYear: 1980 }).pioneer, results({ residency: 'citizen', birthYear: 1980 }).merdeka], [false, false])
  // Not a citizen: no birth year needed to say no.
  assert.equal(results({ residency: 'other' }).pioneer, false)
})

test('invalid years are treated as missing', () => {
  for (const birthYear of [1900, 1800, YEAR + 1, 1955.5, '1955', null]) {
    assert.equal(results(citizen(birthYear)).merdeka, UNKNOWN, `birthYear ${birthYear}`)
  }
  // Citizenship before birth is impossible.
  assert.equal(results(citizen(1955, 1950)).merdeka, UNKNOWN)
  assert.equal(results(citizen(1955, YEAR + 1)).merdeka, UNKNOWN)
})

test('validYear: after 1900 and not in the future', () => {
  assert.equal(validYear(1901, YEAR), true)
  assert.equal(validYear(YEAR, YEAR), true)
  assert.equal(validYear(1900, YEAR), false)
  assert.equal(validYear(YEAR + 1, YEAR), false)
  assert.equal(validYear('1950', YEAR), false)
})

test('normalizeAnswers turns "since birth" into the birth year and ignores citizenship for non-citizens', () => {
  assert.equal(normalizeAnswers(citizen(1955), YEAR).citizenYear, 1955)
  assert.equal(normalizeAnswers({ residency: 'pr', birthYear: 1955, citizenSince: 1990 }, YEAR).citizenYear, null)
})

test('CHAS card colour follows household monthly income per person', () => {
  assert.equal(chasTier({ residency: 'citizen', income: 'upTo1500' }, YEAR), 'blue')
  assert.equal(chasTier({ residency: 'citizen', income: '1501to2300' }, YEAR), 'orange')
  assert.equal(chasTier({ residency: 'citizen', income: 'above2300' }, YEAR), 'green')
  assert.equal(chasTier({ residency: 'citizen', income: 'unsure' }, YEAR), null)
  assert.equal(chasTier({ residency: 'pr', income: 'upTo1500' }, YEAR), null)
})

test('every rule has an official source, a check date and no invented figures', () => {
  const OFFICIAL = /^https:\/\/(www\.)?(moh\.gov\.sg|chas\.sg|polyclinic\.singhealth\.com\.sg)\//
  const SCHEMES = ['government', 'chas', 'pioneer', 'merdeka', 'other'] // docs/scan-contract.md
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length)
  for (const rule of RULES) {
    assert.match(rule.sourceUrl, OFFICIAL, rule.id)
    assert.match(rule.checkedOn, /^\d{4}-\d{2}-\d{2}$/, rule.id)
    assert.ok(!Number.isNaN(Date.parse(rule.checkedOn)), rule.id)
    assert.ok(SCHEMES.includes(rule.scheme), rule.id)
    assert.ok(rule.appliesAt.length > 0 && rule.appliesAt.every((p) => PLACES.includes(p)), rule.id)
    assert.equal(typeof rule.eligible, 'function', rule.id)
    if (rule.discount === null) assert.equal(rule.discountAt, null, rule.id)
    else {
      assert.ok(Number.isInteger(rule.discount) && rule.discount > 0 && rule.discount <= 100, rule.id)
      assert.ok(rule.appliesAt.includes(rule.discountAt), rule.id)
    }
  }
  // Only the figures confirmed on the official pages (MOH, checked 2026-10-21).
  assert.deepEqual(Object.fromEntries(RULES.map((r) => [r.id, r.discount])), { pioneer: 50, merdeka: 25, chas: null, polyclinic: null })
})

test('every rule label and explanation exists in all four languages', () => {
  const get = (messages, key) => key.split('.').reduce((obj, part) => obj?.[part], messages)
  for (const [lang, messages] of Object.entries({ en, zh, ms, ta })) {
    for (const rule of RULES) {
      assert.equal(typeof get(messages, rule.labelKey), 'string', `${lang} ${rule.labelKey}`)
      assert.equal(typeof get(messages, rule.explainKey), 'string', `${lang} ${rule.explainKey}`)
    }
  }
})

// A made-up GP clinic bill: no subsidies on it.
const GP_BILL = { clinic: 'Sunrise Family Clinic', items: [{ description: 'Consultation', category: 'consultation', amountCents: 3000 }], subsidies: [], medisaveCents: 0, totalPayableCents: 3000 }
const ids = (list) => list.map((m) => m.rule.id)

test('billPlace: from the place read off the bill; without one, polyclinic by name, anything else a GP clinic', () => {
  assert.equal(billPlace(bill1.bill), 'polyclinic')
  assert.equal(billPlace(GP_BILL), 'chasClinic')
  assert.equal(billPlace({ ...GP_BILL, clinic: null }), 'chasClinic')
  assert.equal(billPlace({ ...GP_BILL, place: 'polyclinic' }), 'polyclinic')
  for (const place of ['gp', 'dental']) assert.equal(billPlace({ ...GP_BILL, place }), 'chasClinic')
  for (const place of ['hospital', 'specialist', 'tcm', 'pharmacy', 'lab', 'other']) assert.equal(billPlace({ ...GP_BILL, place }), 'other')
  assert.ok(PLACES.includes('other'))
})

test('remaining bill: a subsidy already inside net lines is not taken off twice', () => {
  const net = { items: [{ amountCents: 48300 }], subsidies: [{ scheme: 'government', amountCents: 89700, includedInItems: true }, { scheme: 'merdeka', amountCents: 1000 }] }
  assert.equal(discountCents(net, 100), 47300) // 483.00 − 10.00, not max(0, 483 − 897 − 10)
})

test('hospital bill: what is on it is listed, schemes are shown as "may not apply here", and nothing is ever estimated', () => {
  const hospital = {
    clinic: 'Merlion Valley General Hospital',
    place: 'hospital',
    items: [{ description: 'Daily Ward Charges', category: 'ward', amountCents: 14000 }, { description: 'GST 9%', category: 'tax', amountCents: 8712 }],
    subsidies: [{ scheme: 'government', amountCents: 68583 }, { scheme: 'pioneer', amountCents: 5276 }, { scheme: 'insurance', amountCents: 15000 }],
    medisaveCents: 6000,
    totalPayableCents: 10653,
  }
  const r = compareWithBill(hospital, citizen(1945), YEAR)
  assert.equal(r.place, 'other')
  assert.deepEqual(r.onBill.map((s) => s.scheme), ['government', 'pioneer', 'insurance'])
  assert.equal(r.onBill.find((s) => s.scheme === 'insurance').rule, null) // no rule: just shown as on the bill
  assert.ok(r.mayQualify.every((m) => m.here === false && m.amountCents === null))
  assert.equal(r.estimateCents, null)
})

test('discountCents: percent of the bill after subsidies, whole cents', () => {
  assert.equal(discountCents(bill1.bill, 50), 700) // (2270 − 870) × 50%
  const odd = { items: [{ amountCents: 1405 }], subsidies: [] }
  assert.equal(discountCents(odd, 25), 351) // 351.25 rounds down
  assert.equal(discountCents(odd, 50), 703) // 702.5 rounds up
  assert.ok(Number.isInteger(discountCents(bill3.bill, 25)))
})

test('PG on a polyclinic bill without PG: estimated amount from the confirmed 50%', () => {
  const r = compareWithBill(bill1.bill, citizen(1945), YEAR)
  assert.deepEqual(r.onBill.map((s) => [s.scheme, s.amountCents, s.result]), [['government', 870, true]])
  const pioneer = r.mayQualify.find((m) => m.rule.id === 'pioneer')
  assert.deepEqual([pioneer.result, pioneer.here, pioneer.amountCents], [true, true, 700])
  assert.equal(r.estimateCents, 700) // 1400 − 700
  // CHAS is listed but can't be used at a polyclinic, and has no figure.
  const chas = r.mayQualify.find((m) => m.rule.id === 'chas')
  assert.deepEqual([chas.here, chas.amountCents], [false, null])
})

test('with MediSave on the bill, the estimate is the bill after subsidies, not the cash total', () => {
  const r = compareWithBill(bill2.bill, citizen(1945), YEAR)
  assert.equal(r.remainingCents, 4170) // 6270 − 2100; MediSave (2500) is a way of paying, not taken off
  assert.equal(r.mayQualify.find((m) => m.rule.id === 'pioneer').amountCents, 2085)
  assert.equal(r.estimateCents, 2085) // not max(0, 1670 − 2085) = 0
})

test('MG already on the bill is not offered again and nothing is calculated', () => {
  const r = compareWithBill(bill3.bill, citizen(1955, 1990), YEAR)
  assert.equal(r.onBill.find((s) => s.scheme === 'merdeka').result, true)
  assert.deepEqual(ids(r.mayQualify), ['chas'])
  assert.equal(r.estimateCents, null)
})

test('not eligible: born 1985 gets no PG/MG and no estimate', () => {
  const r = compareWithBill(bill1.bill, citizen(1985), YEAR)
  assert.deepEqual(ids(r.mayQualify), ['chas'])
  assert.equal(r.estimateCents, null)
})

test('GP clinic bill: PG shows without a figure (50% is a polyclinic figure), polyclinic subsidy is not for here', () => {
  const r = compareWithBill(GP_BILL, citizen(1945), YEAR)
  const pioneer = r.mayQualify.find((m) => m.rule.id === 'pioneer')
  assert.deepEqual([pioneer.here, pioneer.amountCents], [true, null])
  assert.equal(r.mayQualify.find((m) => m.rule.id === 'polyclinic').here, false)
  assert.equal(r.estimateCents, null)
  // Usable-here schemes come first.
  assert.equal(r.mayQualify.at(-1).here, false)
})

test('no answers yet: schemes are "unknown" and nothing is calculated', () => {
  const r = compareWithBill(bill1.bill, {}, YEAR)
  assert.ok(r.mayQualify.every((m) => m.result === UNKNOWN && m.amountCents === null))
  assert.equal(r.estimateCents, null)
})

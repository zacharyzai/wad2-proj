// src/rules/history.js: how the History page tidies saved scans (medicines grouped, bills by month, totals, search).
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { billDate, billMonths, clinicTotals, matches, medicineGroups, medicineKey } from '../../src/rules/history.js'

const med = (id, title, createdAt, purpose = null) => ({ id, type: 'medication', title, createdAt, purpose })
const bill = (id, title, createdAt, visitDate, totalPayableCents) => ({ id, type: 'bill', title, createdAt, visitDate, totalPayableCents })

test('medicines: one group per medicine with its scans newest first; still taken ones first, then most recent', () => {
  const items = [
    med('a', 'Panadol', '2026-10-30T02:00:00Z'),
    med('b', 'Metformin 500 mg', '2026-10-01T02:00:00Z', 'diabetes'),
    med('c', 'metformin  500 MG', '2026-11-01T02:00:00Z'), // the same medicine, typed differently
    med('d', 'Amlodipine 5 mg', '2026-09-01T02:00:00Z'),
    bill('e', 'Bedok Polyclinic', '2026-10-02T02:00:00Z', null, 1400),
  ]
  const groups = medicineGroups(items, new Set([medicineKey('Metformin 500 mg'), medicineKey('Amlodipine 5 mg')]))
  assert.deepEqual(groups.map((g) => [g.title, g.taking, g.scans.map((s) => s.id)]), [
    ['metformin  500 MG', true, ['c', 'b']], // taking, scanned most recently; title from the newest scan
    ['Amlodipine 5 mg', true, ['d']],
    ['Panadol', false, ['a']], // newer than Amlodipine, but no longer taken
  ])
  assert.equal(groups[0].purpose, 'diabetes') // from an older scan when the newest has none
  assert.equal(groups[0].last, '2026-11-01T02:00:00Z')
})

test('bills: by month of the visit (or the Singapore day saved when no date is printed), newest first', () => {
  assert.equal(billDate(bill('x', null, '2026-10-31T17:30:00Z', null, 0)), '2026-11-01') // 1:30 am in Singapore
  const months = billMonths([
    bill('a', 'Bedok Polyclinic', '2026-11-02T02:00:00Z', '2026-10-28', 1400),
    bill('b', 'Merlion Valley', '2026-11-01T02:00:00Z', '2026-11-01', 10653),
    bill('c', 'Merlion Valley', '2026-10-05T02:00:00Z', null, 2000),
    med('m', 'Metformin 500 mg', '2026-10-06T02:00:00Z'),
  ])
  assert.deepEqual(months.map((m) => [m.month, m.bills.map((b) => [b.id, b.date])]), [
    ['2026-11', [['b', '2026-11-01']]],
    ['2026-10', [['a', '2026-10-28'], ['c', '2026-10-05']]], // scanned in November, but the visit was in October
  ])
})

test('what was paid at each clinic in a year: most paid first; other years and medicines left out', () => {
  const items = [
    bill('a', 'Merlion Valley', '2026-10-01T02:00:00Z', '2026-10-01', 10653),
    bill('b', 'merlion valley', '2026-03-01T02:00:00Z', '2026-03-01', 2000),
    bill('c', 'Bedok Polyclinic', '2026-05-01T02:00:00Z', '2026-05-01', 1400),
    bill('d', 'Bedok Polyclinic', '2026-06-01T02:00:00Z', '2026-06-01', null), // no total: a visit, nothing added
    bill('e', 'Merlion Valley', '2025-12-01T02:00:00Z', '2025-12-01', 99999),
    med('m', 'Metformin 500 mg', '2026-10-06T02:00:00Z'),
  ]
  assert.deepEqual(clinicTotals(items, '2026').map((c) => [c.clinic, c.cents, c.count]), [['Merlion Valley', 12653, 2], ['Bedok Polyclinic', 1400, 2]])
})

test('search: any part of the name or clinic, ignoring case and spaces; nothing typed matches all', () => {
  assert.equal(matches('Metformin 500 mg', 'METF'), true)
  assert.equal(matches('Metformin 500 mg', '  500   mg '), true)
  assert.equal(matches('Metformin 500 mg', 'pana'), false)
  assert.equal(matches(null, 'x'), false)
  assert.equal(matches('Anything', '   '), true)
})

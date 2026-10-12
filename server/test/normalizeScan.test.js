import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeMedication, normalizeBill } from '../services/normalizeScan.js'

test('medication: clean label has nothing unclear and drops unknown fields', () => {
  const scan = normalizeMedication({
    name: ' Metformin ', doseAmount: 1, doseUnit: 'tablet', timesPerDay: 2, timing: ['morning', 'bedtime'],
    withFood: 'after', frequencyType: 'daily', warnings: ['Avoid alcohol', ''], patientName: 'Tan Ah Kow',
  })
  assert.deepEqual(scan.unclear, [])
  assert.equal(scan.medication.name, 'Metformin')
  assert.deepEqual(scan.medication.warnings, ['Avoid alcohol'])
  assert.equal('patientName' in scan.medication, false)
})

test('medication: invalid values become null and are flagged, never guessed', () => {
  const scan = normalizeMedication({ name: '', doseAmount: 'two', timesPerDay: 1.5, doseUnit: 'spoon', frequencyType: 'daily' })
  assert.equal(scan.medication.doseUnit, null)
  assert.deepEqual(scan.unclear, ['medication.name', 'medication.doseAmount', 'medication.timesPerDay'])
})

test('medication: as-needed does not require timesPerDay', () => {
  const scan = normalizeMedication({ name: 'Paracetamol', doseAmount: 2, frequencyType: 'as_needed' })
  assert.deepEqual(scan.unclear, [])
})

test('bill: dollars become integer cents and totals are cross-checked', () => {
  const raw = {
    items: [{ description: 'Consultation', category: 'consultation', amount: 14.5 }, { description: 'Meds', category: 'medication', amount: 8.2 }],
    subsidies: [{ scheme: 'government', amount: 8.7 }],
    medisave: 0,
    totalPayable: 14,
  }
  const ok = normalizeBill(raw)
  assert.deepEqual(ok.unclear, [])
  assert.deepEqual(ok.bill.items.map((i) => i.amountCents), [1450, 820])

  const wrong = normalizeBill({ ...raw, totalPayable: 99 })
  assert.deepEqual(wrong.unclear, ['bill.totalPayableCents'])
})

test('bill: unreadable lines are flagged and unknown enums fall back to other', () => {
  const scan = normalizeBill({ items: [{ description: null, category: 'x', amount: null }], subsidies: [], medisave: 0, totalPayable: 5 })
  assert.equal(scan.bill.items[0].category, 'other')
  assert.deepEqual(scan.unclear, ['bill.items.0.description', 'bill.items.0.amountCents'])
  assert.deepEqual(normalizeBill({}).unclear, ['bill.items', 'bill.medisaveCents', 'bill.totalPayableCents'])
})

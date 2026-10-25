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

// Eastwater General Hospital (01_public_hospital_inpatient): lines printed as Gross / Subsidy / Net.
const NET_BILL = {
  clinic: 'Eastwater General Hospital',
  place: 'hospital',
  items: [
    { description: 'Ward & Daily Treatment (6 days)', category: 'ward', amount: 483 },
    { description: 'Surgery — Hemiarthroplasty', category: 'procedure', amount: 1487.5 },
    { description: 'Implant — Bipolar Hip Prosthesis', category: 'procedure', amount: 1092 },
    { description: 'Anaesthesia', category: 'procedure', amount: 336 },
    { description: 'Investigations (Lab / X-Ray / ECG)', category: 'investigation', amount: 249.38 },
    { description: 'Medications & Consumables', category: 'medication', amount: 188.41 },
    { description: 'Rehabilitation (PT x4, OT x2)', category: 'procedure', amount: 147 },
    { description: 'GST 9%', category: 'tax', amount: 358.5 },
  ],
  subsidies: [
    { scheme: 'government', amount: 7397.51, includedInItems: true }, // already inside the net lines
    { scheme: 'insurance', amount: 2850 },
    { scheme: 'merdeka', amount: 217.09 },
  ],
  medisave: 1094.7,
  totalPayable: 180,
}

test('bill with net lines: the subsidy inside them is kept but not subtracted again, so the total checks out', () => {
  const { bill, unclear } = normalizeBill(NET_BILL)
  assert.deepEqual(unclear, []) // 4341.79 − 2850 − 217.09 − 1094.70 = 180.00
  assert.deepEqual(bill.subsidies.map((s) => [s.scheme, s.includedInItems]), [['government', true], ['insurance', false], ['merdeka', false]])
  // Taking the government subsidy off again would not add up: flagged for the user to check.
  const twice = normalizeBill({ ...NET_BILL, subsidies: NET_BILL.subsidies.map((s) => ({ ...s, includedInItems: false })) })
  assert.ok(twice.unclear.includes('bill.totalPayableCents'))
})

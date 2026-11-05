// What each demo account is seeded with: medicines on their Schedule, saved scans in History, and how well they have kept up.
// Labels and bills come from server/fixtures (the same samples the app offers); a few extra medicines are typed in here.
// Everything is fake. Used by seed-demo-accounts.js.
import { readFileSync } from 'node:fs'

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'))

// A medicine as the app saves it (server/validation/medicines.js): label fields plus where the Schedule starts.
// `from` = how many days ago the course started, so the week strip already has a few days of history.
const label = (id, fixtureName, from = 6) => ({
  id,
  source: 'label',
  sample: true,
  medication: fixture(fixtureName).medication,
  from,
})
const typed = (id, medication, from = 6) => ({
  id,
  source: 'typed',
  sample: false,
  medication: {
    strength: null,
    doseUnit: 'tablet',
    quantity: 30,
    withFood: 'any',
    frequencyType: 'daily',
    rawInstruction: null,
    warnings: [],
    ...medication,
  },
  from,
})

const SIMVASTATIN = {
  name: 'Simvastatin',
  strength: '20 mg',
  doseAmount: 1,
  quantity: 30,
  timesPerDay: 1,
  timing: ['bedtime'],
  withFood: 'any',
  rawInstruction: 'Take 1 tablet at night',
  purpose: 'cholesterol',
}
const PARACETAMOL = {
  name: 'Paracetamol',
  strength: '500 mg',
  doseAmount: 2,
  quantity: 20,
  timesPerDay: null,
  timing: null,
  frequencyType: 'as_needed',
  rawInstruction: 'Take 2 tablets when needed for pain, not more than 8 tablets a day',
  purpose: 'pain',
  warnings: ['Do not take more than 8 tablets in 24 hours'],
}
const VITAMIN_D = {
  name: 'Vitamin D3',
  strength: '1000 IU',
  doseAmount: 1,
  doseUnit: 'capsule',
  quantity: 60,
  timesPerDay: 1,
  timing: ['morning'],
  withFood: 'with',
  rawInstruction: 'Take 1 capsule every morning with breakfast',
  purpose: 'vitamins',
}

// `scans` are fixture names saved to History, newest first; `daysAgo` says when. `missOne`: leave one past dose today unticked,
// so the "Not ticked yet" flag and the caregiver's missed count have something to show.
export const DEMO_DATA = {
  // Pioneer and Merdeka are linked to the caregiver account: the fullest schedules, for the demo.
  'pioneer.demo@example.com': {
    medicines: [
      label('demo-metformin', 'med-1'),
      label('demo-amlodipine', 'med-2'),
      typed('demo-simvastatin', SIMVASTATIN),
      typed('demo-paracetamol', PARACETAMOL), // as needed: flagged for a pharmacist, never scheduled
    ],
    scans: [
      { fixture: 'med-1', daysAgo: 6 },
      { fixture: 'med-2', daysAgo: 6 },
      { fixture: 'bill-4', daysAgo: 3 },
      { fixture: 'bill-1', daysAgo: 35 },
    ],
    missOne: true,
  },
  'merdeka.demo@example.com': {
    medicines: [
      label('demo-metformin', 'med-1'),
      label('demo-amlodipine', 'med-2'),
      typed('demo-vitamin-d', VITAMIN_D),
    ],
    scans: [
      { fixture: 'med-1', daysAgo: 6 },
      { fixture: 'bill-3', daysAgo: 4 },
      { fixture: 'bill-2', daysAgo: 30 },
    ],
  },
  'late.citizen.demo@example.com': {
    medicines: [label('demo-metformin', 'med-1', 4)],
    scans: [
      { fixture: 'med-1', daysAgo: 4 },
      { fixture: 'bill-2', daysAgo: 12 },
    ],
  },
  'chas.demo@example.com': {
    medicines: [label('demo-amlodipine', 'med-2', 3)],
    scans: [
      { fixture: 'med-2', daysAgo: 3 },
      { fixture: 'bill-1', daysAgo: 20 },
    ],
  },
  'pr.demo@example.com': {
    medicines: [label('demo-metformin', 'med-1', 2), typed('demo-vitamin-d', VITAMIN_D, 2)],
    scans: [
      { fixture: 'med-1', daysAgo: 2 },
      { fixture: 'bill-1', daysAgo: 9 },
    ],
  },
  'chas.orange.demo@example.com': {
    medicines: [typed('demo-simvastatin', SIMVASTATIN, 5)],
    scans: [{ fixture: 'bill-2', daysAgo: 7 }],
  },
  'chas.green.demo@example.com': {
    medicines: [label('demo-amlodipine', 'med-2', 5)],
    scans: [{ fixture: 'bill-3', daysAgo: 10 }],
  },
  'unsure.demo@example.com': {
    medicines: [label('demo-metformin', 'med-1', 3), label('demo-cough-syrup', 'med-3', 1)],
    scans: [
      { fixture: 'med-3', daysAgo: 1 },
      { fixture: 'bill-3', daysAgo: 14 },
    ],
  },
  'foreigner.demo@example.com': {
    medicines: [typed('demo-paracetamol', PARACETAMOL, 1)],
    scans: [{ fixture: 'bill-4', daysAgo: 5 }],
  },
}

// The scan to save to History: the fixture's medication or bill, without the `unclear` list (everything here is confirmed).
// Bills get a visit date `daysAgo` days back, so History groups them by recent months.
export function scanFor(name, visitDate) {
  const { type, source, medication, bill } = fixture(name)
  return type === 'medication'
    ? { type, source, medication }
    : { type, source, bill: { ...bill, visitDate } }
}

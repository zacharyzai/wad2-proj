// Run: node --test src/utils/sensitive.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findSensitive, planRedaction } from './sensitive.js'

// Builds Tesseract-shaped lines from plain strings; each word gets a dummy box.
const lines = (...rows) => rows.map((row, y) => ({ words: row.split(' ').filter(Boolean).map((text, x) => ({ text, bbox: { x0: x, y0: y, x1: x + 1, y1: y + 1 } })) }))
const covered = (...rows) => findSensitive(lines(...rows)).map((h) => h.text)

test('NRIC/FIN: full, masked, OCR look-alikes and split across words', () => {
  assert.deepEqual(covered('NRIC: S1234567D'), ['S1234567D'])
  assert.deepEqual(covered('Ref S1234567D visit'), ['S1234567D'])
  assert.deepEqual(covered('ID SXXXX567D'), ['SXXXX567D'])
  assert.deepEqual(covered('T12O4S67J'), ['T12O4S67J']) // O→0, S→5 inside the digits
  assert.deepEqual(covered('G1234567 X'), ['G1234567', 'X'])
})

test('labelled fields cover their value, on the same line or the next', () => {
  assert.deepEqual(covered('Name: TAN AH KOW'), ['TAN', 'AH', 'KOW'])
  assert.deepEqual(covered('Patient Name TAN AH KOW'), ['TAN', 'AH', 'KOW'])
  assert.deepEqual(covered('Name:', 'TAN AH KOW', 'METFORMIN 500 MG'), ['TAN', 'AH', 'KOW'])
  assert.deepEqual(covered('Date of Birth: 15/03/1948'), ['15/03/1948'])
  assert.deepEqual(covered('DOB 15 Mar 1948'), ['15', 'Mar', '1948'])
  // Two fields on one line: each value stops at the next label.
  assert.deepEqual(covered('Name: TAN AH KOW DOB: 15/03/1948'), ['TAN', 'AH', 'KOW', '15/03/1948'])
  assert.deepEqual(covered('Name:TAN AH KOW'), ['Name:TAN', 'AH', 'KOW'])
})

test('phones and address lines', () => {
  assert.deepEqual(covered('Tel 6789 1234'), ['6789', '1234'])
  assert.deepEqual(covered('Call +6591234567 if unwell'), ['+6591234567'])
  assert.deepEqual(covered('Blk 123 Bedok North Ave 3 #04-56'), ['Blk', '123', 'Bedok', 'North', 'Ave', '3', '#04-56'])
  assert.deepEqual(covered('Singapore 460123'), ['Singapore', '460123'])
})

test('leaves what the scan needs: medicine, dose, visit date, amounts', () => {
  assert.deepEqual(
    covered(
      'POLYCLINIC PHARMACY',
      'Date: 01/09/2026',
      'METFORMIN 500 MG TABLET',
      'TAKE 1 TABLET 2 TIMES A DAY',
      'Qty: 60 tablets',
      'Patient payable 4.20',
      'Less: Government subsidy -8.70',
      'Consultation 14.50',
    ),
    [],
  )
})

const kept = (...rows) => planRedaction(lines(...rows)).keep.map((k) => k.text)

test('keep-list: only medicine and bill lines are shown; names, addresses and unread text stay black', () => {
  assert.deepEqual(
    kept(
      'POLYCLINIC PHARMACY',
      'TAN AH KOW', // unlabelled name: never found by findSensitive, but not on the keep-list either
      'Blk 123 Bedok North Ave 3',
      'METFORMIN 500 MG TABLET',
      'TAKE 1 TABLET 2 TIMES A DAY',
      'AFTER FOOD',
      'in the moming', // "morning" misread by OCR, still kept
      '每日两次', // the English reader turns Chinese into noise like this; not kept
      '~ ;# @@',
      'Do not skip meals',
      'Qty: 60 tablets',
      'FOR ALLERGY/RUNNING NOSE/ITCH',
      'For Mdm Tan', // "for" alone never keeps a line
    ),
    ['POLYCLINIC PHARMACY', 'METFORMIN 500 MG TABLET', 'TAKE 1 TABLET 2 TIMES A DAY', 'AFTER FOOD', 'in the moming', 'Do not skip meals', 'Qty: 60 tablets', 'FOR ALLERGY/RUNNING NOSE/ITCH'],
  )
  assert.deepEqual(kept('Consultation 14.50', 'Less: Government subsidy -8.70', 'MediSave', 'Total payable $4.20'), [
    'Consultation 14.50',
    'Less: Government subsidy -8.70',
    'MediSave',
    'Total payable $4.20',
  ])
})

test('keep-list: hospital bill lines are shown; admission number, doctor and payer lines stay black', () => {
  assert.deepEqual(
    kept(
      'MERLION VALLEY GENERAL HOSPITAL',
      'Bill No : MVGH-2026-0047812', // kept, as on every bill ("bill"): a bill number is not a personal detail
      'Admission No : IP26-0098341',
      'Ward / Class : Ward 7B / Class C (Subsidised)',
      'Discharged : 22/10/2026 10:05',
      'Attending Doctor : Dr Lim Wei Ming (MCR M99999Z)',
      'Radiology - Chest X-Ray PA',
      'Less: MediShield Life Claim',
      'Payer: Tan Mei Ling (Daughter)',
      'Bedok North', // "bed" only as a whole word
    ),
    ['MERLION VALLEY GENERAL HOSPITAL', 'Bill No : MVGH-2026-0047812', 'Ward / Class : Ward 7B / Class C (Subsidised)', 'Discharged : 22/10/2026 10:05', 'Radiology - Chest X-Ray PA', 'Less: MediShield Life Claim'],
  )
})

test('keep-list: personal details on a kept line are still covered', () => {
  const plan = planRedaction(lines('Date of Birth: 15/03/1948', 'Date: 01/09/2026'))
  assert.deepEqual(plan.keep.map((k) => k.text), ['Date of Birth: 15/03/1948', 'Date: 01/09/2026'])
  assert.deepEqual(plan.hits.map((h) => h.text), ['15/03/1948'])
})

// Tesseract-shaped line with a baseline from (x0, by0) to (x1, by1) and letters 30px above it.
const line = (texts, x0, by0, x1 = x0 + 400, by1 = by0) => ({
  words: texts.map((text, i) => ({ text, bbox: { x0: x0 + i * 60, y0: by0 - 30, x1: x0 + i * 60 + 50, y1: by0 } })),
  bbox: { x0, y0: Math.min(by0, by1) - 30, x1, y1: Math.max(by0, by1) + 6 },
  baseline: { x0, y0: by0, x1, y1: by1 },
  rowAttributes: { rowHeight: 36, descenders: 6, ascenders: 8 },
})

test('keep-list: a printed line the reader split into pieces (pen circles) is joined and shown as one strip', () => {
  const { keep } = planRedaction([
    line(['Take', '1'], 0, 100, 120, 100),
    line(['tab/s', '2', 'times'], 130, 99, 300, 99), // filed as a separate line, same baseline
    line(['a', 'day'], 310, 100, 400, 100),
    line(['S6925419E', 'LOW', 'YAN', 'LEE'], 0, 145), // the next printed row, 45px lower
  ])
  assert.deepEqual(keep.map((k) => k.text), ['Take 1 tab/s 2 times a day'])
  assert.deepEqual([keep[0].band.x0, keep[0].band.x1], [0, 400])
})

test('keep-list: rows on a tilted photo are told apart by their tilted baselines', () => {
  // Both rows slope up by 50px over 1000px; the name row is 45px lower all along.
  const { keep } = planRedaction([
    line(['Batch', '#:', '5DN571A', 'Expiry', 'Date:'], 0, 450, 1000, 400),
    line(['S6925419E', 'LOW', 'YAN', 'LEE'], 0, 495, 1000, 445),
    line(['Telfast'], 900, 420, 960, 420), // a print on the foil at the far end: its own row
  ])
  assert.deepEqual(keep.map((k) => k.text), ['Batch #: 5DN571A Expiry Date:'])
})

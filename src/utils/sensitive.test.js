// Run: node --test src/utils/sensitive.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findSensitive } from './sensitive.js'

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

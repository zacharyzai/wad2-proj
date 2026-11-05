// Run: pnpm vitest run src/utils/sensitive.test.js
import { describe, it, expect } from 'vitest'
import { findSensitive, planRedaction } from '../src/utils/sensitive.js'

// Builds Tesseract-shaped lines from plain strings; each word gets a dummy box.
const lines = (...rows) =>
  rows.map((row, y) => ({
    words: row
      .split(' ')
      .filter(Boolean)
      .map((text, x) => ({ text, bbox: { x0: x, y0: y, x1: x + 1, y1: y + 1 } })),
  }))
const covered = (...rows) => findSensitive(lines(...rows)).map((h) => h.text)

describe('sensitive: what of a photo may leave the phone', () => {
  it('NRIC/FIN: full, masked, OCR look-alikes and split across words', () => {
    expect(covered('NRIC: S1234567D')).toEqual(['S1234567D'])
    expect(covered('Ref S1234567D visit')).toEqual(['S1234567D'])
    expect(covered('ID SXXXX567D')).toEqual(['SXXXX567D'])
    expect(covered('T12O4S67J')).toEqual(['T12O4S67J']) // O→0, S→5 inside the digits
    expect(covered('G1234567 X')).toEqual(['G1234567', 'X'])
  })

  it('an NRIC whose check letter the reader got wrong or lost is still covered', () => {
    expect(covered('NRIC S0000588)')).toEqual(['S0000588)']) // "J" read as ")"
    expect(covered('Ref S0000588')).toEqual(['S0000588'])
    expect(covered('Ward 54 / B2 Table 6B')).toEqual([]) // ward and table codes are not NRICs
  })

  it('whoever pays is covered too: account holder, payer, next of kin', () => {
    // Real reader output from a hospital bill (01_public_hospital_inpatient).
    expect(covered('MediSave account holder: Ong Kok Leong (Son), NRIC S0000588)')).toEqual([
      'Ong',
      'Kok',
      'Leong',
      '(Son),',
      'NRIC',
      'S0000588)',
    ])
    expect(covered('Payer: Tan Mei Ling (Daughter)')).toEqual(['Tan', 'Mei', 'Ling', '(Daughter)'])
    expect(covered('Next of kin: Lim Ah Beng')).toEqual(['Lim', 'Ah', 'Beng'])
  })

  it('an unlabelled name that comes back on several bill rows is covered on every one; charges stay', () => {
    // Page 2 of a TTSH tax invoice: the patient's name on payment rows, with no label in front.
    const page = [
      'PAYMENT SUMMARY',
      'TOTAL AMOUNT (AFTER GOVT SUBSIDY) 6,778.85',
      'SCHEMES (SCHEME ID) / PAYOR REFERENCE NO AMOUNT PAYABLE ($)',
      'INTEGRATED SHIELD PLAN',
      '• MEDISHIELD LIFE 3,934.23',
      '• INTEGRATED GREAT EASTERN SUPREMEHEALTH 361.36',
      '• ANG CHEE SUAN ALICIA - MSV INPAT & DAY 995.82',
      'ANG CHEE SUAN ALICIA 1,487.44',
      'ANG CHEE SUAN ALICIA TOTAL AMOUNT PAYABLE 1,487.44',
      'ANG CHEE SUAN ALICIA 23 MAR 2026 HEALTH HUB -1,487.44',
    ]
    const hits = covered(...page)
    expect(hits.filter((w) => w === 'ALICIA').length).toBe(4)
    for (const word of [
      'MEDISHIELD',
      'LIFE',
      'SHIELD',
      'PLAN',
      'TOTAL',
      'AMOUNT',
      'PAYABLE',
      'GREAT',
      'EASTERN',
    ])
      expect(!hits.includes(word)).toBeTruthy()
    // Charges whose service and description repeat in other case, and a drug name repeated on a label (no money), stay.
    expect(
      covered(
        'MEDICAL SUPPLIES, CONSUMABLES Medical Supplies, Consumables 702.64',
        'OTHERS Others 33.00',
      ),
    ).toEqual([])
    expect(
      covered('AMLODIPINE BESYLATE 5MG TABLET', 'AMLODIPINE BESYLATE: take 1 every morning'),
    ).toEqual([])
  })

  it('a Payer or Name heading a table: the names in the rows below are covered, not the column headings', () => {
    // Real reader output from a Yishun Health interim bill (payer table).
    // "to" read as 10 in the last line
    expect(
      covered(
        'Payer Adjustment Payment Amount Due',
        'LAU YOONG KEE 000 0.00 0.00',
        'TAN AH KOW 0.00 15,000.00 95.698 13',
        'Please note that the amount 10 be borne by the different parties have yet to be determined.',
      ),
    ).toEqual(['LAU', 'YOONG', 'KEE', 'TAN', 'AH', 'KOW'])
    expect(covered('Name Relationship', 'Ong Kok Leong Son')).toEqual([
      'Ong',
      'Kok',
      'Leong',
      'Son',
    ])
    expect(covered('Payer Amount', 'Nur Aisyah binte Abdul Rahman 0.00')).toEqual([
      'Nur',
      'Aisyah',
      'binte',
      'Abdul',
      'Rahman',
    ])
    // A label with its value on the same line is unchanged.
    expect(covered('Payer Tan Mei Ling')).toEqual(['Tan', 'Mei', 'Ling'])
  })

  it('labelled fields cover their value, on the same line or the next', () => {
    expect(covered('Name: TAN AH KOW')).toEqual(['TAN', 'AH', 'KOW'])
    expect(covered('Patient Name TAN AH KOW')).toEqual(['TAN', 'AH', 'KOW'])
    expect(covered('Name:', 'TAN AH KOW', 'METFORMIN 500 MG')).toEqual(['TAN', 'AH', 'KOW'])
    expect(covered('Date of Birth: 15/03/1948')).toEqual(['15/03/1948'])
    expect(covered('DOB 15 Mar 1948')).toEqual(['15', 'Mar', '1948'])
    // Two fields on one line: each value stops at the next label.
    expect(covered('Name: TAN AH KOW DOB: 15/03/1948')).toEqual(['TAN', 'AH', 'KOW', '15/03/1948'])
    expect(covered('Name:TAN AH KOW')).toEqual(['Name:TAN', 'AH', 'KOW'])
  })

  it('phones and address lines', () => {
    expect(covered('Tel 6789 1234')).toEqual(['6789', '1234'])
    expect(covered('Call +6591234567 if unwell')).toEqual(['+6591234567'])
    expect(covered('Blk 123 Bedok North Ave 3 #04-56')).toEqual([
      'Blk',
      '123',
      'Bedok',
      'North',
      'Ave',
      '3',
      '#04-56',
    ])
    expect(covered('Singapore 460123')).toEqual(['Singapore', '460123'])
  })

  it('leaves what the scan needs: medicine, dose, visit date, amounts', () => {
    expect(
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
    ).toEqual([])
  })

  const kept = (...rows) => planRedaction(lines(...rows)).keep.map((k) => k.text)

  it('keep-list: only medicine and bill lines are shown; names, addresses and unread text stay black', () => {
    expect(
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
    ).toEqual([
      'POLYCLINIC PHARMACY',
      'METFORMIN 500 MG TABLET',
      'TAKE 1 TABLET 2 TIMES A DAY',
      'AFTER FOOD',
      'in the moming',
      'Do not skip meals',
      'Qty: 60 tablets',
      'FOR ALLERGY/RUNNING NOSE/ITCH',
    ])
    expect(
      kept(
        'Consultation 14.50',
        'Less: Government subsidy -8.70',
        'MediSave',
        'Total payable $4.20',
      ),
    ).toEqual([
      'Consultation 14.50',
      'Less: Government subsidy -8.70',
      'MediSave',
      'Total payable $4.20',
    ])
  })

  it('keep-list: amounts whose decimal point the reader lost, and implant lines, are shown (Yishun Health bill)', () => {
    const { keep } = planRedaction(
      lines(
        'Orthopaedic Services / Appliances 161',
        'Implant 23.011 69',
        'Non Standard Medications 504 70',
        'LAU YOONG KEE',
        'TO: Blk 123 Yishun',
      ),
    )
    expect(keep.map((k) => k.text)).toEqual([
      'Orthopaedic Services / Appliances 161',
      'Implant 23.011 69',
      'Non Standard Medications 504 70',
    ])
  })

  it('keep-list: hospital bill lines are shown; admission number, doctor and payer lines stay black', () => {
    expect(
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
    ).toEqual([
      'MERLION VALLEY GENERAL HOSPITAL',
      'Bill No : MVGH-2026-0047812',
      'Ward / Class : Ward 7B / Class C (Subsidised)',
      'Discharged : 22/10/2026 10:05',
      'Radiology - Chest X-Ray PA',
      'Less: MediShield Life Claim',
    ])
  })

  it('keep-list: personal details on a kept line are still covered', () => {
    const plan = planRedaction(lines('Date of Birth: 15/03/1948', 'Date: 01/09/2026'))
    expect(plan.keep.map((k) => k.text)).toEqual(['Date of Birth: 15/03/1948', 'Date: 01/09/2026'])
    expect(plan.hits.map((h) => h.text)).toEqual(['15/03/1948'])
  })

  // Tesseract-shaped line with a baseline from (x0, by0) to (x1, by1) and letters 30px above it.
  const line = (texts, x0, by0, x1 = x0 + 400, by1 = by0) => ({
    words: texts.map((text, i) => ({
      text,
      bbox: { x0: x0 + i * 60, y0: by0 - 30, x1: x0 + i * 60 + 50, y1: by0 },
    })),
    bbox: { x0, y0: Math.min(by0, by1) - 30, x1, y1: Math.max(by0, by1) + 6 },
    baseline: { x0, y0: by0, x1, y1: by1 },
    rowAttributes: { rowHeight: 36, descenders: 6, ascenders: 8 },
  })

  it('keep-list: a printed line the reader split into pieces (pen circles) is joined and shown as one strip', () => {
    const { keep } = planRedaction([
      line(['Take', '1'], 0, 100, 120, 100),
      line(['tab/s', '2', 'times'], 130, 99, 300, 99), // filed as a separate line, same baseline
      line(['a', 'day'], 310, 100, 400, 100),
      line(['S6925419E', 'LOW', 'YAN', 'LEE'], 0, 145), // the next printed row, 45px lower
    ])
    expect(keep.map((k) => k.text)).toEqual(['Take 1 tab/s 2 times a day'])
    expect([keep[0].band.x0, keep[0].band.x1]).toEqual([0, 400])
  })

  it('keep-list: rows on a tilted photo are told apart by their tilted baselines', () => {
    // Both rows slope up by 50px over 1000px; the name row is 45px lower all along.
    const { keep } = planRedaction([
      line(['Batch', '#:', '5DN571A', 'Expiry', 'Date:'], 0, 450, 1000, 400),
      line(['S6925419E', 'LOW', 'YAN', 'LEE'], 0, 495, 1000, 445),
      line(['Telfast'], 900, 420, 960, 420), // a print on the foil at the far end: its own row
    ])
    expect(keep.map((k) => k.text)).toEqual(['Batch #: 5DN571A Expiry Date:'])
  })
})

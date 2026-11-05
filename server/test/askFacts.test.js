// Which medicines go to the AI with a question (src/rules/askFacts.js).
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { factsFor, namedIn } from '../../src/rules/askFacts.js'

const entry = (name, extra = {}, source = 'label') => ({
  source,
  medication: {
    name,
    strength: '5 mg',
    doseAmount: 1,
    doseUnit: 'tablet',
    quantity: 30,
    timesPerDay: 1,
    timing: ['morning'],
    withFood: 'after',
    frequencyType: 'daily',
    purpose: 'blood_pressure',
    rawInstruction: 'Take 1 tablet once a day after food',
    warnings: ['May cause dizziness'],
    ...extra,
  },
})
const LIST = [entry('Metformin'), entry('Amlodipine'), entry('Dextromethorphan cough syrup')]
const names = (facts) => facts.map((f) => f.medication.name)

test('a question that names a medicine sends only that medicine, in full', () => {
  const facts = factsFor(LIST, 'Can I take Metformin on an empty stomach?')
  assert.deepEqual(names(facts), ['Metformin'])
  assert.equal(facts[0].medication.quantity, 30) // nothing trimmed from the one being asked about
  assert.deepEqual(facts[0].medication.warnings, ['May cause dizziness'])
})

test('naming is by the first word of the name, any case, and two named medicines both go', () => {
  assert.deepEqual(names(factsFor(LIST, 'METFORMIN and amlodipine together?')), [
    'Metformin',
    'Amlodipine',
  ])
  assert.deepEqual(names(namedIn(LIST, 'my cough syrup')), []) // "cough" is not the first word of the name
  assert.deepEqual(names(namedIn(LIST, 'dextromethorphan at night')), [
    'Dextromethorphan cough syrup',
  ])
  assert.deepEqual(namedIn(LIST, 'me'), []) // short words never match
})

test('a follow-up with no name is about the medicine just discussed', () => {
  assert.deepEqual(
    names(factsFor(LIST, 'and at night?', { previousQuestion: 'When do I take Amlodipine?' })),
    ['Amlodipine'],
  )
  assert.equal(
    factsFor(LIST, 'and at night?', { previousQuestion: 'How do I store medicines?' }).length,
    3,
  ) // nothing named before either
})

test('no name anywhere: everything still being taken goes, compact', () => {
  const long = entry('Etoricoxib', {
    rawInstruction: 'x'.repeat(300),
    warnings: ['w'.repeat(200), 'second', 'third', 'fourth'],
  })
  const facts = factsFor([long, ...LIST], 'What do I take in the morning?')
  assert.equal(facts.length, 4)
  const m = facts[0].medication
  assert.equal('quantity' in m, false) // neither the pack size...
  assert.equal('strength' in m, false) // ...nor the strength helps answer what / when / how
  assert.equal(m.warnings.length, 2)
  assert.ok(m.warnings.every((w) => w.length <= 80))
  assert.equal('rawInstruction' in m, false) // dose, frequency and times already say it
  assert.equal(m.name, 'Etoricoxib') // everything that answers "what / when / how much" is still there
  assert.equal(m.purpose, 'blood_pressure')
  assert.deepEqual(m.timing, ['morning'])
  assert.equal(m.doseAmount, 1)
})

test('the printed instruction is kept (shortened) when the structured fields do not say how to take it', () => {
  const vague = entry('Panadol', {
    doseAmount: null,
    frequencyType: 'as_needed',
    rawInstruction: 'Take 2 tablets when necessary for pain. '.repeat(10),
  })
  const m = factsFor([vague], 'what do I take?')[0].medication
  assert.ok(m.rawInstruction.length <= 120 && m.rawInstruction.startsWith('Take 2 tablets'))
})

test('a finished or stopped course is left out, unless the question names it', () => {
  const finished = (e) => e.medication.name === 'Amlodipine'
  assert.deepEqual(names(factsFor(LIST, 'What do I take now?', { finished })), [
    'Metformin',
    'Dextromethorphan cough syrup',
  ])
  assert.deepEqual(names(factsFor(LIST, 'I stopped Amlodipine, is that ok?', { finished })), [
    'Amlodipine',
  ])
})

test('compacting never invents a field the medicine did not have', () => {
  const typed = {
    source: 'typed',
    medication: { name: 'Panadol', rawInstruction: 'Take 2 tablets when needed' },
  }
  assert.deepEqual(factsFor([typed], 'what do I take?'), [typed])
})

test('no medicines, or only finished ones, sends an empty list (general answers only)', () => {
  assert.deepEqual(factsFor([], 'How do I store medicines?'), [])
  assert.deepEqual(factsFor(LIST, 'What do I take?', { finished: () => true }), [])
})

test('ten busy labels, compact, are well under the server limit; typed medicines keep their source', () => {
  const busy = Array.from({ length: 10 }, (_, i) =>
    entry(`Medicine${i}`, {
      rawInstruction:
        'Take 1 tablet once a day after food. Swallow whole with water. Do not crush or chew.',
      warnings: [
        'Do not use more than 7 days',
        'May cause dizziness or drowsiness. Do not drive or operate machinery.',
        'Avoid alcohol while taking this medicine',
        'Keep out of reach of children',
      ],
    }),
  )
  const full = JSON.stringify(
    busy.map(({ source, medication }) => ({ source, ...medication })),
  ).length
  const compact = JSON.stringify(factsFor(busy, 'What do I take?')).length
  assert.ok(compact < full * 0.8, `compact ${compact} vs full ${full}`)
  assert.ok(compact < 4000)
  const one = JSON.stringify(factsFor(busy, 'Medicine3 after food?')).length
  assert.ok(one < full / 8, `one medicine is ${one} characters`) // asking about one sends about a tenth
  assert.equal(factsFor([entry('Panadol', {}, 'typed')], 'when do I take it?')[0].source, 'typed')
})

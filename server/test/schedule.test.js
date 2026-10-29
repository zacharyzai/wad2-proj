// Owner: Lokesh. Schedule rules for the Schedule page and Google sync (src/rules/schedule.js). Entry shape: docs/google-contract.md.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weekOf, weekSummary, supplyDays, buildSchedule, dosesOn, doseSlots, addDays, validTime, validDays, validDate, todayInSingapore, timeInSingapore, timeStates, tooEarly, syncEntries, MAX_DAYS } from '../../src/rules/schedule.js'
import med1 from '../fixtures/med-1.json' with { type: 'json' }
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import zh from '../../src/i18n/locales/zh.json' with { type: 'json' }
import ms from '../../src/i18n/locales/ms.json' with { type: 'json' }
import ta from '../../src/i18n/locales/ta.json' with { type: 'json' }
import { medicines, rememberMedicine, setSchedule, replaceMedicine, scanFromMedicine } from '../../src/stores/medicines.js'

const med = (fields, id = 'm1') => ({ id, medication: { name: 'Metformin', strength: '500 mg', doseAmount: 1, doseUnit: 'tablet', withFood: 'after', frequencyType: 'daily', timesPerDay: 2, timing: null, ...fields } })
const times = (entry) => entry.doses.map((d) => d.time)
const ids = (entry) => entry.doses.map((d) => d.id)
const START = { startDate: '2026-10-23', days: 30 }

test('builds the exact ScheduleEntry from docs/google-contract.md', () => {
  assert.deepEqual(buildSchedule(med({ timing: ['morning', 'bedtime'] }), START), {
    medicineId: 'm1',
    label: 'Metformin 500 mg',
    instruction: { count: 1, unit: 'tablet', food: 'after' },
    doses: [{ id: 'm1-morning', time: '08:00' }, { id: 'm1-bedtime', time: '21:00' }],
    startDate: '2026-10-23',
    endDate: '2026-11-21',
    flagged: false,
  })
})

test('the sample medicine label is scheduled', () => {
  const entry = buildSchedule({ id: 'sample', medication: med1.medication }, START)
  assert.equal(entry.flagged, false)
  assert.ok(entry.doses.length > 0)
})

test('only daily medicines get times: every other frequency is flagged for the pharmacist', () => {
  for (const frequencyType of ['as_needed', 'weekly', 'tapering', 'other', null, undefined, 'hourly']) {
    const entry = buildSchedule(med({ frequencyType, timing: ['morning'] }), START)
    assert.equal(entry.flagged, true, String(frequencyType))
    assert.deepEqual(entry.doses, [], String(frequencyType))
  }
  assert.equal(buildSchedule(med({ frequencyType: 'daily' }), START).flagged, false)
})

test('timing on the label sets the slots, at fixed times, in day order', () => {
  assert.deepEqual(times(buildSchedule(med({ timing: ['bedtime', 'morning', 'evening', 'afternoon'] }), START)), ['08:00', '13:00', '18:00', '21:00'])
  assert.deepEqual(times(buildSchedule(med({ timing: ['evening'], timesPerDay: 1 }), START)), ['18:00'])
  // Unknown or repeated slots are ignored.
  assert.deepEqual(ids(buildSchedule(med({ timing: ['noon', 'morning', 'morning'] }), START)), ['m1-morning'])
})

test('no timing: times come from timesPerDay', () => {
  const expected = { 1: ['08:00'], 2: ['08:00', '21:00'], 3: ['08:00', '13:00', '21:00'], 4: ['08:00', '13:00', '18:00', '21:00'] }
  for (const [n, want] of Object.entries(expected)) {
    for (const timing of [null, []]) assert.deepEqual(times(buildSchedule(med({ timesPerDay: Number(n), timing }), START)), want)
  }
})

test('more than 4 a day, or no usable timesPerDay, is flagged rather than guessed', () => {
  for (const timesPerDay of [5, 6, 0, -1, 1.5, null, '2']) {
    const entry = buildSchedule(med({ timesPerDay }), START)
    assert.equal(entry.flagged, true, String(timesPerDay))
    assert.deepEqual(entry.doses, [])
  }
  assert.equal(doseSlots({ frequencyType: 'daily', timesPerDay: 5, timing: null }), null)
})

test('dose ids stay the same when the times, days or start date change', () => {
  const before = buildSchedule(med({ timesPerDay: 3 }), START)
  const after = buildSchedule(med({ timesPerDay: 3 }), { startDate: '2026-12-01', days: 5, times: { morning: '07:30', bedtime: '22:15' } })
  assert.deepEqual(ids(after), ids(before))
  assert.deepEqual(ids(before), ['m1-morning', 'm1-afternoon', 'm1-bedtime'])
  assert.deepEqual(times(after), ['07:30', '13:00', '22:15'])
  // Different medicines never share an id.
  assert.notDeepEqual(ids(buildSchedule(med({ timesPerDay: 3 }, 'm2'), START)), ids(before))
})

test('custom times: valid ones are used, invalid ones fall back to the usual time', () => {
  const entry = buildSchedule(med({ timesPerDay: 2 }), { ...START, times: { morning: '24:00', bedtime: '9:00', evening: '19:00' } })
  assert.deepEqual(times(entry), ['08:00', '21:00']) // evening is not one of this medicine's slots, so it is ignored
  for (const ok of ['00:00', '07:05', '23:59']) assert.equal(validTime(ok), true, ok)
  for (const bad of ['24:00', '12:60', '9:00', '0900', '', null, 900, ' 08:00']) assert.equal(validTime(bad), false, String(bad))
})

test('label and instruction: strength optional, missing fields become null', () => {
  const entry = buildSchedule(med({ strength: null, doseUnit: null, withFood: null, doseAmount: 0.5 }), START)
  assert.equal(entry.label, 'Metformin')
  assert.deepEqual(entry.instruction, { count: 0.5, unit: null, food: null })
})

test('endDate = startDate + days - 1, across a month end, a year end and leap years', () => {
  const end = (startDate, days) => buildSchedule(med({}), { startDate, days }).endDate
  assert.equal(end('2026-10-23', 1), '2026-10-23')
  assert.equal(end('2026-10-23', 30), '2026-11-21')
  assert.equal(end('2026-01-31', 1), '2026-01-31')
  assert.equal(end('2026-01-31', 2), '2026-02-01')
  assert.equal(end('2026-12-25', 10), '2027-01-03')
  assert.equal(end('2028-02-28', 2), '2028-02-29') // leap year
  assert.equal(end('2027-02-28', 2), '2027-03-01') // not a leap year
  assert.equal(end('2028-01-01', MAX_DAYS), '2028-12-31') // 366 days fills the leap year exactly
})

test('date maths ignores the computer\'s time zone', () => {
  const tz = process.env.TZ
  try {
    for (const zone of ['Asia/Singapore', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = zone
      assert.equal(addDays('2026-03-08', 1), '2026-03-09', zone) // a US daylight-saving change day
      assert.equal(addDays('2026-10-31', 1), '2026-11-01', zone)
    }
  } finally {
    if (tz === undefined) delete process.env.TZ
    else process.env.TZ = tz
  }
})

test('invalid days or start date give no endDate (the page asks for the number of days)', () => {
  for (const days of [0, -3, 1.5, MAX_DAYS + 1, '30', null, undefined, NaN]) {
    assert.equal(buildSchedule(med({}), { startDate: '2026-10-23', days }).endDate, null, String(days))
    assert.equal(validDays(days), false, String(days))
  }
  for (const startDate of ['2026-02-30', '2026-13-01', '23-10-2026', '2026-1-5', '', null]) {
    const entry = buildSchedule(med({}), { startDate, days: 10 })
    assert.deepEqual([entry.startDate, entry.endDate], [null, null], String(startDate))
    assert.equal(validDate(startDate), false, String(startDate))
  }
  assert.equal(buildSchedule(med({}), {}).endDate, null)
})

test('dosesOn: only entries running that day, earliest first, flagged ones never', () => {
  const entries = [
    buildSchedule(med({ name: 'Amlodipine', strength: null, timing: ['bedtime', 'morning'] }, 'a'), { startDate: '2026-10-20', days: 7 }),
    buildSchedule(med({ timing: ['afternoon', 'morning'] }, 'b'), { startDate: '2026-10-26', days: 3 }),
    buildSchedule(med({ frequencyType: 'as_needed' }, 'c'), { startDate: '2026-10-20', days: 30 }),
    buildSchedule(med({}, 'd'), { startDate: '2026-10-20' }), // no number of days yet
  ]
  assert.deepEqual(dosesOn(entries, '2026-10-26').map((d) => d.id), ['a-morning', 'b-morning', 'b-afternoon', 'a-bedtime'])
  assert.deepEqual(dosesOn(entries, '2026-10-26')[0], { id: 'a-morning', slot: 'morning', time: '08:00', medicineId: 'a', label: 'Amlodipine', instruction: { count: 1, unit: 'tablet', food: 'after' } })
  // First and last days count; the day after doesn't.
  assert.deepEqual(dosesOn(entries, '2026-10-20').map((d) => d.id), ['a-morning', 'a-bedtime'])
  assert.deepEqual(dosesOn(entries, '2026-10-28').map((d) => d.id), ['b-morning', 'b-afternoon'])
  assert.deepEqual(dosesOn(entries, '2026-10-29'), [])
  assert.deepEqual(dosesOn(entries, 'today'), [])
  assert.deepEqual(dosesOn([], '2026-10-26'), [])
})

test('todayInSingapore uses Singapore time, not the device time zone', () => {
  // 2026-10-27 17:30 UTC is already 28 Oct 01:30 in Singapore.
  assert.equal(todayInSingapore(new Date('2026-10-27T17:30:00Z')), '2026-10-28')
  assert.equal(todayInSingapore(new Date('2026-10-27T15:59:00Z')), '2026-10-27')
})

test('the Schedule page has every text in all four languages, with the same {placeholders}', () => {
  const flat = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]))
  // Which {names} appear, not how often: plural forms ("{n} dose | {n} doses") may repeat one.
  const placeholders = (text) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()
  const english = Object.fromEntries(flat(en.schedule))
  for (const [lang, messages] of Object.entries({ zh, ms, ta })) {
    const other = Object.fromEntries(flat(messages.schedule ?? {}))
    assert.deepEqual(Object.keys(other).sort(), Object.keys(english).sort(), lang)
    for (const [key, text] of Object.entries(english)) assert.deepEqual(placeholders(other[key]), placeholders(text), `${lang} schedule.${key}`)
  }
})

test('syncEntries: every entry goes to Google sync in a shape the server accepts', async () => {
  const { checkEntries } = await import('../services/google.js')
  const entries = [
    buildSchedule(med({}, 'a'), { startDate: '2026-10-23', days: 30 }),
    buildSchedule(med({}, 'b'), {}), // no number of days yet
    buildSchedule(med({ frequencyType: 'as_needed' }, 'c'), {}),
    buildSchedule(med({ name: 'X'.repeat(120) }, 'd'), { startDate: '2026-10-23', days: 5 }),
  ]
  const sent = syncEntries(entries, '2026-10-28')
  const { entries: checked, error } = checkEntries(JSON.parse(JSON.stringify(sent)))
  assert.equal(error, undefined)
  assert.deepEqual(checked.map((e) => [e.medicineId, e.startDate, e.endDate, e.flagged]), [
    ['a', '2026-10-23', '2026-11-21', false],
    ['b', '2026-10-28', null, false],
    ['c', '2026-10-28', null, true],
    ['d', '2026-10-23', '2026-10-27', false],
  ])
  assert.equal(checked[3].label.length, 80)
  assert.deepEqual(checked[0].doses, entries[0].doses)
})

test('the medicine list keeps ids and schedules, and a typed name never replaces a checked label', () => {
  medicines.splice(0)
  const label = { name: 'Panadol', strength: null, doseAmount: 2, doseUnit: 'tablet', frequencyType: 'daily', timesPerDay: 2, timing: null }
  rememberMedicine(label, 'label')
  const { id } = medicines[0]
  setSchedule(id, { startDate: todayInSingapore(), days: 5, times: {} }) // still running (an ended one restarts: see the refill test)

  // Typed in Ask with the same name: the label (and so its timetable and Google reminders) stays.
  rememberMedicine({ name: 'panadol', rawInstruction: 'for pain' }, 'typed')
  assert.equal(medicines.length, 1)
  assert.deepEqual([medicines[0].source, medicines[0].medication.frequencyType], ['label', 'daily'])

  // Re-scanned label: new instructions, same id and schedule, so dose ids, ticks and events carry on.
  rememberMedicine({ ...label, timesPerDay: 3 }, 'label')
  assert.deepEqual([medicines[0].id, medicines[0].medication.timesPerDay, medicines[0].schedule.days], [id, 3, 5])
  assert.deepEqual(buildSchedule(medicines[0], medicines[0].schedule).doses.map((d) => d.id), [`${id}-morning`, `${id}-afternoon`, `${id}-bedtime`])
  medicines.splice(0)
})

test('Fix what we read: the corrected details replace the same medicine, keeping its id, schedule and dose ids', () => {
  medicines.splice(0)
  rememberMedicine({ name: 'Lipitor', rawInstruction: 'one at night' }, 'typed') // typed in Ask: name and words only
  rememberMedicine({ name: 'Panadol', strength: null, doseAmount: 2, doseUnit: 'tablet', frequencyType: 'as_needed', timesPerDay: null, timing: null, warnings: [] }, 'label', true)
  const [panadol, lipitor] = medicines
  setSchedule(panadol.id, { startDate: '2026-10-23', days: 5, times: { morning: '07:30' } })

  // Opened on Confirm: every contract field present, nothing extra flagged, and which medicine to replace.
  const scan = scanFromMedicine(lipitor)
  assert.deepEqual(scan.medication, { name: 'Lipitor', strength: null, doseAmount: null, doseUnit: null, quantity: null, timesPerDay: null, timing: null, withFood: null, frequencyType: null, rawInstruction: 'one at night', warnings: [] })
  assert.deepEqual([scan.type, scan.source, scan.unclear, scan.savedId], ['medication', 'typed', [], lipitor.id])
  assert.equal(scanFromMedicine(panadol).source, 'sample')

  // "When needed" was a misread: now daily. Same id, schedule and sample flag; now scheduled, with the custom time kept.
  replaceMedicine(panadol.id, { ...scanFromMedicine(panadol).medication, frequencyType: 'daily', timesPerDay: 2 })
  const fixed = medicines.find((m) => m.id === panadol.id)
  assert.deepEqual([fixed.source, fixed.sample, fixed.schedule.days], ['label', true, 5])
  const entry = buildSchedule(fixed, fixed.schedule)
  assert.deepEqual([entry.flagged, entry.doses], [false, [{ id: `${panadol.id}-morning`, time: '07:30' }, { id: `${panadol.id}-bedtime`, time: '21:00' }]])

  // Name corrected into another saved medicine's name: the one being fixed stays (with its schedule), the copy goes.
  replaceMedicine(lipitor.id, { ...scanFromMedicine(lipitor).medication, name: 'panadol' })
  assert.deepEqual(medicines.map((m) => m.id), [lipitor.id])

  // Removed in the meantime: added again rather than lost.
  medicines.splice(0)
  replaceMedicine('gone', { name: 'Aspirin', warnings: [] })
  assert.deepEqual(medicines.map((m) => [m.medication.name, m.source]), [['Aspirin', 'label']])
  medicines.splice(0)
})

test('timeStates: which dose times are done with, due now, or still to come', () => {
  const day = ['08:00', '13:00', '18:00', '21:00']
  const at = (now) => timeStates(day, now).join(' ')
  assert.equal(at('05:00'), 'later later later later')
  assert.equal(at('06:59'), 'later later later later')
  assert.equal(at('07:00'), 'now later later later') // an hour before 8:00
  assert.equal(at('11:59'), 'now later later later')
  assert.equal(at('12:00'), 'earlier now later later') // an hour before 13:00: morning is over
  assert.equal(at('17:00'), 'earlier earlier now later')
  assert.equal(at('20:30'), 'earlier earlier earlier now')
  assert.equal(at('23:59'), 'earlier earlier earlier now') // the last one lasts until midnight
  // Two close times: each is "now" at its own time, so both can be at once.
  assert.equal(timeStates(['08:00', '08:30'], '08:00').join(' '), 'now now')
  assert.equal(timeStates(['08:00', '08:30'], '08:40').join(' '), 'earlier now')
  assert.deepEqual(timeStates([], '08:00'), [])
})

test('tooEarly: more than 2 hours before the dose time', () => {
  assert.equal(tooEarly('21:00', '08:00'), true)
  assert.equal(tooEarly('21:00', '18:59'), true)
  assert.equal(tooEarly('21:00', '19:00'), false) // exactly 2 hours: fine
  assert.equal(tooEarly('08:00', '20:00'), false) // late is never "too early"
})

test('timeInSingapore uses Singapore time, not the device time zone', () => {
  assert.equal(timeInSingapore(new Date('2026-10-27T17:30:00Z')), '01:30')
  assert.equal(timeInSingapore(new Date('2026-10-27T00:05:00Z')), '08:05')
  assert.equal(timeInSingapore(new Date('2026-10-27T15:59:00Z')), '23:59')
})

test('This week: Monday to Sunday; each time of day is taken, missed (time passed, not all ticked) or coming up', () => {
  assert.deepEqual(weekOf('2026-10-28'), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
  assert.equal(weekOf('2026-11-01')[0], '2026-10-26') // a Sunday belongs to the week before
  const medicine = { id: 'm1', medication: { name: 'Metformin', strength: '500 mg', frequencyType: 'daily', timesPerDay: 2, doseAmount: 1 } }
  const entries = [buildSchedule(medicine, { startDate: '2026-10-27', days: 30 })] // starts on Tuesday
  const ticks = { '2026-10-27': ['m1-morning'], '2026-10-28': ['m1-morning'] }
  const week = weekSummary(entries, '2026-10-28', '14:00', (date) => new Set(ticks[date] ?? []))
  assert.deepEqual(week.rows.map((r) => [r.slot, r.cells.map((c) => c.state)]), [
    ['morning', ['none', 'ok', 'ok', 'up', 'up', 'up', 'up']],
    ['bedtime', ['none', 'miss', 'up', 'up', 'up', 'up', 'up']], // tonight's 9 pm hasn't come yet
  ])
  assert.deepEqual([week.done, week.due], [2, 3])
  assert.deepEqual(week.missed, [{ date: '2026-10-27', slot: 'bedtime', time: '21:00', label: 'Metformin 500 mg' }])
  // The day's last time stays due until midnight, as on Today ("Take now"); a day still loading (null) counts nothing as taken.
  const late = weekSummary(entries, '2026-10-28', '23:30', (date) => (date === '2026-10-27' ? null : new Set(ticks[date] ?? [])))
  assert.deepEqual(late.rows.map((r) => r.cells[1].state), ['miss', 'miss'])
  assert.equal(late.rows[1].cells[2].state, 'up')
})

test('how long a pack lasts: quantity ÷ (amount each time × times a day), whole days only, never guessed', () => {
  const daily = { frequencyType: 'daily', doseAmount: 1, timesPerDay: 2 }
  assert.equal(supplyDays({ ...daily, quantity: 60 }), 30) // "Qty: 60 tablets, 1 tablet twice a day"
  assert.equal(supplyDays({ ...daily, quantity: 31 }), 15) // the spare tablet doesn't make a 16th day
  assert.equal(supplyDays({ frequencyType: 'daily', doseAmount: 5, timing: ['morning', 'afternoon', 'bedtime'], quantity: 100 }), 6) // syrup, ml
  assert.equal(supplyDays({ frequencyType: 'daily', doseAmount: 0.5, timesPerDay: 1, quantity: 30 }), 60) // half a tablet
  assert.equal(supplyDays({ frequencyType: 'daily', doseAmount: 0.1, timesPerDay: 1, quantity: 0.3 }), 3) // no floating-point slip to 2
  // Nothing to go on, not daily, or not even a day's worth: no number, so Schedule asks instead.
  for (const m of [{ ...daily, quantity: null }, { ...daily, quantity: 60, doseAmount: null }, { frequencyType: 'as_needed', doseAmount: 2, quantity: 20 }, { ...daily, doseAmount: 2, quantity: 3 }]) assert.equal(supplyDays(m), null)
})

test('a checked label with a quantity goes on the timetable from today for as long as it lasts; one without waits for days', () => {
  medicines.splice(0)
  rememberMedicine({ name: 'Metformin', strength: '500 mg', doseAmount: 1, doseUnit: 'tablet', quantity: 60, frequencyType: 'daily', timesPerDay: 2, warnings: [] }, 'label')
  rememberMedicine({ name: 'Amlodipine', strength: '5 mg', doseAmount: 1, doseUnit: 'tablet', quantity: null, frequencyType: 'daily', timesPerDay: 1, warnings: [] }, 'label')
  const [amlodipine, metformin] = medicines
  assert.deepEqual(metformin.schedule, { startDate: todayInSingapore(), days: 30, times: {} })
  assert.equal(amlodipine.schedule, undefined)
  // Scanning the same label again while the course is still running keeps the days already set (and its ticks and reminders).
  setSchedule(metformin.id, { startDate: addDays(todayInSingapore(), -10), days: 45, times: {} })
  rememberMedicine({ name: 'Metformin', strength: '500 mg', doseAmount: 1, doseUnit: 'tablet', quantity: 90, frequencyType: 'daily', timesPerDay: 2, warnings: [] }, 'label')
  assert.equal(medicines[0].schedule.days, 45)
})

test('a refill: re-scanning a medicine whose course has ended starts it again from today, keeping changed times and its id', () => {
  medicines.splice(0)
  const label = (quantity) => ({ name: 'Metformin', strength: '500 mg', doseAmount: 1, doseUnit: 'tablet', quantity, frequencyType: 'daily', timesPerDay: 2, warnings: [] })
  const today = todayInSingapore()
  rememberMedicine(label(60), 'label')
  const { id } = medicines[0]
  setSchedule(id, { startDate: addDays(today, -40), days: 30, times: { morning: '07:30' } }) // ended 11 days ago

  // The new pack says how much: back on the timetable from today, for as long as it lasts.
  rememberMedicine(label(60), 'label')
  assert.deepEqual(medicines[0].schedule, { startDate: today, days: 30, times: { morning: '07:30' } })
  assert.equal(medicines[0].id, id) // same doses, so tick history and calendar events stay linked
  assert.equal(buildSchedule(medicines[0], medicines[0].schedule).endDate, addDays(today, 29))

  // Ended, and the new label doesn't say how much: Schedule asks for the days again (no end date), times kept.
  setSchedule(id, { startDate: addDays(today, -40), days: 30, times: { morning: '07:30' } })
  rememberMedicine(label(null), 'label')
  assert.deepEqual(medicines[0].schedule, { times: { morning: '07:30' } })
  assert.equal(buildSchedule(medicines[0], medicines[0].schedule).endDate, null)

  // The last day of a course still counts as running: nothing restarts early.
  setSchedule(id, { startDate: addDays(today, -29), days: 30, times: {} })
  rememberMedicine(label(60), 'label')
  assert.equal(medicines[0].schedule.startDate, addDays(today, -29))
})

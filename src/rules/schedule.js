// Owner: Lokesh. Schedule rules: a saved medicine becomes the dose times shown on the Schedule page and sent to Google Calendar.
// Pure functions with no Vue, so server/test/schedule.test.js can test them. Our own rules, never AI.
// Only "daily" medicines are scheduled. Anything else (when necessary, weekly, tapering, other, unknown) is flagged for the
// pharmacist and gets no times: we never guess a timetable the label doesn't give.
//
// buildSchedule(medicine, { startDate, days, times }) returns one ScheduleEntry (docs/google-contract.md):
//   { medicineId, label, instruction: { count, unit, food }, doses: [{ id, time }], startDate, endDate, flagged }
//
// Dates are 'YYYY-MM-DD' strings in Singapore time and times are 'HH:MM'. Date maths runs on UTC midnights, so the
// computer's own time zone can never shift a day.
import { TIMINGS } from '../../server/services/normalizeScan.js'

export const MAX_DAYS = 366 // same limit as Google sync
export const SLOT_TIMES = { morning: '08:00', afternoon: '13:00', evening: '18:00', bedtime: '21:00' }
// Labels that only say "N times a day": the slots we use for each N. More than 4 a day is unusual, so a pharmacist checks it.
export const SLOTS_PER_DAY = {
  1: ['morning'],
  2: ['morning', 'bedtime'],
  3: ['morning', 'afternoon', 'bedtime'],
  4: ['morning', 'afternoon', 'evening', 'bedtime'],
}

export const validTime = (time) => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
export const validDays = (days) => Number.isInteger(days) && days >= 1 && days <= MAX_DAYS

const parseDate = (date) => {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const [y, m, d] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  // Rejects dates that don't exist, such as 2026-02-30 (Date would roll it over to March).
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d ? utc : null
}
const formatDate = (utc) =>
  [utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate()].map((n, i) => String(n).padStart(i ? 2 : 4, '0')).join('-')

export const validDate = (date) => parseDate(date) !== null

export function addDays(date, n) {
  const utc = parseDate(date)
  if (!utc) return null
  utc.setUTCDate(utc.getUTCDate() + n)
  return formatDate(utc)
}

// Today's date in Singapore, whatever time zone the device is set to.
export function todayInSingapore(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// The time in Singapore as 'HH:MM', whatever time zone the device is set to.
export function timeInSingapore(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
}
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

// Today's list highlights where the person is in their day, so a later dose isn't taken by mistake.
// For the day's dose times (sorted), each is 'earlier', 'now' or 'later' at time `now`. A time is "now" from NOW_LEAD_MIN
// before it until the next time's "now" starts (the last one: until midnight), and always includes its own time, so two
// close times can both be "now". Times are 'HH:MM'.
export const NOW_LEAD_MIN = 60
export function timeStates(times, now) {
  const at = minutes(now)
  return times.map((time, i) => {
    const start = minutes(time) - NOW_LEAD_MIN
    const end = i + 1 < times.length ? Math.max(minutes(times[i + 1]) - NOW_LEAD_MIN, minutes(time) + 1) : 24 * 60
    return at < start ? 'later' : at >= end ? 'earlier' : 'now'
  })
}

// Ticking a dose more than this long before its time asks "Have you already taken it?" first.
export const EARLY_MIN = 120
export const tooEarly = (time, now) => minutes(time) - minutes(now) > EARLY_MIN

// The slots a medicine is taken at, or null when it can't be scheduled safely.
export function doseSlots(medication = {}) {
  if (medication.frequencyType !== 'daily') return null
  const timing = Array.isArray(medication.timing) ? TIMINGS.filter((slot) => medication.timing.includes(slot)) : []
  if (timing.length) return timing
  // Integer check first: object keys are strings, so SLOTS_PER_DAY['2'] would otherwise match.
  return Number.isInteger(medication.timesPerDay) ? SLOTS_PER_DAY[medication.timesPerDay] ?? null : null
}

export function buildSchedule(medicine, { startDate, days, times = {} } = {}) {
  const medication = medicine?.medication ?? {}
  const slots = doseSlots(medication)
  const start = validDate(startDate) ? startDate : null
  return {
    medicineId: medicine.id,
    label: [medication.name, medication.strength].filter(Boolean).join(' '),
    instruction: { count: medication.doseAmount ?? null, unit: medication.doseUnit ?? null, food: medication.withFood ?? null },
    // The id is the medicine plus the slot, never a position, so editing a time updates the same Google event and keeps its ticks.
    // An invalid typed time falls back to the slot's usual time; the page checks with validTime before saving.
    doses: (slots ?? []).map((slot) => ({ id: `${medicine.id}-${slot}`, time: validTime(times?.[slot]) ? times[slot] : SLOT_TIMES[slot] })),
    startDate: start,
    endDate: start && validDays(days) ? addDays(start, days - 1) : null,
    flagged: slots === null,
  }
}

// What POST /api/google/sync gets: every entry, flagged ones too (the server skips those itself). The server needs a real
// startDate and a label of at most 80 characters on every entry, even ones it skips, or it refuses the whole schedule.
export const LABEL_MAX = 80
export function syncEntries(entries, today) {
  return entries.map((e) => ({ ...e, label: e.label.slice(0, LABEL_MAX), startDate: e.startDate ?? today }))
}

// That day's doses across all entries, earliest first. Flagged entries and entries without both dates are left out.
// `slot` (morning, afternoon...) is read back from the id, for the page's "Morning" heading.
export function dosesOn(entries, date) {
  if (!validDate(date)) return []
  return entries
    .filter((e) => !e.flagged && e.startDate && e.endDate && e.startDate <= date && date <= e.endDate)
    .flatMap((e) => e.doses.map((dose) => ({ id: dose.id, slot: dose.id.slice(e.medicineId.length + 1), time: dose.time, medicineId: e.medicineId, label: e.label, instruction: e.instruction })))
    .sort((a, b) => a.time.localeCompare(b.time) || a.label.localeCompare(b.label))
}

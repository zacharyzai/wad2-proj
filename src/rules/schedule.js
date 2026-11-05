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
const SLOT_TIMES = { morning: '08:00', afternoon: '13:00', evening: '18:00', bedtime: '21:00' }
// Labels that only say "N times a day": the slots we use for each N. More than 4 a day is unusual, so a pharmacist checks it.
const SLOTS_PER_DAY = {
  1: ['morning'],
  2: ['morning', 'bedtime'],
  3: ['morning', 'afternoon', 'bedtime'],
  4: ['morning', 'afternoon', 'evening', 'bedtime'],
}

// True for a 24-hour "HH:MM" time.
export const validTime = (time) =>
  typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
// True for a whole number of days from 1 to the maximum.
export const validDays = (days) => Number.isInteger(days) && days >= 1 && days <= MAX_DAYS

// A YYYY-MM-DD string as a UTC date, or null if it is not a real date.
const parseDate = (date) => {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const [y, m, d] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  // Rejects dates that don't exist, such as 2026-02-30 (Date would roll it over to March).
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d
    ? utc
    : null
}
// A UTC date back to YYYY-MM-DD.
const formatDate = (utc) =>
  [utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate()]
    .map((n, i) => String(n).padStart(i ? 2 : 4, '0'))
    .join('-')

// True for a real YYYY-MM-DD date.
export const validDate = (date) => parseDate(date) !== null

// The date n days after (or before, if negative) the given YYYY-MM-DD date.
export function addDays(date, n) {
  const utc = parseDate(date)
  if (!utc) return null
  utc.setUTCDate(utc.getUTCDate() + n)
  return formatDate(utc)
}

// "I don't need this any more": the course ends now. Its last day becomes yesterday, so today's reminders stop at once and the
// days already taken stay on record. A course that only started today ends today (it can't end before it starts).
export function stopCourse(schedule, today) {
  if (!schedule || !validDate(schedule.startDate) || !validDate(today)) return null
  const daysSoFar = Math.round((parseDate(today) - parseDate(schedule.startDate)) / 86_400_000) // start..yesterday, counted in days
  return { ...schedule, days: Math.max(1, daysSoFar) }
}

// Today's date in Singapore, whatever time zone the device is set to.
export function todayInSingapore(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

// The time in Singapore as 'HH:MM', whatever time zone the device is set to.
export function timeInSingapore(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now)
}
// "HH:MM" as minutes since midnight, for comparing times.
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

// Today's list highlights where the person is in their day, so a later dose isn't taken by mistake.
// For the day's dose times (sorted), each is 'earlier', 'now' or 'later' at time `now`. A time is "now" from NOW_LEAD_MIN
// before it until the next time's "now" starts (the last one: until midnight), and always includes its own time, so two
// close times can both be "now". Times are 'HH:MM'.
const NOW_LEAD_MIN = 60
// Marks each dose time earlier, now or later than the current time.
export function timeStates(times, now) {
  const at = minutes(now)
  return times.map((time, i) => {
    const start = minutes(time) - NOW_LEAD_MIN
    const end =
      i + 1 < times.length
        ? Math.max(minutes(times[i + 1]) - NOW_LEAD_MIN, minutes(time) + 1)
        : 24 * 60
    return at < start ? 'later' : at >= end ? 'earlier' : 'now'
  })
}

// Ticking a dose more than this long before its time asks "Have you already taken it?" first.
const EARLY_MIN = 120
// True when a dose is still far enough away that ticking it now is probably a mix-up.
export const tooEarly = (time, now) => minutes(time) - minutes(now) > EARLY_MIN

// The slots a medicine is taken at, or null when it can't be scheduled safely.
export function doseSlots(medication = {}) {
  if (medication.frequencyType !== 'daily') return null
  const timing = Array.isArray(medication.timing)
    ? TIMINGS.filter((slot) => medication.timing.includes(slot))
    : []
  if (timing.length) return timing
  // Integer check first: object keys are strings, so SLOTS_PER_DAY['2'] would otherwise match.
  return Number.isInteger(medication.timesPerDay)
    ? (SLOTS_PER_DAY[medication.timesPerDay] ?? null)
    : null
}

// A label warning like "Do not use more than 7 days" or "for up to 2 weeks" limits the course, however many tablets there are.
// Our own pattern (English labels, like the rest of the label text); the smallest limit wins; null when no warning gives one.
// shortcut: only these phrasings; a limit worded another way is not caught, so the user still checks the days on Schedule.
const LIMIT =
  /\b(?:more than|longer than|beyond|exceed(?:ing)?|up to|at most|maximum(?: of)?|max\.?(?: of)?)\s+(\d{1,3})\s*(day|week)s?\b/i
// The longest course the label allows ("not more than 7 days"), or null.
export function labelLimitDays(medication = {}) {
  const limits = (medication.warnings ?? [])
    .map((w) => LIMIT.exec(String(w)))
    .filter(Boolean)
    .map((m) => Number(m[1]) * (/week/i.test(m[2]) ? 7 : 1))
    .filter(validDays)
  return limits.length ? Math.min(...limits) : null
}

// How many whole days the medicine given lasts: quantity ÷ (amount each time × times a day). "Qty: 60 tablets, 1 tablet twice a
// day" -> 30. A spare part-day is dropped, so it never promises more than there is. null when the label leaves anything out,
// the medicine isn't daily, or it wouldn't last a day. Shown with its sums (supplyText), and the user can change the days.
export function packDays(medication = {}) {
  const perDay = doseSlots(medication)?.length
  const { quantity, doseAmount } = medication
  if (!perDay || !(quantity > 0) || !(doseAmount > 0)) return null
  const days = Math.floor(quantity / (doseAmount * perDay) + 1e-9) // 1e-9: 0.3 ÷ 0.1 is 2.9999999999999996 in floating point
  return validDays(days) ? days : null
}

// What goes on the timetable: as long as the pack lasts, but never past a limit the label gives ("not more than 7 days").
export function supplyDays(medication = {}) {
  const days = packDays(medication)
  const limit = labelLimitDays(medication)
  return days && limit ? Math.min(days, limit) : days
}

// Builds a medicine's timetable from its confirmed label data by fixed rules (no AI). Null when the instruction is non-standard.
export function buildSchedule(medicine, { startDate, days, times = {} } = {}) {
  const medication = medicine?.medication ?? {}
  const slots = doseSlots(medication)
  const start = validDate(startDate) ? startDate : null
  return {
    medicineId: medicine.id,
    label: [medication.name, medication.strength].filter(Boolean).join(' '),
    instruction: {
      count: medication.doseAmount ?? null,
      unit: medication.doseUnit ?? null,
      food: medication.withFood ?? null,
    },
    // The id is the medicine plus the slot, never a position, so editing a time updates the same Google event and keeps its ticks.
    // An invalid typed time falls back to the slot's usual time; the page checks with validTime before saving.
    doses: (slots ?? []).map((slot) => ({
      id: `${medicine.id}-${slot}`,
      time: validTime(times?.[slot]) ? times[slot] : SLOT_TIMES[slot],
    })),
    startDate: start,
    endDate: start && validDays(days) ? addDays(start, days - 1) : null,
    flagged: slots === null,
  }
}

// What POST /api/google/sync gets: every entry, flagged ones too (the server skips those itself). The server needs a real
// startDate and a label of at most 80 characters on every entry, even ones it skips, or it refuses the whole schedule.
const LABEL_MAX = 80
// Fills in what the server insists on: a label cut to the limit and a start date (today when there is none).
export function syncEntries(entries, today) {
  return entries.map((e) => ({
    ...e,
    label: e.label.slice(0, LABEL_MAX),
    startDate: e.startDate ?? today,
  }))
}

// That day's doses across all entries, earliest first. Flagged entries and entries without both dates are left out.
// `slot` (morning, afternoon...) is read back from the id, for the page's "Morning" heading.
export function dosesOn(entries, date) {
  if (!validDate(date)) return []
  return entries
    .filter(
      (e) => !e.flagged && e.startDate && e.endDate && e.startDate <= date && date <= e.endDate,
    )
    .flatMap((e) =>
      e.doses.map((dose) => ({
        id: dose.id,
        slot: dose.id.slice(e.medicineId.length + 1),
        time: dose.time,
        medicineId: e.medicineId,
        label: e.label,
        instruction: e.instruction,
      })),
    )
    .sort((a, b) => a.time.localeCompare(b.time) || a.label.localeCompare(b.label))
}

// Sunday to Saturday of the week `date` is in, as on a calendar on the wall (Singapore days, as everywhere here).
export function weekOf(date) {
  const sunday = addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay())
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i))
}

// The week at a glance (Schedule, This week). One row per medicine and time of day ("Metformin 500 mg, Morning"), so a
// dose never hides behind another one taken at the same time. A cell per day says how that one dose went:
// 'ok' ticked, 'not' its time has passed with no tick, 'now' today's dose that is due ("Take now"), 'later' not due yet,
// 'none' not on the timetable that day. Today uses Today's own times (timeStates): a dose is 'now' from an hour before
// its time until the next time's hour before (the day's last: until midnight), then 'not', when Today says "Not ticked yet".
// takenOn(date) gives that day's ticked dose ids (a Set), or null while unknown.
// notTicked lists each 'not' dose, oldest first; anyPassed says whether any dose's time has come yet this week.
export function weekSummary(entries, today, now, takenOn) {
  const days = weekOf(today)
  const todayTimes = [...new Set(dosesOn(entries, today).map((d) => d.time))]
  const todayState = new Map(todayTimes.map((time, i) => [time, timeStates(todayTimes, now)[i]]))
  const perDay = days.map((date) => ({ date, doses: dosesOn(entries, date), taken: takenOn(date) }))
  const found = new Map()
  for (const { doses } of perDay)
    for (const d of doses)
      if (!found.has(d.id))
        found.set(d.id, {
          id: d.id,
          medicineId: d.medicineId,
          slot: d.slot,
          time: d.time,
          label: d.label,
        })
  const notTicked = []
  let anyPassed = false
  const rows = [...found.values()]
    .sort((a, b) => a.time.localeCompare(b.time) || a.label.localeCompare(b.label))
    .map((row) => ({
      ...row,
      cells: perDay.map(({ date, doses, taken }) => {
        if (!doses.some((d) => d.id === row.id)) return { date, state: 'none' }
        if (taken?.has(row.id)) {
          anyPassed = true
          return { date, state: 'ok' }
        }
        const when = date < today ? 'earlier' : date > today ? 'later' : todayState.get(row.time)
        if (when !== 'earlier') return { date, state: when }
        anyPassed = true
        notTicked.push({ date, id: row.id, slot: row.slot, time: row.time, label: row.label })
        return { date, state: 'not' }
      }),
    }))
  notTicked.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      a.label.localeCompare(b.label),
  )
  return { days, rows, notTicked, anyPassed }
}

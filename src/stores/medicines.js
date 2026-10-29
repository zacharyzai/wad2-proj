// The user's medicines, so Ask can answer about what they actually take and Schedule can lay out their doses.
// Extracted text only (contract fields), never photos.
// shortcut: kept in this browser only; move to the user's account (Sheen Hern's history API) once login exists.
import { reactive, toRaw, watch } from 'vue'
import { addDays, supplyDays, todayInSingapore } from '../rules/schedule.js'

const KEY = 'medicines'
const MAX = 10 // same limit as the server

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(list) ? list.filter((m) => m?.medication?.name) : []
  } catch {
    return [] // storage blocked or corrupted: start empty
  }
}

// [{ id, source: 'label' | 'typed', sample, medication, schedule? }], newest first.
// schedule = { startDate, days, times: { slot: 'HH:MM' } }, set on the Schedule page (src/rules/schedule.js reads it).
export const medicines = reactive(load())

watch(medicines, (list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Not critical: the list just won't survive a reload.
  }
})

// A label that says how much was given ("Qty: 60 tablets") goes straight onto the timetable from today, for as long as it
// lasts (supplyDays: our own sums, shown on Schedule, and the days can be changed there). Otherwise Schedule asks.
const fromLabel = (medication) => {
  const days = supplyDays(medication)
  return days ? { schedule: { startDate: todayInSingapore(), days, times: {} } } : {}
}

// Re-scanning a label: a course still running carries on (same days, so its ticks and reminders do too). One that has
// ended is a refill: it starts again from today, from the new label (or Schedule asks how many days). Changed times stay.
const ended = (schedule) => Boolean(schedule?.days) && addDays(schedule.startDate, schedule.days - 1) < todayInSingapore()
function scheduleFor(previous, medication) {
  if (previous?.schedule && !ended(previous.schedule)) return { schedule: previous.schedule }
  const times = previous?.schedule?.times ?? {}
  const fresh = fromLabel(medication).schedule
  return fresh ? { schedule: { ...fresh, times } } : previous?.schedule ? { schedule: { times } } : {}
}

const same = (a, b) => a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && (a.strength ?? '') === (b.strength ?? '')

// Re-adding a medicine replaces the old entry, so a re-scanned label updates its instructions.
// It keeps the old id, and the schedule while the course is still running (scheduleFor), so ticks and calendar events carry on.
// A name typed in Ask never replaces a checked label: that would drop its daily instructions, and so its timetable.
export function rememberMedicine(medication, source, sample = false) {
  const copy = structuredClone(toRaw(medication))
  const old = medicines.findIndex((m) => same(m.medication, copy))
  if (old !== -1 && source === 'typed' && medicines[old].source === 'label') return
  const previous = old === -1 ? null : medicines.splice(old, 1)[0]
  medicines.unshift({
    id: previous?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    source,
    sample,
    medication: copy,
    ...scheduleFor(previous, copy),
  })
  medicines.splice(MAX)
}

// "Fix what we read" (Schedule → Confirm): the corrected details replace that medicine in place. Same id, schedule and
// sample flag, so its ticks and calendar reminders carry on, even when the name itself was corrected.
// Checked on Confirm, so it counts as a checked label from now on (a typed medicine becomes one too).
export function replaceMedicine(id, medication) {
  const copy = structuredClone(toRaw(medication))
  const index = medicines.findIndex((m) => m.id === id)
  if (index === -1) return rememberMedicine(copy, 'label') // removed meanwhile: add it again
  const entry = medicines[index]
  entry.medication = copy
  entry.source = 'label'
  if (!entry.schedule?.days) Object.assign(entry, fromLabel(copy)) // e.g. "when needed" fixed to twice a day: now it has days
  // Corrected into the name of another saved medicine: keep this one (it has the schedule being fixed), drop the copy.
  for (let i = medicines.length - 1; i >= 0; i--) if (i !== medicines.indexOf(entry) && same(medicines[i].medication, copy)) medicines.splice(i, 1)
}

// What Confirm needs to open a saved medicine: every contract field present (typed ones have only a name and
// instructions), nothing to flag beyond the usual required fields, no photo, and `savedId` saying which one to replace.
export function scanFromMedicine(entry) {
  const blank = { name: null, strength: null, doseAmount: null, doseUnit: null, quantity: null, timesPerDay: null, timing: null, withFood: null, frequencyType: null, rawInstruction: null, warnings: [] }
  return { type: 'medication', source: entry.sample ? 'sample' : entry.source, unclear: [], medication: { ...blank, ...structuredClone(toRaw(entry.medication)) }, savedId: entry.id }
}

// Schedule page: how many days, from when, and any times the user changed.
export function setSchedule(id, schedule) {
  const entry = medicines.find((m) => m.id === id)
  if (entry) entry.schedule = structuredClone(toRaw(schedule))
}

// Returns what was removed and where, so the page can offer Undo.
export function forgetMedicine(id) {
  const index = medicines.findIndex((m) => m.id === id)
  return index === -1 ? null : { entry: medicines.splice(index, 1)[0], index }
}

export function restoreMedicine({ entry, index }) {
  if (!medicines.some((m) => m.id === entry.id)) medicines.splice(index, 0, entry)
}

import { reactive, toRaw, watch } from 'vue'
import { defineStore } from 'pinia'
import { addDays, labelLimitDays, supplyDays, todayInSingapore } from '../rules/schedule.js'

const KEY = 'medicines'
const MAX = 10 // same limit as the server

// The medicines saved on this device; entries without a name are dropped.
function load() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(list) ? list.filter((m) => m?.medication?.name) : []
  } catch {
    return [] // storage blocked or corrupted: start empty
  }
}

// A label that says how much was given ("Qty: 60 tablets") goes straight onto the timetable from today, for as long as it
// lasts (supplyDays: our own sums, shown on Schedule, and the days can be changed there). Otherwise Schedule asks.
const fromLabel = (medication) => {
  const days = supplyDays(medication)
  return days ? { schedule: { startDate: todayInSingapore(), days, times: {} } } : {}
}

// Re-scanning a label: a course still running carries on (same days, so its ticks and reminders do too). One that has
// ended is a refill: it starts again from today, from the new label (or Schedule asks how many days). Changed times stay.
const ended = (schedule) =>
  Boolean(schedule?.days) && addDays(schedule.startDate, schedule.days - 1) < todayInSingapore()
// The schedule for a re-scanned medicine: keeps a running course going (within the label's limit) or starts a new one.
function scheduleFor(previous, medication) {
  if (previous?.schedule && !ended(previous.schedule)) {
    // Carries on, but never past a limit the label gives ("not more than 7 days"), even if it was scheduled for longer before.
    const limit = labelLimitDays(medication)
    return {
      schedule:
        limit && previous.schedule.days > limit
          ? { ...previous.schedule, days: limit }
          : previous.schedule,
    }
  }
  const times = previous?.schedule?.times ?? {}
  const fresh = fromLabel(medication).schedule
  return fresh
    ? { schedule: { ...fresh, times } }
    : previous?.schedule
      ? { schedule: { times } }
      : {}
}

// A course that has finished or been stopped: history, not something the person takes now.
export const isFinished = (entry) => ended(entry.schedule)

// True when two medicines share a name and strength.
const same = (a, b) =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
  (a.strength ?? '') === (b.strength ?? '')

// What Confirm needs to open a saved medicine: every contract field present (typed ones have only a name and
// instructions), nothing to flag beyond the usual required fields, no photo, and `savedId` saying which one to replace.
export function scanFromMedicine(entry) {
  const blank = {
    name: null,
    strength: null,
    doseAmount: null,
    doseUnit: null,
    quantity: null,
    timesPerDay: null,
    timing: null,
    withFood: null,
    frequencyType: null,
    rawInstruction: null,
    warnings: [],
  }
  return {
    type: 'medication',
    source: entry.sample ? 'sample' : entry.source,
    unclear: [],
    medication: { ...blank, ...structuredClone(toRaw(entry.medication)) },
    savedId: entry.id,
  }
}

export const useMedicinesStore = defineStore('medicines', () => {
  // state: [{ id, source: 'label' | 'typed', sample, medication, schedule? }], newest first.
  // schedule = { startDate, days, times: { slot: 'HH:MM' } }, set on the Schedule page (src/rules/schedule.js reads it).
  // reactive (not ref) so pages can take it out of the store: const { medicines } = useMedicinesStore().
  const medicines = reactive(load())

  // Keep a copy in this browser.
  watch(medicines, (list) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(list))
    } catch {
      // Not critical: the list just won't survive a reload.
    }
  })

  // The saved medicine that rememberMedicine would replace with this one, so Confirm can ask first.
  const savedMedicine = (medication) => medicines.find((m) => same(m.medication, medication))

  // Over the limit of 10: a finished or stopped course goes first (the oldest of those: it is only history now), and only when there
  // is none does the oldest of the rest go. So stopping medicines never pushes out one you are still taking.
  function trim() {
    while (medicines.length > MAX) {
      let drop = medicines.length - 1
      for (let i = medicines.length - 1; i >= 0; i--) {
        if (ended(medicines[i].schedule)) {
          drop = i
          break
        }
      }
      medicines.splice(drop, 1)
    }
  }

  // Re-adding a medicine replaces the old entry, so a re-scanned label updates its instructions.
  // It keeps the old id, and the schedule while the course is still running (scheduleFor), so ticks and calendar events carry on.
  // A name typed in Ask never replaces a checked label: that would drop its daily instructions, and so its timetable.
  function rememberMedicine(medication, source, sample = false) {
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
    const { id } = medicines[0]
    trim()
    return id
  }

  // "Fix what we read" (Schedule → Confirm): the corrected details replace that medicine in place. Same id, schedule and
  // sample flag, so its ticks and calendar reminders carry on, even when the name itself was corrected.
  // Checked on Confirm, so it counts as a checked label from now on (a typed medicine becomes one too).
  function replaceMedicine(id, medication) {
    const copy = structuredClone(toRaw(medication))
    const index = medicines.findIndex((m) => m.id === id)
    if (index === -1) return rememberMedicine(copy, 'label') // removed meanwhile: add it again
    const entry = medicines[index]
    entry.medication = copy
    entry.source = 'label'
    if (!entry.schedule?.days) Object.assign(entry, fromLabel(copy)) // e.g. "when needed" fixed to twice a day: now it has days
    // Corrected into the name of another saved medicine: keep this one (it has the schedule being fixed), drop the copy.
    for (let i = medicines.length - 1; i >= 0; i--)
      if (i !== medicines.indexOf(entry) && same(medicines[i].medication, copy))
        medicines.splice(i, 1)
  }

  // Schedule page: how many days, from when, and any times the user changed.
  function setSchedule(id, schedule) {
    const entry = medicines.find((m) => m.id === id)
    if (entry) entry.schedule = structuredClone(toRaw(schedule))
  }

  // Returns what was removed and where, so the page can offer Undo.
  function forgetMedicine(id) {
    const index = medicines.findIndex((m) => m.id === id)
    return index === -1 ? null : { entry: medicines.splice(index, 1)[0], index }
  }

  // Puts a removed medicine back where it was (the Undo).
  function restoreMedicine({ entry, index }) {
    if (!medicines.some((m) => m.id === entry.id)) medicines.splice(index, 0, entry)
  }

  return {
    medicines,
    savedMedicine,
    rememberMedicine,
    replaceMedicine,
    setSchedule,
    forgetMedicine,
    restoreMedicine,
  }
})

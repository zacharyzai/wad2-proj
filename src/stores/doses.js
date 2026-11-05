// Today's ticks ("I've taken it"), shared by the Today and This week tabs of Schedule (a Pinia store, Week 11).
// Ticks are saved to the account: docs/doses-contract.md. The day is a Singapore calendar day.
import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { dosesTaken, setDoseTaken } from '../api/client'
import { todayInSingapore, timeInSingapore, tooEarly } from '../rules/schedule'

export const useDosesStore = defineStore('doses', () => {
  // state
  const today = ref(todayInSingapore())
  const nowTime = ref(timeInSingapore()) // 'HH:MM' in Singapore, kept current every minute
  const taken = reactive(new Set()) // dose ids ticked today
  const busy = reactive(new Set()) // ticks still being saved
  const ready = ref(false) // today's ticks have arrived
  const loadError = ref(null)

  async function loadTicks() {
    const date = today.value
    ready.value = false
    loadError.value = null
    taken.clear() // the store outlives the page: never show the last visit's (or the last account's) ticks
    const res = await dosesTaken(date)
    if (date !== today.value) return // the day changed while this was on its way
    if (!res.ok) return (loadError.value = res.error.code)
    for (const id of res.data.taken) taken.add(id)
    ready.value = true
  }

  // A new day in Singapore (left open past midnight, or reopened next morning): it starts with nothing ticked.
  // Checked every minute, when the tab comes back, and before every tick. Returns true if the day changed.
  // Also keeps the clock current, so the "Take now" band moves along during the day.
  function newDay() {
    nowTime.value = timeInSingapore()
    if (todayInSingapore() === today.value) return false
    today.value = todayInSingapore()
    past.clear() // a new day may be a new week: the strip loads what it needs again
    loadTicks()
    return true
  }

  // Ticks or unticks a dose. The tick changes at once; if the server says no, it goes back.
  // `sure`: they answered "Yes, I took it" to the too-early question.
  // Returns 'early' (ask first: ticking the 9 pm dose at 8 am is more likely a mix-up), 'failed', 'saved' or 'skipped'.
  async function toggle(dose, sure = false) {
    if (newDay() || !ready.value || busy.has(dose.id)) return 'skipped' // never tick yesterday's list onto today's date
    const want = !taken.has(dose.id)
    if (want && !sure && tooEarly(dose.time, timeInSingapore())) return 'early'
    const date = today.value
    want ? taken.add(dose.id) : taken.delete(dose.id)
    busy.add(dose.id)
    const res = await setDoseTaken(dose.id, date, want)
    busy.delete(dose.id)
    if (res.ok || date !== today.value) return 'saved'
    want ? taken.delete(dose.id) : taken.add(dose.id)
    return 'failed'
  }

  // Earlier days this week (Schedule's day strip and the day it opens): their ticks, loaded once a visit, by date. Read
  // only: a day that is over can't be ticked any more.
  const past = reactive(new Map()) // 'YYYY-MM-DD' → Set of dose ids
  const pastError = ref(null)
  async function loadPast(dates) {
    pastError.value = null
    const missing = dates.filter((date) => date < today.value && !past.has(date))
    const answers = await Promise.all(missing.map((date) => dosesTaken(date)))
    answers.forEach((res, i) =>
      res.ok ? past.set(missing[i], new Set(res.data.taken)) : (pastError.value = res.error.code),
    )
  }
  // action: whoever is logged out takes their ticks with them.
  function forget() {
    taken.clear()
    past.clear()
    ready.value = false
  }

  // Home's Today card and the Schedule page keep the day current while they are open.
  let clock = 0
  const onVisible = () => document.visibilityState === 'visible' && newDay()
  function startClock() {
    stopClock() // never two clocks, if one page opens before the other has closed
    document.addEventListener('visibilitychange', onVisible)
    clock = setInterval(newDay, 60_000)
  }
  function stopClock() {
    clearInterval(clock)
    document.removeEventListener('visibilitychange', onVisible)
  }

  return {
    today,
    nowTime,
    taken,
    busy,
    ready,
    loadError,
    loadTicks,
    newDay,
    toggle,
    startClock,
    stopClock,
    past,
    pastError,
    loadPast,
    forget,
  }
})

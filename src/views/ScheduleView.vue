<!-- Owner: Lokesh (redesigned by Claude from the Claude Design "Schedule" screens, declared in README.txt). Medicine schedule in
     three tabs and a Reminders page, each its own address (?view=week | meds | reminders), so Back works:
       Today        what's due now, the day's progress, and a big tick row for every dose, grouped by time of day
       This week    Monday to Sunday at a glance (components/schedule/WeekView.vue)
       My medicines each medicine with Change (days and times, fix what we read, remove) and the pharmacist list
       Reminders    Google Calendar alerts (components/schedule/CalendarSync.vue) and the day's dose times
     Times come from src/rules/schedule.js (our own rules, never AI). Ticks are saved to the account: docs/doses-contract.md -->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { medicines, setSchedule, forgetMedicine, restoreMedicine, scanFromMedicine } from '../stores/medicines'
import { scanStore } from '../stores/scan'
import { buildSchedule, dosesOn, doseSlots, labelLimitDays, packDays, supplyDays, todayInSingapore, timeInSingapore, timeStates, tooEarly, validDate, validDays, validTime, MAX_DAYS } from '../rules/schedule'
import { dosesTaken, setDoseTaken } from '../api/client'
import EmptyState from '../components/layout/EmptyState.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import AppIcon from '../components/layout/AppIcon.vue'
import CalendarSync from '../components/schedule/CalendarSync.vue'
import WeekView from '../components/schedule/WeekView.vue'

const SLOT_ICONS = { morning: 'sunrise', afternoon: 'sun', evening: 'sunset', bedtime: 'bed' } // same as Explain

const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute()

// Which tab: in the address, so Back returns to it and a link can open it. Unknown values show Today.
const VIEWS = ['today', 'week', 'meds', 'reminders']
// Back from Google (?google=connected) opens Reminders, where the calendar card is; CalendarSync then tidies the address.
const view = computed(() => (route.query.google !== undefined ? 'reminders' : VIEWS.includes(route.query.view) ? route.query.view : 'today'))
const TABS = ['today', 'week', 'meds', 'reminders']
const viewLink = (v) => ({ query: v === 'today' ? {} : { view: v } })

// Every medicine with its ScheduleEntry. Flagged ones (no daily timetable) go to the pharmacist section.
const rows = computed(() => medicines.map((medicine) => ({ medicine, entry: buildSchedule(medicine, medicine.schedule ?? {}) })))
const entries = computed(() => rows.value.map((r) => r.entry)) // the whole schedule, as Google sync gets it
const timetable = computed(() => rows.value.filter((r) => !r.entry.flagged))
const flagged = computed(() => rows.value.filter((r) => r.entry.flagged))

// --- Words for dates, times and doses, in the page language ---------------------------------------------------------------
// Dates are Singapore calendar days: shown as UTC midnights, so the device's time zone never moves them.
const dateText = (date, options = { day: 'numeric', month: 'short' }) => new Date(`${date}T00:00:00Z`).toLocaleDateString(locale.value, { timeZone: 'UTC', ...options })
const timeText = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(locale.value, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' })
}
// "1 tablet · After food"
const doseText = ({ count, unit, food }) =>
  [count != null && `${count} ${t(`unit.${unit ?? 'other'}`, count)}`, food && t(`food.${food}`)].filter(Boolean).join(' · ')
const timesText = (entry) => entry.doses.map((d) => timeText(d.time)).join(', ')
// "From the label: 60 tablets, 2 tablets a day, so it lasts 30 days." Only when supplyDays can do the sums.
const amountText = (n, unit) => `${n} ${t(`unit.${unit ?? 'other'}`, n)}`
function supplyText(medication) {
  const days = supplyDays(medication)
  if (!days) return null
  const perDay = medication.doseAmount * doseSlots(medication).length
  // The label's limit is shorter than the pack: say that, so nobody wonders why 10 tablets are only scheduled for 7 days.
  if (days < packDays(medication)) return t('schedule.limit', { qty: amountText(medication.quantity, medication.doseUnit), days: labelLimitDays(medication) }, days)
  return t('schedule.supply', { qty: amountText(medication.quantity, medication.doseUnit), per: amountText(perDay, medication.doseUnit), days }, days)
}

function dateStatus(entry) {
  if (today.value < entry.startDate) return { kind: 'later', text: t('schedule.meds.starts', { date: dateText(entry.startDate) }) }
  if (today.value > entry.endDate) return { kind: 'ended', text: t('schedule.meds.ended', { date: dateText(entry.endDate) }) }
  return { kind: 'now', text: t('schedule.meds.until', { start: dateText(entry.startDate), end: dateText(entry.endDate) }) }
}

// --- Today ---------------------------------------------------------------------------------------------------------------
const today = ref(todayInSingapore())
const nowTime = ref(timeInSingapore()) // 'HH:MM' in Singapore, kept current every minute
const todayDoses = computed(() => dosesOn(entries.value, today.value))
// One band per time ("Morning · 8:00 AM"), the doses taken then inside it. `state` says where it sits in the day
// (earlier / now / later), so the band that's due stands out and later ones clearly aren't for now.
const groups = computed(() => {
  const byTime = new Map()
  for (const dose of todayDoses.value) {
    if (!byTime.has(dose.time)) byTime.set(dose.time, [])
    byTime.get(dose.time).push(dose)
  }
  const list = [...byTime].map(([time, doses]) => ({ time, doses, slot: doses.every((d) => d.slot === doses[0].slot) ? doses[0].slot : null }))
  const states = timeStates(list.map((g) => g.time), nowTime.value)
  return list.map((g, i) => ({ ...g, state: states[i] }))
})
const allTaken = (g) => g.doses.every((d) => taken.has(d.id))
// The time that's due and not yet ticked: shown at the top of Today with one "I've taken it" for all its doses.
const dueGroup = computed(() => (ticksReady.value ? groups.value.find((g) => g.state === 'now' && !allTaken(g)) : null))
const takeAll = (g) => g.doses.filter((d) => !taken.has(d.id)).forEach((d) => toggle(d, true))
// "Next: Metformin at 6:00 PM": the first untaken dose that isn't due yet.
const nextDose = computed(() => groups.value.filter((g) => g.state === 'later').flatMap((g) => g.doses).find((d) => !taken.has(d.id)))
const RING = 2 * Math.PI * 30 // the progress ring's circumference (r = 30)
// Reminders page: each time of day in use, with its time (from the medicines on the timetable).
const doseTimes = computed(() => {
  const byTime = new Map()
  for (const r of timetable.value) for (const d of r.entry.doses) byTime.set(d.time, d.id.slice(r.medicine.id.length + 1))
  return [...byTime].sort(([a], [b]) => a.localeCompare(b)).map(([time, slot]) => ({ time, slot }))
})
// What the band's label says. Taken is taken, whatever the time; a missed one says "Not ticked yet", never "take it now".
function bandStatus(g) {
  if (allTaken(g)) return { kind: 'done', text: t('schedule.slot.done') }
  return { kind: g.state, text: t(`schedule.slot.${g.state}`) }
}
const needDays = computed(() => timetable.value.filter((r) => !r.entry.endDate))

const taken = reactive(new Set()) // dose ids ticked today
const busy = reactive(new Set()) // ticks still being saved
const ticksReady = ref(false)
const loadError = ref(null)
const doneCount = computed(() => todayDoses.value.filter((d) => taken.has(d.id)).length)

async function loadTicks() {
  const date = today.value
  ticksReady.value = false
  loadError.value = null
  const res = await dosesTaken(date)
  if (date !== today.value) return // the day changed while this was on its way
  if (!res.ok) return (loadError.value = res.error.code)
  taken.clear()
  for (const id of res.data.taken) taken.add(id)
  ticksReady.value = true
}

// The tick changes at once; if the server says no, it goes back and a short message says so.
// `sure`: they answered "Yes, I took it" to the too-early question.
async function toggle(dose, sure = false) {
  if (newDay() || !ticksReady.value || busy.has(dose.id)) return // never tick yesterday's list onto today's date
  const want = !taken.has(dose.id)
  // Ticking the 9 pm dose at 8 am is more likely a mix-up than a choice: ask before recording it.
  if (want && !sure && tooEarly(dose.time, timeInSingapore())) return askEarly(dose)
  const date = today.value
  want ? taken.add(dose.id) : taken.delete(dose.id)
  busy.add(dose.id)
  const res = await setDoseTaken(dose.id, date, want)
  busy.delete(dose.id)
  if (res.ok || date !== today.value) return
  want ? taken.delete(dose.id) : taken.add(dose.id)
  notify(t('schedule.tickFailed'), true)
}

// "This dose is for later today. Have you already taken it?" Yes records the tick; Not yet leaves it, focus back on it.
const confirming = ref(null) // id of the dose being asked about
async function askEarly(dose) {
  confirming.value = dose.id
  await nextTick()
  document.querySelector(`[data-early-yes="${dose.id}"]`)?.focus()
}
async function answerEarly(dose, tookIt) {
  confirming.value = null
  if (tookIt) toggle(dose, true)
  await nextTick()
  document.querySelector(`[data-tick="${dose.id}"]`)?.focus()
}

// A new day in Singapore (left open past midnight, or reopened next morning): it starts with nothing ticked.
// Checked every minute, when the tab comes back, and before every tick. Returns true if the day changed.
// Also keeps the clock current, so the "Take now" band moves along during the day.
function newDay() {
  nowTime.value = timeInSingapore()
  if (todayInSingapore() === today.value) return false
  today.value = todayInSingapore()
  loadTicks()
  return true
}
const onVisible = () => document.visibilityState === 'visible' && newDay()
let dayTimer = 0
onMounted(() => {
  loadTicks()
  welcomeBackFromFix()
  document.addEventListener('visibilitychange', onVisible)
  dayTimer = setInterval(newDay, 60_000)
})

// --- Change: one button per medicine opens its options (Days and times, Fix what we read, Remove) -----------------------------
const managing = ref(null) // id of the medicine whose options are open; one at a time
function toggleManage(id) {
  managing.value = managing.value === id ? null : id
  editing.value = null
}

// --- Edit: number of days, start date, a time for each dose ----------------------------------------------------------------
const editing = ref(null) // id of the medicine being edited
const form = reactive({ days: '', startDate: '', times: {} })
const tried = ref(false) // errors show after the first Save, not while the person is still typing
const editSlots = computed(() => doseSlots(medicines.find((m) => m.id === editing.value)?.medication) ?? [])
const problems = computed(() => {
  const p = {}
  if (!/^\d+$/.test(String(form.days).trim()) || !validDays(Number(form.days))) p.days = t('schedule.form.bad.days', { max: MAX_DAYS })
  if (!validDate(form.startDate)) p.startDate = t('schedule.form.bad.start')
  for (const slot of editSlots.value) if (!validTime(form.times[slot])) p[slot] = t('schedule.form.bad.time')
  return p
})
const shown = (key) => (tried.value ? problems.value[key] : null)

async function openEdit({ medicine, entry }) {
  managing.value = null
  editing.value = medicine.id
  tried.value = false
  Object.assign(form, {
    days: medicine.schedule?.days ?? supplyDays(medicine.medication) ?? '', // a label with a quantity fills it in
    startDate: medicine.schedule?.startDate ?? today.value,
    times: Object.fromEntries(entry.doses.map((d) => [d.id.slice(medicine.id.length + 1), d.time])),
  })
  await nextTick()
  document.getElementById(`days-${medicine.id}`)?.focus()
}

async function save(id) {
  tried.value = true
  if (Object.keys(problems.value).length) {
    await nextTick()
    return document.querySelector(`#edit-${id} [aria-invalid="true"]`)?.focus()
  }
  setSchedule(id, { startDate: form.startDate, days: Number(form.days), times: { ...form.times } })
  closeEdit(id)
  notify(t('schedule.saved'))
}

async function closeEdit(id) {
  editing.value = null
  await nextTick()
  document.querySelector(`[data-change="${id}"]`)?.focus() // back to its Change button, so keyboard users don't lose their place
}

// --- Fix what we read: the saved details open on Confirm (no photo, no rescan); Looks correct brings them back here -------------
function fix(medicine) {
  Object.assign(scanStore, { current: scanFromMedicine(medicine), photo: null, confirmed: false })
  router.push({ name: 'confirm' })
}
// Back from Confirm: say it worked, and put focus back on the medicine that was fixed.
async function welcomeBackFromFix() {
  const id = window.history.state?.fixedId
  if (!id) return
  window.history.replaceState({ ...window.history.state, fixedId: null }, '') // once: not again on reload or Back
  const entry = medicines.find((m) => m.id === id)
  if (!entry) return
  notify(t('schedule.fix.done', { name: nameOf(entry.medication) }))
  // One task later: App.vue focuses the page heading after every page change, and this must come after it.
  await new Promise((resolve) => setTimeout(resolve))
  document.querySelector(`[data-change="${id}"]`)?.focus()
}

// --- Remove with Undo (same as Ask): 8 seconds to bring it back where it was ------------------------------------------------
const removed = ref(null)
const undoButton = ref(null)
let undoTimer = 0
async function remove(medicine) {
  clearTimeout(undoTimer)
  if (editing.value === medicine.id) editing.value = null
  managing.value = null
  removed.value = forgetMedicine(medicine.id)
  undoTimer = setTimeout(() => (removed.value = null), 8000)
  await nextTick()
  undoButton.value?.focus()
}
async function undo() {
  clearTimeout(undoTimer)
  const { id } = removed.value.entry
  restoreMedicine(removed.value)
  removed.value = null
  await nextTick()
  document.querySelector(`[data-change="${id}"]`)?.focus() // the Undo button is gone: back to the medicine
}
const nameOf = (medication) => [medication.name, medication.strength].filter(Boolean).join(' ')

// "Saved" or "Not saved": a small message at the bottom for 3 seconds (same as Account).
const toast = ref(null)
let toastTimer = 0
function notify(text, bad = false) {
  clearTimeout(toastTimer)
  toast.value = { text, bad }
  toastTimer = setTimeout(() => (toast.value = null), 3000)
}

onBeforeUnmount(() => {
  clearTimeout(undoTimer)
  clearTimeout(toastTimer)
  clearInterval(dayTimer)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <div class="page schedule">
    <!-- Reminders is its own page with a way back; the three tabs share one header. -->
    <template v-if="view === 'reminders'">
      <RouterLink :to="viewLink('today')" class="btn btn-ghost back-link align-self-start"><AppIcon name="left" />{{ t('schedule.back') }}</RouterLink>
      <header class="head">
        <h1>{{ t('schedule.rem.title') }}</h1>
        <p class="lead m-0">{{ t('schedule.rem.lead') }}</p>
      </header>
    </template>
    <template v-else>
      <header class="head head-row">
        <div class="d-flex flex-column gap-1">
          <span class="date" data-testid="schedule-date">{{ dateText(today, { weekday: 'long', day: 'numeric', month: 'long' }) }}</span>
          <h1>{{ t(`schedule.title.${view}`) }}</h1>
        </div>
        <div class="head-acts">
          <RouterLink :to="{ name: 'scan', query: { type: 'medication' } }" class="btn btn-primary btn-sm"><AppIcon name="plus" />{{ t('schedule.add') }}</RouterLink>
          <RouterLink v-if="medicines.length" :to="viewLink('reminders')" class="btn btn-secondary btn-sm" data-testid="schedule-reminders-link"><AppIcon name="clock" />{{ t('schedule.rem.title') }}</RouterLink>
        </div>
      </header>
      <!-- The three views are pages of their own (links, so Back and a shared link work), drawn as one segmented control. -->
      <nav v-if="medicines.length" class="tabs" :aria-label="t('pages.schedule')">
        <RouterLink v-for="v in TABS" :key="v" :to="viewLink(v)" class="tab" :aria-current="view === v ? 'page' : null" :data-testid="`tab-${v}`">{{ t(`schedule.tab.${v}`) }}</RouterLink>
      </nav>
    </template>

    <EmptyState v-if="!medicines.length && view !== 'reminders'" :title="t('schedule.empty.title')" :text="t('schedule.empty.text')" icon="calendar">
      <RouterLink :to="{ name: 'scan', query: { type: 'medication' } }" class="btn btn-primary"><AppIcon name="scan" />{{ t('soon.scanMed') }}</RouterLink>
    </EmptyState>

    <!-- ===== Today ===== -->
    <section v-else-if="view === 'today'" class="d-flex flex-column gap-4" aria-labelledby="today-title" data-testid="schedule-today">
      <h2 id="today-title" class="visually-hidden">{{ t('schedule.today') }}</h2>
      <ErrorBanner v-if="loadError" :code="loadError" retryable @retry="loadTicks" />

      <p v-if="!todayDoses.length" class="card m-0 text-muted-a11y" data-testid="schedule-none-today">
        {{ t(needDays.length ? 'schedule.noneTodayNeedDays' : 'schedule.noneToday') }}
        <RouterLink v-if="needDays.length" :to="viewLink('meds')" class="d-block mt-2 fw-bold">{{ t('schedule.tab.meds') }}</RouterLink>
      </p>
      <template v-else>
        <!-- What's due now: the one thing to do, with a button that ticks every dose of that time. Never for a missed dose. -->
        <section v-if="dueGroup" class="due" :class="`slot-${dueGroup.slot ?? 'other'}`" aria-labelledby="due-title" data-testid="schedule-due">
          <div class="d-flex align-items-start gap-3">
            <span class="slot-tile lg" aria-hidden="true"><AppIcon :name="SLOT_ICONS[dueGroup.slot] ?? 'clock'" :size="26" /></span>
            <div class="d-flex flex-column gap-1 min-w-0">
              <h2 id="due-title" class="due-title">{{ dueGroup.doses.length === 1 ? t('schedule.due.one', { name: dueGroup.doses[0].label }) : t('schedule.due.many', { n: dueGroup.doses.length }) }}</h2>
              <p class="m-0">{{ t('schedule.due.text', { time: timeText(dueGroup.time) }) }}</p>
            </div>
          </div>
          <ul v-if="dueGroup.doses.length > 1" class="due-list">
            <li v-for="d in dueGroup.doses" :key="d.id"><strong>{{ d.label }}</strong> <span class="text-muted-a11y">{{ doseText(d.instruction) }}</span></li>
          </ul>
          <button type="button" class="btn btn-primary" data-testid="schedule-due-take" @click="takeAll(dueGroup)"><AppIcon name="check" />{{ t('schedule.due.take') }}</button>
        </section>

        <!-- The day's progress: the words say it, the ring only shows it. -->
        <div class="progress-card" data-testid="schedule-progress">
          <svg class="ring" viewBox="0 0 72 72" aria-hidden="true">
            <circle cx="36" cy="36" r="30" class="ring-track" />
            <circle cx="36" cy="36" r="30" class="ring-fill" :class="{ full: doneCount === todayDoses.length }" :stroke-dasharray="RING" :stroke-dashoffset="RING * (1 - doneCount / todayDoses.length)" />
            <text x="36" y="36" class="ring-num" text-anchor="middle" dominant-baseline="central">{{ doneCount }}/{{ todayDoses.length }}</text>
          </svg>
          <div class="d-flex flex-column gap-1 min-w-0">
            <strong class="progress-words" data-testid="schedule-progress-words">{{ doneCount === todayDoses.length ? t('schedule.allDone') : t('schedule.progress', { done: doneCount, total: todayDoses.length }) }}</strong>
            <span v-if="nextDose" class="text-muted-a11y">{{ t('schedule.next', { name: nextDose.label, time: timeText(nextDose.time) }) }}</span>
          </div>
        </div>

        <!-- One card per time of day, coloured like a pill-box compartment, the word and icon always beside the colour. -->
        <div class="slot-grid">
          <section
            v-for="g in groups"
            :key="g.time"
            class="slot-card"
            :class="[`slot-${g.slot ?? 'other'}`, `is-${g.state}`]"
            :aria-labelledby="`slot-title-${g.time}`"
            :data-testid="`slot-${g.time}`"
            :data-state="g.state"
          >
            <div class="slot-head">
              <span class="slot-tile" aria-hidden="true"><AppIcon :name="SLOT_ICONS[g.slot] ?? 'clock'" :size="24" /></span>
              <h3 :id="`slot-title-${g.time}`" class="slot-name">
                <template v-if="g.slot">{{ t(`timing.${g.slot}`) }}<span class="visually-hidden"> · </span></template>
                <span class="slot-clock">{{ timeText(g.time) }}</span>
              </h3>
              <span class="badge slot-state" :class="`state-${bandStatus(g).kind}`" data-testid="slot-state">
                <AppIcon v-if="bandStatus(g).kind === 'done'" name="checkCircle" :size="18" />{{ bandStatus(g).text }}
              </span>
            </div>
            <!-- Never "take it now" for a missed dose: that is the pharmacist's call. -->
            <p v-if="g.state === 'earlier' && !allTaken(g)" class="slot-note m-0">{{ t('schedule.slot.missed') }}</p>
            <ul class="doses">
              <li v-for="d in g.doses" :key="d.id" :data-testid="`dose-${d.id}`">
                <!-- The tick. The button holds only the medicine's name (so what's seen is what's spoken: WCAG 2.5.3) and its click area
                     stretches over the whole row, a big target for unsteady hands. aria-pressed says taken or not; the amount and
                     the word under it are plain text beside it. -->
                <div class="dose" :class="{ done: taken.has(d.id), busy: !ticksReady }">
                  <span class="box" aria-hidden="true"><AppIcon name="check" :size="26" :stroke="3" /></span>
                  <span class="dose-info">
                    <button
                      type="button"
                      class="dose-btn"
                      :data-tick="d.id"
                      :aria-pressed="taken.has(d.id)"
                      :aria-label="t('schedule.tickLabel', { name: d.label, time: timeText(d.time) })"
                      :aria-describedby="`dose-detail-${d.id}`"
                      :disabled="!ticksReady"
                      @click="toggle(d)"
                    >{{ d.label }}</button>
                    <span :id="`dose-detail-${d.id}`" class="dose-detail">{{ doseText(d.instruction) }}</span>
                    <span class="dose-word" aria-hidden="true"><AppIcon v-if="taken.has(d.id)" name="check" :size="16" :stroke="3" />{{ taken.has(d.id) ? t('schedule.taken') : t('schedule.tapWhenTaken') }}</span>
                  </span>
                </div>
                <div v-if="confirming === d.id" class="early alert alert-warning flex-column" role="alertdialog" :aria-labelledby="`early-title-${d.id}`" :aria-describedby="`early-text-${d.id}`" data-testid="schedule-early">
                  <strong :id="`early-title-${d.id}`">{{ t('schedule.early.title') }}</strong>
                  <span :id="`early-text-${d.id}`">{{ t('schedule.early.text', { name: d.label, time: timeText(d.time) }) }}</span>
                  <div class="d-flex flex-column flex-sm-row gap-2">
                    <button type="button" class="btn btn-primary btn-sm" :data-early-yes="d.id" @click="answerEarly(d, true)"><AppIcon name="check" :size="20" />{{ t('schedule.early.yes') }}</button>
                    <button type="button" class="btn btn-secondary btn-sm" @click="answerEarly(d, false)">{{ t('schedule.early.no') }}</button>
                  </div>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </template>

      <!-- Medicines still waiting for their number of days: one line here, the form is in My medicines. -->
      <RouterLink v-if="needDays.length && todayDoses.length" :to="viewLink('meds')" class="alert alert-warning need-link" data-testid="schedule-need-days-link">
        <AppIcon name="alert" /><span>{{ t('schedule.needDaysCount', { n: needDays.length }, needDays.length) }}</span><AppIcon name="right" class="ms-auto" />
      </RouterLink>
    </section>

    <!-- ===== This week ===== -->
    <WeekView v-else-if="view === 'week'" :entries="entries" :today="today" :now="nowTime" :taken-today="taken" :flagged="flagged" />

    <!-- ===== My medicines ===== -->
    <div v-else-if="view === 'meds'" class="d-flex flex-column gap-4">
      <section v-if="timetable.length" aria-labelledby="meds-title" data-testid="schedule-meds">
        <h2 id="meds-title" class="visually-hidden">{{ t('schedule.meds.title') }}</h2>
        <ul class="med-grid">
          <li v-for="r in timetable" :key="r.medicine.id" class="card med-card" :data-testid="`med-${r.medicine.id}`">
            <div class="med-line">
              <span class="tile tile-soft" aria-hidden="true"><AppIcon name="pill" :size="24" /></span>
              <span class="med-info">
                <span class="med-name">{{ r.entry.label }}</span>
                <span class="text-muted-a11y">{{ doseText(r.entry.instruction) }}</span>
                <span class="med-times"><AppIcon name="clock" :size="18" />{{ timesText(r.entry) }}</span>
                <span v-if="supplyText(r.medicine.medication)" class="med-supply" data-testid="med-supply"><AppIcon name="pill" :size="18" />{{ supplyText(r.medicine.medication) }}</span>
                <span v-if="r.entry.endDate" class="badge align-self-start" :class="{ 'badge-teal': dateStatus(r.entry).kind === 'now' }">{{ dateStatus(r.entry).text }}</span>
              </span>
              <button
                type="button"
                class="btn btn-secondary btn-sm change"
                :data-change="r.medicine.id"
                :aria-expanded="managing === r.medicine.id"
                :aria-controls="managing === r.medicine.id ? `manage-${r.medicine.id}` : null"
                :aria-label="t('schedule.meds.changeOne', { name: r.entry.label })"
                @click="toggleManage(r.medicine.id)"
              >
                <AppIcon name="pencil" :size="20" />{{ t('schedule.meds.change') }}
              </button>
            </div>

            <div v-if="managing === r.medicine.id" :id="`manage-${r.medicine.id}`" class="manage" data-testid="schedule-manage">
              <button type="button" class="btn btn-outline btn-sm" :aria-label="t('schedule.meds.daysTimesOne', { name: r.entry.label })" @click="openEdit(r)"><AppIcon name="clock" :size="20" />{{ t('schedule.meds.daysTimes') }}</button>
              <button type="button" class="btn btn-outline btn-sm" :aria-label="t('schedule.fix.buttonOne', { name: r.entry.label })" @click="fix(r.medicine)"><AppIcon name="scan" :size="20" />{{ t('schedule.fix.button') }}</button>
              <button type="button" class="btn btn-outline btn-sm" :aria-label="t('schedule.meds.removeOne', { name: r.entry.label })" @click="remove(r.medicine)"><AppIcon name="xCircle" :size="20" />{{ t('schedule.meds.remove') }}</button>
            </div>

            <form v-if="editing === r.medicine.id" :id="`edit-${r.medicine.id}`" class="edit-form" novalidate :aria-label="t('schedule.form.title', { name: r.entry.label })" @submit.prevent="save(r.medicine.id)">
              <div class="field">
                <label :for="`days-${r.medicine.id}`" class="field-label">{{ t('schedule.form.days') }}</label>
                <span :id="`days-help-${r.medicine.id}`" class="field-help">{{ t('schedule.form.daysHelp') }}<template v-if="supplyText(r.medicine.medication)"> {{ supplyText(r.medicine.medication) }}</template></span>
                <input
                  :id="`days-${r.medicine.id}`"
                  v-model="form.days"
                  class="field-input days-input"
                  :class="{ 'is-error': shown('days') }"
                  inputmode="numeric"
                  maxlength="3"
                  autocomplete="off"
                  :aria-invalid="Boolean(shown('days'))"
                  :aria-describedby="`days-help-${r.medicine.id}` + (shown('days') ? ` days-error-${r.medicine.id}` : '')"
                  data-testid="schedule-days"
                />
                <p v-if="shown('days')" :id="`days-error-${r.medicine.id}`" class="field-error" role="alert">{{ shown('days') }}</p>
                <!-- Not a block: the person may know better (a doctor told them), so this only says what the label says. -->
                <p v-if="labelLimitDays(r.medicine.medication) && Number(form.days) > labelLimitDays(r.medicine.medication)" class="alert alert-warning m-0" data-testid="schedule-over-limit"><AppIcon name="alert" :size="20" />{{ t('schedule.form.overLimit', { days: labelLimitDays(r.medicine.medication) }, labelLimitDays(r.medicine.medication)) }}</p>
              </div>
              <div class="field">
                <label :for="`start-${r.medicine.id}`" class="field-label">{{ t('schedule.form.start') }}</label>
                <input
                  :id="`start-${r.medicine.id}`"
                  v-model="form.startDate"
                  type="date"
                  class="field-input"
                  :class="{ 'is-error': shown('startDate') }"
                  :aria-invalid="Boolean(shown('startDate'))"
                  :aria-describedby="shown('startDate') ? `start-error-${r.medicine.id}` : null"
                  data-testid="schedule-start"
                />
                <p v-if="shown('startDate')" :id="`start-error-${r.medicine.id}`" class="field-error" role="alert">{{ shown('startDate') }}</p>
              </div>
              <fieldset class="field times">
                <legend class="field-label">{{ t('schedule.form.times') }}</legend>
                <div class="time-grid">
                  <div v-for="slot in editSlots" :key="slot" class="field">
                    <label :for="`time-${r.medicine.id}-${slot}`" class="time-label"><AppIcon :name="SLOT_ICONS[slot]" :size="20" />{{ t(`timing.${slot}`) }}</label>
                    <input
                      :id="`time-${r.medicine.id}-${slot}`"
                      v-model="form.times[slot]"
                      type="time"
                      class="field-input"
                      :class="{ 'is-error': shown(slot) }"
                      :aria-invalid="Boolean(shown(slot))"
                      :aria-describedby="shown(slot) ? `time-error-${r.medicine.id}-${slot}` : null"
                      :data-testid="`schedule-time-${slot}`"
                    />
                    <p v-if="shown(slot)" :id="`time-error-${r.medicine.id}-${slot}`" class="field-error" role="alert">{{ shown(slot) }}</p>
                  </div>
                </div>
              </fieldset>
              <div class="d-flex flex-column flex-sm-row gap-3">
                <button type="submit" class="btn btn-primary" data-testid="schedule-save"><AppIcon name="check" />{{ t('schedule.form.save') }}</button>
                <button type="button" class="btn btn-ghost" @click="closeEdit(r.medicine.id)">{{ t('schedule.form.cancel') }}</button>
              </div>
            </form>

            <!-- Not on the timetable until we know how long to take it for: say so, with its button in view (never behind Change). -->
            <div v-else-if="!r.entry.endDate && editing !== r.medicine.id" class="alert alert-warning flex-column" data-testid="schedule-need-days">
              <span class="d-flex gap-2"><AppIcon name="alert" /><strong>{{ t('schedule.meds.needDays') }}</strong></span>
              <span>{{ t('schedule.meds.needDaysHelp') }}</span>
              <button type="button" class="btn btn-primary btn-sm align-self-start" :aria-label="t('schedule.meds.setDaysOne', { name: r.entry.label })" @click="openEdit(r)"><AppIcon name="pencil" :size="20" />{{ t('schedule.meds.setDays') }}</button>
            </div>
          </li>
        </ul>
      </section>

      <!-- Never scheduled: when necessary, weekly, tapering, or a label we couldn't turn into daily times. -->
      <section v-if="flagged.length" class="card card-warning pharm" aria-labelledby="pharm-title" data-testid="schedule-pharmacist">
        <div class="d-flex align-items-start gap-3">
          <span class="tile tile-warning" aria-hidden="true"><AppIcon name="users" :size="24" /></span>
          <div class="d-flex flex-column gap-1">
            <h2 id="pharm-title" class="h3 m-0">{{ t('schedule.pharm.title') }}</h2>
            <p class="m-0">{{ t('schedule.pharm.text') }}</p>
          </div>
        </div>
        <ul class="pharm-list">
          <li v-for="r in flagged" :key="r.medicine.id" class="pharm-row" :data-testid="`med-${r.medicine.id}`">
            <div class="med-line">
              <span class="med-info">
                <span v-if="r.medicine.medication.frequencyType && r.medicine.medication.frequencyType !== 'daily'" class="badge badge-warning align-self-start">{{ t(`freq.${r.medicine.medication.frequencyType}`) }}</span>
                <span class="med-name">{{ r.entry.label }}</span>
                <span v-if="r.medicine.medication.rawInstruction" class="text-muted-a11y" :lang="r.medicine.source === 'label' ? 'en' : null">“{{ r.medicine.medication.rawInstruction }}”</span>
              </span>
              <button
                type="button"
                class="btn btn-outline btn-sm change"
                :data-change="r.medicine.id"
                :aria-expanded="managing === r.medicine.id"
                :aria-controls="managing === r.medicine.id ? `manage-${r.medicine.id}` : null"
                :aria-label="t('schedule.meds.changeOne', { name: r.entry.label })"
                @click="toggleManage(r.medicine.id)"
              >
                <AppIcon name="pencil" :size="20" />{{ t('schedule.meds.change') }}
              </button>
            </div>
            <!-- No Days and times here (nothing to schedule). Fix is for a label we misread, e.g. "twice a day" read as "when needed". -->
            <div v-if="managing === r.medicine.id" :id="`manage-${r.medicine.id}`" class="manage" data-testid="schedule-manage">
              <button type="button" class="btn btn-outline btn-sm" :aria-label="t('schedule.fix.buttonOne', { name: r.entry.label })" @click="fix(r.medicine)"><AppIcon name="scan" :size="20" />{{ t('schedule.fix.button') }}</button>
              <button type="button" class="btn btn-outline btn-sm" :aria-label="t('schedule.meds.removeOne', { name: r.entry.label })" @click="remove(r.medicine)"><AppIcon name="xCircle" :size="20" />{{ t('schedule.meds.remove') }}</button>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <!-- ===== Reminders ===== -->
    <!-- One calendar card, always mounted (hidden off this page): every edit or Remove still reaches Google, even removing
         the last medicine (its reminders are deleted), and switching tabs doesn't ask Google again. -->
    <div v-show="view === 'reminders'" class="rem-grid">
      <CalendarSync class="g-cal" :entries="entries" @notify="notify" />
      <section v-if="doseTimes.length" class="card d-flex flex-column gap-2" aria-labelledby="times-title" data-testid="schedule-times">
        <h2 id="times-title" class="h3 m-0">{{ t('schedule.rem.times') }}</h2>
        <ul class="time-list">
          <li v-for="d in doseTimes" :key="d.time">
            <span class="slot-tile sm" :class="`slot-${d.slot}`" aria-hidden="true"><AppIcon :name="SLOT_ICONS[d.slot] ?? 'clock'" :size="20" /></span>
            <span class="flex-grow-1">{{ t(`timing.${d.slot}`) }}</span>
            <strong class="tnum">{{ timeText(d.time) }}</strong>
          </li>
        </ul>
        <p class="m-0 text-muted-a11y">{{ t('schedule.rem.timesHelp') }}</p>
        <RouterLink :to="viewLink('meds')" class="btn btn-outline btn-sm align-self-start">{{ t('schedule.tab.meds') }}<AppIcon name="right" :size="18" /></RouterLink>
      </section>
    </div>

    <!-- Always in the page, so screen readers announce what appears in it. -->
    <div class="toast-slot" role="status" aria-live="polite">
      <Transition name="toast">
        <p v-if="toast" class="toast-ahma m-0" :class="{ bad: toast.bad }" data-testid="schedule-toast">
          <AppIcon :name="toast.bad ? 'alert' : 'checkCircle'" :size="22" />{{ toast.text }}
        </p>
      </Transition>
    </div>

    <div v-if="removed" class="toast-ahma toast-undo rise" role="status" data-testid="schedule-undo">
      <span>{{ t('schedule.removed', { name: nameOf(removed.entry.medication) }) }}</span>
      <button ref="undoButton" type="button" class="btn btn-on-hero btn-sm" @click="undo">{{ t('schedule.undo') }}</button>
    </div>
  </div>
</template>

<style src="../styles/views/ScheduleSlots.css"></style>
<style scoped src="../styles/views/ScheduleView.css"></style>

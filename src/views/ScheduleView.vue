<!-- Owner: Lokesh (redesigned by Claude from the Claude Design "Schedule" screens, declared in README.txt; Today and This week
     made one view, Reminders folded into My medicines, by Asher). Medicine schedule in two tabs (?view=meds), so Back works:
       Today        the week as a strip of days (DayStrip.vue); today below it: what's due, the day's progress and a card
                    for every dose (TodayList.vue); another day: what was taken or is coming (DayOther.vue)
       My medicines one card per medicine (MedicineCard.vue, EditDaysForm.vue), the pharmacist list (PharmacistList.vue),
                    and Google Calendar reminders (CalendarSync.vue). Old links to This week or Reminders open these.
     This page keeps what the tabs share: the header, which card has a panel open, Remove and Stop with Undo, and the toast.
     Times come from src/rules/schedule.js (our own rules, never AI). Ticks are in stores/doses.js. -->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useMedicinesStore, scanFromMedicine } from '../stores/medicines'
import { useScanStore } from '../stores/scan'
import { useDosesStore } from '../stores/doses'
import { useToast } from '../composables/useToast'
import { useScheduleText, nameOf } from '../composables/useScheduleText'
import { buildSchedule, stopCourse, supplyDays } from '../rules/schedule'
import EmptyState from '../components/layout/EmptyState.vue'
import AppIcon from '../components/layout/AppIcon.vue'
import CalendarSync from '../components/schedule/CalendarSync.vue'
import DayStrip from '../components/schedule/DayStrip.vue'
import DayOther from '../components/schedule/DayOther.vue'
import TodayList from '../components/schedule/TodayList.vue'
import MedicineCard from '../components/schedule/MedicineCard.vue'
import PharmacistList from '../components/schedule/PharmacistList.vue'

const { medicines, setSchedule, forgetMedicine, restoreMedicine } = useMedicinesStore()
const scanStore = useScanStore()
const doses = useDosesStore()
const { today } = storeToRefs(doses)
const { toast, notify } = useToast()
const { dateText } = useScheduleText()

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

// Which tab: in the address, so Back returns to it and a link can open it. Unknown values show Today.
// Old links: This week is the strip on Today now; Reminders (the calendar card) is on My medicines.
const VIEWS = ['today', 'meds']
const OLD = { week: 'today', reminders: 'meds' }
// Back from Google (?google=connected) opens My medicines, where the calendar card is; CalendarSync then tidies the address.
const view = computed(() => (route.query.google !== undefined ? 'meds' : OLD[route.query.view] ?? (VIEWS.includes(route.query.view) ? route.query.view : 'today')))

// The day shown under the strip: today, unless another day is picked. Back to today when the day changes.
const day = ref(today.value)
watch(today, (now) => (day.value = now))
// The day's list slides in from the side of the day picked (later days from the right).
const slide = ref('later')
function pickDay(date) {
  slide.value = date > day.value ? 'later' : 'earlier'
  day.value = date
}
const viewLink = (v) => ({ query: v === 'today' ? {} : { view: v } })
// Keyboard users never lose their place: after the page updates, focus moves to the element that now matters.
const pageEl = ref(null) // template ref (Week 4): look only inside this page, never the whole document
const focusAfterUpdate = async (selector) => {
  await nextTick()
  pageEl.value?.querySelector(selector)?.focus()
}

// Every medicine with its ScheduleEntry. Flagged ones (no daily timetable) go to the pharmacist section.
const rows = computed(() => medicines.map((medicine) => ({ medicine, entry: buildSchedule(medicine, medicine.schedule ?? {}) })))
const entries = computed(() => rows.value.map((r) => r.entry)) // the whole schedule, as Google sync gets it
// Finished and stopped courses sit at the bottom, so what you are taking now comes first.
const finishedRow = (r) => Boolean(r.entry.endDate && r.entry.endDate < today.value)
const timetable = computed(() => rows.value.filter((r) => !r.entry.flagged).sort((a, b) => finishedRow(a) - finishedRow(b)))
const flagged = computed(() => rows.value.filter((r) => r.entry.flagged))
const needDays = computed(() => timetable.value.filter((r) => !r.entry.endDate).length)

onMounted(() => {
  if (!doses.newDay()) doses.loadTicks() // a new day loads its own ticks
  doses.startClock()
  welcomeBackFromFix()
})

// --- Which card has a panel open: one Change at a time, one form at a time, one stop question at a time ------------------
const managing = ref(null) // id of the medicine whose options are open
const editing = ref(null) // id of the medicine whose Days and times form is open
const stopAsk = ref(null) // id of the medicine whose "Stop taking it?" is open
function toggleManage(id) {
  managing.value = managing.value === id ? null : id
  editing.value = null
}
// Desktop: the open card (Change, its form, or the stop question) comes forward on its own over a dimmed page, and a dashed outline keeps its place in the grid, so the
// other cards never change size. Phones open it in place, as before.
const wide = ref(false)
const wideQuery = typeof matchMedia === 'function' ? matchMedia('(min-width: 992px)') : null
const onWide = () => (wide.value = !!wideQuery?.matches)
onMounted(() => {
  onWide()
  wideQuery?.addEventListener('change', onWide)
})
onBeforeUnmount(() => wideQuery?.removeEventListener('change', onWide))
const spot = computed(() => {
  const id = wide.value ? (managing.value ?? editing.value ?? stopAsk.value) : null
  return timetable.value.some((r) => r.medicine.id === id) ? id : null // the pharmacist list keeps its own panel
})
function closeSpot() {
  const id = spot.value
  const from = stopAsk.value ? 'data-stop' : 'data-change' // back to the button that opened it
  managing.value = null
  editing.value = null
  stopAsk.value = null
  focusAfterUpdate(`[${from}="${id}"]`)
}
// Esc puts the card back, unless it is answering the stop question (which has its own Esc).
const onEsc = (e) => spot.value && !e.target.closest('[role="alertdialog"]') && closeSpot()
function openEdit(id) {
  managing.value = null
  editing.value = id // the form puts focus in its first field
}
function save(id, schedule) {
  setSchedule(id, schedule)
  closeEdit(id)
  notify(t('schedule.saved'))
}
function closeEdit(id) {
  editing.value = null
  focusAfterUpdate(`[data-change="${id}"]`) // back to its Change button
}

// --- Fix what we read: the saved details open on Confirm (no photo, no rescan); Looks correct brings them back here -------------
function fix(medicine) {
  Object.assign(scanStore, { current: scanFromMedicine(medicine), photos: [], pdfPages: null, confirmed: false })
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
  pageEl.value?.querySelector(`[data-change="${id}"]`)?.focus()
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
function undo() {
  clearTimeout(undoTimer)
  const { id } = removed.value.entry
  restoreMedicine(removed.value)
  removed.value = null
  focusAfterUpdate(`[data-change="${id}"]`) // the Undo button is gone: back to the medicine
}

// --- "I don't need this any more": ends the course (kept in the list as finished), after a short check-in, with Undo ----------------
const stopped = ref(null) // { id, name, previous } for the Undo bar
const stopUndoButton = ref(null)
let stopTimer = 0
function askStop(id) {
  managing.value = null
  editing.value = null
  stopAsk.value = id
  focusAfterUpdate(`[data-stop-yes="${id}"]`) // into the question, like the other pop-ups
}
function cancelStop(id) {
  stopAsk.value = null
  focusAfterUpdate(`[data-stop="${id}"]`)
}
async function confirmStop(medicine) {
  const previous = JSON.parse(JSON.stringify(medicine.schedule ?? null)) // a plain copy: the page's own data is wrapped and can't be stored as it is
  const next = stopCourse(previous, today.value)
  stopAsk.value = null
  if (!next) return
  clearTimeout(stopTimer)
  const name = nameOf(medicine.medication)
  if (previous.startDate >= today.value) {
    // It only started today: no day has been lived yet, so there is nothing to keep as "finished" (and a course cannot end
    // before it starts, so it would look unchanged). It comes off the list instead; Undo brings it back as it was.
    stopped.value = { id: medicine.id, name, gone: forgetMedicine(medicine.id) }
  } else {
    stopped.value = { id: medicine.id, name, previous }
    setSchedule(medicine.id, next)
  }
  stopTimer = setTimeout(() => (stopped.value = null), 8000)
  await nextTick()
  stopUndoButton.value?.focus()
}
function undoStop() {
  clearTimeout(stopTimer)
  const { id, previous, gone } = stopped.value
  if (gone) restoreMedicine(gone)
  else setSchedule(id, previous)
  stopped.value = null
  focusAfterUpdate(`[data-stop="${id}"]`)
}
// A finished course starts again from today, for as long as the label says (or the page asks how many days).
function startAgain(medicine) {
  const days = supplyDays(medicine.medication)
  const times = JSON.parse(JSON.stringify(medicine.schedule?.times ?? {}))
  setSchedule(medicine.id, days ? { startDate: today.value, days, times } : { startDate: today.value, times })
  notify(t('schedule.stop.back', { name: nameOf(medicine.medication) }))
}

onBeforeUnmount(() => {
  clearTimeout(undoTimer)
  clearTimeout(stopTimer)
  doses.stopClock()
})
</script>

<template>
  <div ref="pageEl" class="page schedule">
    <header class="head head-row">
      <div class="d-flex flex-column gap-1">
        <span class="date" data-testid="schedule-date">{{ dateText(today, { weekday: 'long', day: 'numeric', month: 'long' }) }}</span>
        <h1>{{ t(`schedule.title.${view}`) }}</h1>
      </div>
      <div class="head-acts">
        <RouterLink :to="{ name: 'scan', query: { type: 'medication' } }" class="btn btn-primary btn-sm"><AppIcon name="plus" />{{ t('schedule.add') }}</RouterLink>
      </div>
    </header>
    <!-- The four views are pages of their own (links, so Back and a shared link work), drawn as one segmented control. -->
    <nav v-if="medicines.length" class="tabs" :aria-label="t('pages.schedule')">
      <RouterLink v-for="v in VIEWS" :key="v" :to="viewLink(v)" class="tab" :aria-current="view === v ? 'page' : null" :data-testid="`tab-${v}`">{{ t(`schedule.tab.${v}`) }}</RouterLink>
    </nav>
    <EmptyState v-if="!medicines.length" :title="t('schedule.empty.title')" :text="t('schedule.empty.text')" icon="calendar">
      <RouterLink :to="{ name: 'scan', query: { type: 'medication' } }" class="btn btn-primary"><AppIcon name="scan" />{{ t('soon.scanMed') }}</RouterLink>
    </EmptyState>

    <div v-else-if="view === 'today'" class="d-flex flex-column gap-4">
      <DayStrip :entries="entries" :selected="day" @select="pickDay" />
      <Transition :name="`day-${slide}`" mode="out-in">
        <TodayList v-if="day === today" key="today" :entries="entries" :need-days="needDays" @notify="notify" />
        <DayOther v-else :key="day" :entries="entries" :date="day" />
      </Transition>
    </div>

    <div v-else-if="view === 'meds'" class="d-flex flex-column gap-4">
      <section v-if="timetable.length" aria-labelledby="meds-title" data-testid="schedule-meds">
        <h2 id="meds-title" class="visually-hidden">{{ t('schedule.meds.title') }}</h2>
        <ul class="med-grid" @keydown.esc="onEsc">
          <template v-for="r in timetable" :key="r.medicine.id">
          <li v-if="spot === r.medicine.id" class="med-ghost" aria-hidden="true" data-testid="med-ghost"></li>
          <MedicineCard
            :class="{ 'is-spot': spot === r.medicine.id }"
            :medicine="r.medicine"
            :entry="r.entry"
            :managing="managing === r.medicine.id"
            :editing="editing === r.medicine.id"
            :asking-stop="stopAsk === r.medicine.id"
            @manage="toggleManage(r.medicine.id)"
            @edit="openEdit(r.medicine.id)"
            @fix="fix(r.medicine)"
            @remove="remove(r.medicine)"
            @ask-stop="askStop(r.medicine.id)"
            @stop="confirmStop(r.medicine)"
            @cancel-stop="cancelStop(r.medicine.id)"
            @again="startAgain(r.medicine)"
            @save="save(r.medicine.id, $event)"
            @cancel-edit="closeEdit(r.medicine.id)"
          />
          </template>
        </ul>
        <div v-if="spot" class="med-scrim" aria-hidden="true" data-testid="med-scrim" @click="closeSpot"></div>
      </section>
      <PharmacistList v-if="flagged.length" :rows="flagged" :managing="managing" @manage="toggleManage" @fix="fix" @remove="remove" />
    </div>

    <!-- Reminders on the phone's own calendar, under My medicines. One card, always mounted (hidden on Today): every edit
         or Remove still reaches Google, even removing the last medicine (its reminders are deleted), and switching tabs
         doesn't ask Google again. -->
    <div v-show="view === 'meds'" class="rem-grid">
      <CalendarSync class="g-cal" :entries="entries" @notify="notify" />
    </div>

    <!-- Always in the page, so screen readers announce what appears in it. -->
    <div class="toast-slot" role="status" aria-live="polite">
      <Transition name="toast">
        <p v-if="toast" class="toast-ahma m-0" :class="{ bad: toast.bad }" data-testid="schedule-toast">
          <AppIcon :name="toast.bad ? 'alert' : 'checkCircle'" :size="22" />{{ toast.text }}
        </p>
      </Transition>
    </div>

    <div v-if="stopped" class="toast-ahma toast-undo rise" role="status" data-testid="schedule-stop-undo">
      <span>{{ t('schedule.stop.done', { name: stopped.name }) }}</span>
      <button ref="stopUndoButton" type="button" class="btn btn-on-hero btn-sm" @click="undoStop">{{ t('schedule.undo') }}</button>
    </div>

    <div v-if="removed" class="toast-ahma toast-undo rise" role="status" data-testid="schedule-undo">
      <span>{{ t('schedule.removed', { name: nameOf(removed.entry.medication) }) }}</span>
      <button ref="undoButton" type="button" class="btn btn-on-hero btn-sm" @click="undo">{{ t('schedule.undo') }}</button>
    </div>
  </div>
</template>

<style src="../styles/views/ScheduleSlots.css"></style>
<style scoped src="../styles/views/ScheduleView.css"></style>

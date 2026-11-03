<!-- Owner: Lokesh (redesigned by Claude from the Claude Design "Schedule" screens, declared in README.txt). Medicine schedule in
     four tabs, each its own address (?view=week | meds | reminders), so Back works:
       Today        what's due now, the day's progress, and a tick for every dose (components/schedule/TodayList.vue)
       This week    Monday to Sunday at a glance (components/schedule/WeekView.vue)
       My medicines one card per medicine (MedicineCard.vue, EditDaysForm.vue) and the pharmacist list (PharmacistList.vue)
       Reminders    Google Calendar alerts (CalendarSync.vue) and the day's dose times (RemindersPanel.vue)
     This page keeps what the tabs share: the header, which card has a panel open, Remove and Stop with Undo, and the toast.
     Times come from src/rules/schedule.js (our own rules, never AI). Ticks are in stores/doses.js. -->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
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
import WeekView from '../components/schedule/WeekView.vue'
import TodayList from '../components/schedule/TodayList.vue'
import MedicineCard from '../components/schedule/MedicineCard.vue'
import PharmacistList from '../components/schedule/PharmacistList.vue'
import RemindersPanel from '../components/schedule/RemindersPanel.vue'

const { medicines, setSchedule, forgetMedicine, restoreMedicine } = useMedicinesStore()
const scanStore = useScanStore()
const doses = useDosesStore()
const { today, nowTime, taken } = storeToRefs(doses)
const { toast, notify } = useToast()
const { dateText } = useScheduleText()

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

// Which tab: in the address, so Back returns to it and a link can open it. Unknown values show Today.
const VIEWS = ['today', 'week', 'meds', 'reminders']
// Back from Google (?google=connected) opens Reminders, where the calendar card is; CalendarSync then tidies the address.
const view = computed(() => (route.query.google !== undefined ? 'reminders' : VIEWS.includes(route.query.view) ? route.query.view : 'today'))
const viewLink = (v) => ({ query: v === 'today' ? {} : { view: v } })
// Keyboard users never lose their place: after the page updates, focus moves to the element that now matters.
const focusAfterUpdate = async (selector) => {
  await nextTick()
  document.querySelector(selector)?.focus()
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
  <div class="page schedule">
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
    <p v-if="view === 'reminders'" class="lead m-0">{{ t('schedule.rem.lead') }}</p>

    <EmptyState v-if="!medicines.length && view !== 'reminders'" :title="t('schedule.empty.title')" :text="t('schedule.empty.text')" icon="calendar">
      <RouterLink :to="{ name: 'scan', query: { type: 'medication' } }" class="btn btn-primary"><AppIcon name="scan" />{{ t('soon.scanMed') }}</RouterLink>
    </EmptyState>

    <TodayList v-else-if="view === 'today'" :entries="entries" :need-days="needDays" @notify="notify" />

    <WeekView v-else-if="view === 'week'" :entries="entries" :today="today" :now="nowTime" :taken-today="taken" :flagged="flagged" />

    <div v-else-if="view === 'meds'" class="d-flex flex-column gap-4">
      <section v-if="timetable.length" aria-labelledby="meds-title" data-testid="schedule-meds">
        <h2 id="meds-title" class="visually-hidden">{{ t('schedule.meds.title') }}</h2>
        <ul class="med-grid">
          <MedicineCard
            v-for="r in timetable"
            :key="r.medicine.id"
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
        </ul>
      </section>
      <PharmacistList v-if="flagged.length" :rows="flagged" :managing="managing" @manage="toggleManage" @fix="fix" @remove="remove" />
    </div>

    <!-- One calendar card, always mounted (hidden off this page): every edit or Remove still reaches Google, even removing
         the last medicine (its reminders are deleted), and switching tabs doesn't ask Google again. -->
    <div v-show="view === 'reminders'" class="rem-grid">
      <CalendarSync class="g-cal" :entries="entries" @notify="notify" />
      <RemindersPanel :rows="timetable" />
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

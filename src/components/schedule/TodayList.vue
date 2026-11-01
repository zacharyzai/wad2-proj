<!-- Owner: Lokesh (built by Claude, declared in README.txt). Schedule, "Today": what's due now, the day's progress, and a big
     tick row for every dose, grouped by time of day. Ticks live in the doses store (stores/doses.js). -->
<script setup>
import { computed, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useDosesStore } from '../../stores/doses'
import { useScheduleText, SLOT_ICONS } from '../../composables/useScheduleText'
import { dosesOn, timeStates } from '../../rules/schedule'
import AppIcon from '../layout/AppIcon.vue'
import ErrorBanner from '../layout/ErrorBanner.vue'

const props = defineProps({
  entries: { type: Array, required: true }, // every ScheduleEntry
  needDays: { type: Number, default: 0 }, // medicines still waiting for their number of days
})
const emit = defineEmits(['notify'])

const { t } = useI18n()
const { timeText, doseText, purposeOf } = useScheduleText()
const doses = useDosesStore()
const { today, nowTime, taken, ready, loadError } = storeToRefs(doses)
const medsLink = { query: { view: 'meds' } }

const todayDoses = computed(() => dosesOn(props.entries, today.value))
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
const allTaken = (g) => g.doses.every((d) => taken.value.has(d.id))
// The time that's due and not yet ticked: shown at the top with one "I've taken it" for all its doses.
const dueGroup = computed(() => (ready.value ? groups.value.find((g) => g.state === 'now' && !allTaken(g)) : null))
const takeAll = (g) => g.doses.filter((d) => !taken.value.has(d.id)).forEach((d) => toggle(d, true))
// "Next: Metformin at 6:00 PM": the first untaken dose that isn't due yet.
const nextDose = computed(() => groups.value.filter((g) => g.state === 'later').flatMap((g) => g.doses).find((d) => !taken.value.has(d.id)))
const doneCount = computed(() => todayDoses.value.filter((d) => taken.value.has(d.id)).length)
const RING = 2 * Math.PI * 30 // the progress ring's circumference (r = 30)

// What the band's label says. Taken is taken, whatever the time; a missed one says "Not ticked yet", never "take it now".
function bandStatus(g) {
  if (allTaken(g)) return { kind: 'done', text: t('schedule.slot.done') }
  return { kind: g.state, text: t(`schedule.slot.${g.state}`) }
}

const focusAfterUpdate = async (selector) => {
  await nextTick()
  document.querySelector(selector)?.focus()
}

// The tick changes at once; if the server says no, it goes back and a short message says so.
async function toggle(dose, sure = false) {
  const result = await doses.toggle(dose, sure)
  if (result === 'early') askEarly(dose)
  if (result === 'failed') emit('notify', t('schedule.tickFailed'), true)
}

// "This dose is for later today. Have you already taken it?" Yes records the tick; Not yet leaves it, focus back on it.
const confirming = ref(null) // id of the dose being asked about
function askEarly(dose) {
  confirming.value = dose.id
  focusAfterUpdate(`[data-early-yes="${dose.id}"]`)
}
function answerEarly(dose, tookIt) {
  confirming.value = null
  if (tookIt) toggle(dose, true)
  focusAfterUpdate(`[data-tick="${dose.id}"]`)
}
</script>

<template>
  <section class="d-flex flex-column gap-4" aria-labelledby="today-title" data-testid="schedule-today">
    <h2 id="today-title" class="visually-hidden">{{ t('schedule.today') }}</h2>
    <ErrorBanner v-if="loadError" :code="loadError" retryable @retry="doses.loadTicks" />

    <p v-if="!todayDoses.length" class="card m-0 text-muted-a11y" data-testid="schedule-none-today">
      {{ t(needDays ? 'schedule.noneTodayNeedDays' : 'schedule.noneToday') }}
      <RouterLink v-if="needDays" :to="medsLink" class="d-block mt-2 fw-bold">{{ t('schedule.tab.meds') }}</RouterLink>
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
              <div class="dose" :class="{ done: taken.has(d.id), busy: !ready }">
                <span class="box" aria-hidden="true"><AppIcon name="check" :size="26" :stroke="3" /></span>
                <span class="dose-info">
                  <button
                    type="button"
                    class="dose-btn"
                    :data-tick="d.id"
                    :aria-pressed="taken.has(d.id)"
                    :aria-label="t('schedule.tickLabel', { name: d.label, time: timeText(d.time) })"
                    :aria-describedby="`dose-detail-${d.id}`"
                    :disabled="!ready"
                    @click="toggle(d)"
                  >{{ d.label }}</button>
                  <span v-if="purposeOf(d.medicineId)" class="dose-detail" data-testid="dose-purpose">{{ purposeOf(d.medicineId) }}</span>
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
    <RouterLink v-if="needDays && todayDoses.length" :to="medsLink" class="alert alert-warning need-link" data-testid="schedule-need-days-link">
      <AppIcon name="alert" /><span>{{ t('schedule.needDaysCount', { n: needDays }, needDays) }}</span><AppIcon name="right" class="ms-auto" />
    </RouterLink>
  </section>
</template>

<style scoped src="../../styles/components/TodayList.css"></style>

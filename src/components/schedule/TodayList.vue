<!-- Schedule's Today tab: missed-dose warning, what is due now, progress and the day's doses. -->
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useDosesStore } from '../../stores/doses'
import { useScheduleText, SLOT_ICONS } from '../../composables/useScheduleText'
import { dosesOn, timeInSingapore, timeStates, tooEarly } from '../../rules/schedule'
import AppIcon from '../layout/AppIcon.vue'
import ErrorBanner from '../layout/ErrorBanner.vue'
import KindIcon from '../layout/KindIcon.vue'

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
  const list = [...byTime].map(([time, doses]) => ({
    time,
    doses,
    slot: doses.every((d) => d.slot === doses[0].slot) ? doses[0].slot : null,
  }))
  const states = timeStates(
    list.map((g) => g.time),
    nowTime.value,
  )
  return list.map((g, i) => ({ ...g, state: states[i] }))
})
// Today's doses whose time has passed with no tick, oldest first: flagged at the top so none is overlooked.
const missed = computed(() =>
  ready.value
    ? groups.value
        .filter((g) => g.state === 'earlier')
        .flatMap((g) => g.doses)
        .filter((d) => !taken.value.has(d.id))
    : [],
)
// True when every dose in a time group is ticked.
const allTaken = (g) => g.doses.every((d) => taken.value.has(d.id))
// The time that's due and not yet ticked: shown at the top with "I've taken it" for each of its doses.
const dueGroup = computed(() =>
  ready.value ? groups.value.find((g) => g.state === 'now' && !allTaken(g)) : null,
)
// "Next: Metformin at 6:00 PM": the first untaken dose that isn't due yet.
const nextDose = computed(() =>
  groups.value
    .filter((g) => g.state === 'later')
    .flatMap((g) => g.doses)
    .find((d) => !taken.value.has(d.id)),
)
const doneCount = computed(() => todayDoses.value.filter((d) => taken.value.has(d.id)).length)
const RING = 2 * Math.PI * 30 // the progress ring's circumference (r = 30)
const percent = computed(() =>
  todayDoses.value.length ? Math.round((doneCount.value / todayDoses.value.length) * 100) : 0,
)
// The % counts up to its new value (and the ring fills with it), from 0 when the page opens. Reduced motion: at once.
// After a tick of their own, one calm sequence, in this order and never overlapping:
//   1. a soft glow sweeps the card from left to right at one steady speed (BAND_MS);
//   2. the moment its front edge reaches the ring (worked out from where the ring is), it is logged: Taken goes up with a
//      little bump and "+1", two rings ripple out of the progress ring (drawn inside it, so always centred on it), the
//      card's edge flashes, the % counts up, and on the last dose "Well done!" slides in;
//   3. the glow fades.
// Until step 2, the card still shows the day before the tick, so nothing jumps ahead of the glow. A tick the account
// doesn't save (it goes back) cancels whatever is still to come. Ticks arriving with the page, or an untick: no sweep,
// the numbers just change.
const BAND_MS = 700
const COUNT_MS = 900
const planEl = ref(null)
const ringEl = ref(null)
const shown = ref(0) // the % on the ring
const shownDone = ref(0) // the Taken number, and whether "Well done!" shows: changes when the glow reaches the ring
const sweep = ref(0) // a new value plays the glow again (its key)
const sweeping = ref(false) // the glow is on the card
const hit = ref(0) // a new value plays the ripples and "+1" (the glow has reached the ring)
const landed = ref(false) // the ring glows and the card's edge flashes, for a moment
const popping = ref(false) // Taken bumps, for a moment
let celebrate = false // the next rise in the % comes from their own tick
let frame = 0
const timers = []
const later = (fn, ms) => timers.push(setTimeout(fn, ms))
const stopAll = () => {
  cancelAnimationFrame(frame)
  timers.splice(0).forEach(clearTimeout)
}
// Animates the "taken" counter up or down to its new number.
function countTo(to) {
  cancelAnimationFrame(frame)
  const from = shown.value
  const start = performance.now()
  // One frame of the counter animation.
  const step = (now) => {
    const k = Math.min(1, (now - start) / COUNT_MS)
    shown.value = Math.round(
      from + (to - from) * (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
    ) // eased in and out
    if (k < 1) frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}
// Everything shows the day as it is now, at once: no glow, no ripples.
function settle(to) {
  stopAll()
  sweeping.value = landed.value = popping.value = false
  shownDone.value = doneCount.value
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) shown.value = to
  else countTo(to)
}
watch(
  percent,
  (to, before) => {
    const grew = celebrate && before !== undefined && to > before
    celebrate = false
    if (!grew || matchMedia('(prefers-reduced-motion: reduce)').matches) return settle(to)
    stopAll()
    landed.value = popping.value = false
    const card = planEl.value?.getBoundingClientRect()
    const ring = ringEl.value?.getBoundingClientRect()
    if (!card || !ring) return settle(to)
    // The glow's front edge moves at one speed, so it reaches the ring's middle this many ms in.
    const arrive = Math.round((BAND_MS * (ring.left - card.left + ring.width / 2)) / card.width)
    sweep.value++
    sweeping.value = true
    later(() => {
      shownDone.value = doneCount.value
      hit.value++
      landed.value = popping.value = true
      countTo(to)
    }, arrive)
    later(() => (popping.value = false), arrive + 520)
    later(() => (landed.value = false), arrive + COUNT_MS)
    later(() => (sweeping.value = false), BAND_MS + 520) // after the glow has faded
  },
  { immediate: true },
)
onBeforeUnmount(stopAll)

// The "Time for…" box folds away smoothly once its doses are taken, so the cards under it glide up instead of jumping.
const holdHeight = (el) => (el.style.maxHeight = `${el.offsetHeight}px`)

// What the band's label says. Taken is taken, whatever the time; a missed one says "Not ticked yet", never "take it now".
function bandStatus(g) {
  if (allTaken(g)) return { kind: 'done', text: t('schedule.slot.done') }
  return { kind: g.state, text: t(`schedule.slot.${g.state}`) }
}

const listEl = ref(null) // look only inside this page, never the whole document
// After the list redraws, moves focus to the element matching the selector.
const focusAfterUpdate = async (selector) => {
  await nextTick()
  listEl.value?.querySelector(selector)?.focus()
}

// The tick changes at once; if the server says no, it goes back and a short message says so.
async function toggle(dose, sure = false) {
  celebrate = !taken.value.has(dose.id) // ticking it (not unticking): the card celebrates
  const result = await doses.toggle(dose, sure)
  if (result === 'skipped' || result === 'early') celebrate = false
  if (result === 'failed') emit('notify', t('schedule.tickFailed'), true)
}

// Tapping a dose not taken yet asks first, in a pop-up: "Did you take it?" (or, for one due later today, "This dose is for
// later today. Have you already taken it?"). Yes records the tick; Not yet (or Esc, or a tap outside) leaves it, and focus
// goes back to the dose. Tapping one already ticked unticks it at once. A native <dialog>: focus stays inside while open.
const asking = ref(null) // { dose, early } while the pop-up is open
const askBox = ref(null)
// Tapping an unticked dose asks first; tapping a ticked one unticks it.
function tap(dose) {
  if (taken.value.has(dose.id)) return toggle(dose)
  asking.value = { dose, early: tooEarly(dose.time, timeInSingapore()) }
}
watch(asking, async (open) => {
  await nextTick()
  if (open && !askBox.value?.open) askBox.value?.showModal()
  else if (!open && askBox.value?.open) askBox.value.close()
})
// Handles "Yes, I took it" or "No" from the question.
function answer(tookIt) {
  if (!asking.value) return
  const { dose } = asking.value
  asking.value = null
  if (tookIt) toggle(dose, true)
  focusAfterUpdate(`[data-tick="${dose.id}"]`)
}
// A tap on the dark area counts as "No".
const onBackdrop = (event) => event.target === askBox.value && answer(false)
</script>

<template>
  <section
    ref="listEl"
    class="d-flex flex-column gap-4"
    aria-labelledby="today-title"
    data-testid="schedule-today"
  >
    <h2 id="today-title" class="visually-hidden">{{ t('schedule.today') }}</h2>
    <ErrorBanner v-if="loadError" :code="loadError" retryable @retry="doses.loadTicks" />

    <p v-if="!todayDoses.length" class="card m-0 text-muted-a11y" data-testid="schedule-none-today">
      {{ t(needDays ? 'schedule.noneTodayNeedDays' : 'schedule.noneToday') }}
      <RouterLink v-if="needDays" :to="medsLink" class="d-block mt-2 fw-bold">{{
        t('schedule.tab.meds')
      }}</RouterLink>
    </p>
    <template v-else>
      <!-- Missed doses, flagged in words and an icon. Never a "take it now": what to do is the pharmacist's call. -->
      <div
        v-if="missed.length"
        class="alert alert-warning"
        role="alert"
        data-testid="schedule-missed"
      >
        <AppIcon name="alert" />
        <div class="d-flex flex-column gap-2">
          <strong>{{ t('schedule.slot.missedTitle', { n: missed.length }, missed.length) }}</strong>
          <ul class="m-0 ps-3">
            <li v-for="d in missed" :key="d.id">{{ d.label }} · {{ timeText(d.time) }}</li>
          </ul>
          <span>{{ t('schedule.slot.missed') }}</span>
        </div>
      </div>

      <!-- What's due now: the one thing to do, with "I've taken it" for each dose of that time. Never for a missed dose. -->
      <Transition name="due-out" @before-leave="holdHeight">
        <section
          v-if="dueGroup"
          class="due"
          :class="`slot-${dueGroup.slot ?? 'other'}`"
          aria-labelledby="due-title"
          data-testid="schedule-due"
        >
          <div class="d-flex align-items-start gap-3">
            <span class="slot-tile lg" aria-hidden="true"
              ><AppIcon :name="SLOT_ICONS[dueGroup.slot] ?? 'clock'" :size="26"
            /></span>
            <div class="d-flex flex-column gap-1 min-w-0">
              <h2 id="due-title" class="due-title">
                {{
                  dueGroup.doses.length === 1
                    ? t('schedule.due.one', { name: dueGroup.doses[0].label })
                    : t('schedule.due.many', { n: dueGroup.doses.length })
                }}
              </h2>
              <p class="m-0">
                {{
                  t(dueGroup.doses.length > 1 ? 'schedule.due.textMany' : 'schedule.due.text', {
                    time: timeText(dueGroup.time),
                  })
                }}
              </p>
            </div>
          </div>
          <!-- Several due together: a button for each, so a tablet that wasn't taken is never ticked with the others. -->
          <ul v-if="dueGroup.doses.length > 1" class="due-list">
            <li v-for="d in dueGroup.doses" :key="d.id" :data-testid="`schedule-due-${d.id}`">
              <span class="due-med"
                ><strong>{{ d.label }}</strong
                ><span class="text-muted-a11y">{{ doseText(d.instruction) }}</span></span
              >
              <span v-if="taken.has(d.id)" class="badge badge-success"
                ><AppIcon name="check" :size="18" :stroke="3" />{{ t('schedule.taken') }}</span
              >
              <button
                v-else
                type="button"
                class="btn btn-primary"
                :aria-label="t('schedule.due.takeLabel', { name: d.label })"
                data-testid="schedule-due-take"
                @click="toggle(d, true)"
              >
                <AppIcon name="check" />{{ t('schedule.due.take') }}
              </button>
            </li>
          </ul>
          <button
            v-else
            type="button"
            class="btn btn-primary"
            data-testid="schedule-due-take"
            @click="toggle(dueGroup.doses[0], true)"
          >
            <AppIcon name="check" />{{ t('schedule.due.take') }}
          </button>
        </section>
      </Transition>

      <!-- The day's progress: the words say it; the numbers and the ring only show it. -->
      <div
        ref="planEl"
        class="progress-card"
        :class="{ logged: landed }"
        data-testid="schedule-progress"
      >
        <!-- Success, after a dose is ticked (decoration): a glow sweeps the card from left to right. -->
        <span
          v-if="sweeping"
          :key="sweep"
          class="pc-sweep"
          aria-hidden="true"
          data-testid="schedule-progress-sweep"
          ><span class="pc-trail"></span
        ></span>
        <div class="pc-words">
          <span class="pc-title">{{ t('schedule.plan.title') }}</span>
          <div class="pc-stats" aria-hidden="true">
            <span
              ><small>{{ t('schedule.plan.total') }}</small
              ><b>{{ todayDoses.length }}</b></span
            >
            <span class="pc-taken"
              ><small>{{ t('schedule.plan.taken') }}</small
              ><b :class="{ bump: popping }">{{ shownDone }}</b
              ><span v-if="hit" :key="hit" class="pc-plus" data-testid="schedule-progress-plus"
                >+1</span
              ></span
            >
          </div>
          <!-- "Well done!" slides in (its words are always there for screen readers, saying how many are taken). -->
          <div class="pc-done" :class="{ open: shownDone === todayDoses.length }">
            <div class="pc-done-inner">
              <strong
                class="progress-words"
                :class="{ 'visually-hidden': shownDone !== todayDoses.length }"
                data-testid="schedule-progress-words"
                >{{
                  shownDone === todayDoses.length
                    ? t('schedule.allDone')
                    : t('schedule.progress', { done: shownDone, total: todayDoses.length })
                }}</strong
              >
            </div>
          </div>
          <span v-if="nextDose" class="pc-next">{{
            t('schedule.next', { name: nextDose.label, time: timeText(nextDose.time) })
          }}</span>
        </div>
        <span class="ring-wrap">
          <!-- Logged: two rings ripple out of the progress ring (decoration). -->
          <template v-if="hit"
            ><span :key="`a${hit}`" class="pc-ripple" aria-hidden="true"></span
            ><span :key="`b${hit}`" class="pc-ripple late" aria-hidden="true"></span
          ></template>
          <svg ref="ringEl" class="ring" :class="{ landed }" viewBox="0 0 72 72" aria-hidden="true">
            <circle cx="36" cy="36" r="30" class="ring-track" />
            <circle
              cx="36"
              cy="36"
              r="30"
              class="ring-fill"
              :class="{ full: shownDone === todayDoses.length }"
              :stroke-dasharray="RING"
              :stroke-dashoffset="RING * (1 - shown / 100)"
            />
            <text x="36" y="36" class="ring-num" text-anchor="middle" dominant-baseline="central">
              {{ shown }}%
            </text>
          </svg>
        </span>
      </div>

      <!-- One group per time of day, coloured like a pill-box compartment (the word and icon always beside the colour),
           then a card for each medicine. -->
      <div class="slot-grid">
        <section
          v-for="g in groups"
          :key="g.time"
          class="slot-group"
          :class="[`slot-${g.slot ?? 'other'}`, `is-${g.state}`]"
          :aria-labelledby="`slot-title-${g.time}`"
          :data-testid="`slot-${g.time}`"
          :data-state="g.state"
        >
          <div class="group-head">
            <span class="slot-tile sm" aria-hidden="true"
              ><AppIcon :name="SLOT_ICONS[g.slot] ?? 'clock'" :size="20"
            /></span>
            <h3 :id="`slot-title-${g.time}`" class="group-name">
              <template v-if="g.slot"
                >{{ t(`timing.${g.slot}`) }}<span class="visually-hidden"> · </span></template
              >
              <span class="slot-clock">{{ timeText(g.time) }}</span>
            </h3>
            <span
              class="badge slot-state"
              :class="`state-${bandStatus(g).kind}`"
              data-testid="slot-state"
            >
              <AppIcon v-if="bandStatus(g).kind === 'done'" name="checkCircle" :size="18" />{{
                bandStatus(g).text
              }}
            </span>
          </div>
          <!-- Never "take it now" for a missed dose: that is the pharmacist's call. -->
          <p v-if="g.state === 'earlier' && !allTaken(g)" class="slot-note m-0">
            {{ t('schedule.slot.missed') }}
          </p>
          <ul class="cards">
            <li v-for="(d, i) in g.doses" :key="d.id" :data-testid="`dose-${d.id}`">
              <!-- The tick. The button holds only the medicine's name (so what's seen is what's spoken: WCAG 2.5.3) and its click area
                   stretches over the whole row, a big target for unsteady hands. aria-pressed says taken or not; the amount and
                   the word under it are plain text beside it. -->
              <div
                class="dose dcard"
                :class="{ done: taken.has(d.id), busy: !ready }"
                :style="{ '--n': i }"
              >
                <KindIcon kind="medication" :size="48" />
                <span class="dose-info dcard-info">
                  <span class="tag" aria-hidden="true">{{ timeText(d.time) }}</span>
                  <button
                    type="button"
                    class="dose-btn"
                    :data-tick="d.id"
                    :aria-pressed="taken.has(d.id)"
                    :aria-label="t('schedule.tickLabel', { name: d.label, time: timeText(d.time) })"
                    :aria-describedby="`dose-detail-${d.id}`"
                    :disabled="!ready"
                    @click="tap(d)"
                  >
                    {{ d.label }}
                  </button>
                  <span
                    v-if="purposeOf(d.medicineId)"
                    class="dose-detail"
                    data-testid="dose-purpose"
                    >{{ purposeOf(d.medicineId) }}</span
                  >
                  <span :id="`dose-detail-${d.id}`" class="dose-detail">{{
                    doseText(d.instruction)
                  }}</span>
                </span>
                <!-- Its state, on the right: taken (it pops in) or "Tap when taken". The whole card is the button. -->
                <span
                  :key="taken.has(d.id) ? 'on' : 'off'"
                  class="box pill dose-word"
                  :class="taken.has(d.id) ? 'pill-ok pop' : 'pill-tap'"
                  aria-hidden="true"
                >
                  <AppIcon v-if="taken.has(d.id)" name="check" :size="18" :stroke="3" />{{
                    taken.has(d.id) ? t('schedule.taken') : t('schedule.tapWhenTaken')
                  }}
                </span>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <!-- "Did you take it?": a pop-up with the pill bobbing in soft rings, and two big choices. -->
    <dialog
      ref="askBox"
      class="take-ask"
      role="alertdialog"
      aria-labelledby="take-title"
      aria-describedby="take-text"
      data-testid="schedule-take-ask"
      @cancel.prevent="answer(false)"
      @click="onBackdrop"
    >
      <div v-if="asking" class="ask-card">
        <div class="ask-art" aria-hidden="true">
          <span class="ask-ring"></span><span class="ask-ring two"></span>
          <KindIcon kind="medication" :size="76" class="ask-pill" />
        </div>
        <h2 id="take-title" class="ask-title">
          {{
            asking.early
              ? t('schedule.early.title')
              : t('schedule.ask.title', { name: asking.dose.label })
          }}
        </h2>
        <p v-if="doseText(asking.dose.instruction)" class="ask-dose">
          {{ doseText(asking.dose.instruction) }}
        </p>
        <p id="take-text" class="ask-text">
          {{
            asking.early
              ? t('schedule.early.text', {
                  name: asking.dose.label,
                  time: timeText(asking.dose.time),
                })
              : t('schedule.ask.when', { time: timeText(asking.dose.time) })
          }}
        </p>
        <div class="ask-acts">
          <button
            type="button"
            class="btn btn-primary"
            autofocus
            :data-early-yes="asking.dose.id"
            @click="answer(true)"
          >
            <AppIcon name="check" :size="22" />{{ t('schedule.early.yes') }}
          </button>
          <button type="button" class="btn btn-secondary" @click="answer(false)">
            {{ t('schedule.early.no') }}
          </button>
        </div>
      </div>
    </dialog>

    <!-- Medicines still waiting for their number of days: one line here, the form is in My medicines. -->
    <RouterLink
      v-if="needDays && todayDoses.length"
      :to="medsLink"
      class="alert alert-warning need-link"
      data-testid="schedule-need-days-link"
    >
      <AppIcon name="alert" /><span>{{
        t('schedule.needDaysCount', { n: needDays }, needDays)
      }}</span
      ><AppIcon name="right" class="ms-auto" />
    </RouterLink>
  </section>
</template>

<style scoped src="../../styles/components/DayCards.css"></style>
<style scoped src="../../styles/components/TodayList.css"></style>

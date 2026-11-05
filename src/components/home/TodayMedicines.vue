<!-- Owner: Asher. Home's "Today's medicines": a reminder for the one pill to take next, on a dark teal card. A bell
     that rings whenever the greeting's capsule moves (and opens Schedule when tapped), its time, the pill and how much, its name and food, and one big
     "I've taken it" when it is due. When several are due together, one shows at a time: tick it and the next one comes
     (so one not taken is never ticked with another). Nothing due yet: what is next, and when. All taken: well done.
     Under it, how many are taken today, and a gentle line for any earlier dose not ticked yet. The same size as the greeting
     beside it on computers. Doses, ticks and words come from Schedule (src/rules/schedule.js, stores/doses.js,
     schedule.*), so Home and Schedule always agree. A new reminder turns the card over (CSS 3D); still with reduced motion. -->
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useMedicinesStore } from '../../stores/medicines'
import { useDosesStore } from '../../stores/doses'
import { buildSchedule, dosesOn, timeStates } from '../../rules/schedule'
import AppIcon from '../layout/AppIcon.vue'
import KindIcon from '../layout/KindIcon.vue'
import { launch } from '../../composables/useCardLaunch'
import { capsuleBeat } from '../../composables/useCapsuleBeat'

const { medicines } = useMedicinesStore()
// Today's ticks come from the same store as Schedule's Today, so a tick on one shows on the other.
const dosesStore = useDosesStore()
const { today, nowTime, taken, ready, busy: saving, loadError: failed } = storeToRefs(dosesStore)

const { t, locale } = useI18n()

const doses = computed(() =>
  dosesOn(
    medicines.map((m) => buildSchedule(m, m.schedule ?? {})),
    today.value,
  ),
)

// The day's times, each 'earlier', 'now' or 'later', as on Schedule's Today.
const groups = computed(() => {
  const byTime = new Map()
  for (const dose of doses.value) byTime.set(dose.time, [...(byTime.get(dose.time) ?? []), dose])
  const list = [...byTime].map(([time, list]) => ({ time, doses: list }))
  const states = timeStates(
    list.map((g) => g.time),
    nowTime.value,
  )
  return list.map((g, i) => ({ ...g, state: states[i] }))
})

const saved = ref(false) // "Marked as taken." for a few seconds after a tick
const notSaved = ref(false) // the last tick didn't reach the account

// The one pill to show: the first not taken of the time that is due, else the next one later today.
const dueDose = computed(() =>
  ready.value
    ? (groups.value.find((g) => g.state === 'now')?.doses.find((d) => !taken.value.has(d.id)) ??
      null)
    : null,
)
const next = computed(
  () =>
    groups.value
      .filter((g) => g.state === 'later')
      .flatMap((g) => g.doses)
      .find((d) => !taken.value.has(d.id)) ?? null,
)
const shown = computed(() => (ready.value ? (dueDose.value ?? next.value) : null))
const missed = computed(
  () =>
    groups.value
      .filter((g) => g.state === 'earlier')
      .flatMap((g) => g.doses)
      .filter((d) => !taken.value.has(d.id)).length,
)
const doneCount = computed(() => doses.value.filter((d) => taken.value.has(d.id)).length)
// Which face the card shows; a change of face turns the card over.
const face = computed(() => {
  if (!ready.value) return 'wait'
  if (shown.value) return `dose-${shown.value.id}`
  return doneCount.value === doses.value.length ? 'done' : 'rest'
})

// Words for times and doses, in the page language (Singapore times, whatever the device's time zone), as on Schedule.
const timeText = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(locale.value, {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  })
}
// "1 tablet", and "After food", each on its own line on the card.
const amountOf = ({ count, unit }) =>
  count != null ? `${count} ${t(`unit.${unit ?? 'other'}`, count)}` : ''
// "With food" / "before food" wording for a dose.
const foodOf = ({ food }) => (food ? t(`food.${food}`) : '')
// What it is for, beside the name: seniors know "for diabetes", not "Metformin". The words' own brackets become a dot, so there are
// never brackets inside brackets.
function purposeOf(dose) {
  const purpose = medicines.find((m) => m.id === dose.medicineId)?.medication?.purpose
  return purpose ? t(`purpose.${purpose}`).replace(/\s*[(（](.+?)[)）]/, ' · $1') : ''
}

// "I've taken it" ticks the pill that is due. (Due means within the hour, so it is never "too early".) Shown at once;
// if the account doesn't save it, the tick goes back and a short message says so.
let savedTimer = 0
// Ticks a dose as taken.
async function take(dose) {
  if (taken.value.has(dose.id)) return
  const result = await dosesStore.toggle(dose, true)
  if (result === 'skipped') return
  notSaved.value = result === 'failed'
  saved.value = result === 'saved'
  clearTimeout(savedTimer)
  if (saved.value) savedTimer = setTimeout(() => (saved.value = false), 5000)
}

// The bell rings whenever the greeting's capsule does something (WavingCapsule.vue), so the two move together, at the
// same calm pace, and the reminder catches the eye without nagging. The capsule never moves with reduced motion.
const ringing = ref(false)
let bellTimer = 0
watch(capsuleBeat, () => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  clearTimeout(bellTimer)
  ringing.value = false
  requestAnimationFrame(() => {
    ringing.value = true // a fresh class, so the swing starts again
    bellTimer = setTimeout(() => (ringing.value = false), 1100)
  })
})

onMounted(() => {
  if (!dosesStore.newDay()) dosesStore.loadTicks() // a new day loads its own ticks
  dosesStore.startClock()
})
onBeforeUnmount(() => {
  dosesStore.stopClock()
  clearTimeout(savedTimer)
  clearTimeout(bellTimer)
})
</script>

<template>
  <section class="today" aria-labelledby="today-title" data-testid="home-today">
    <div class="today-head">
      <h2 id="today-title" class="today-title">{{ t('home.today.title') }}</h2>
      <!-- Opens with its own short picture (a calendar ticked), like Home's other cards. -->
      <RouterLink v-slot="{ href, navigate }" :to="{ name: 'schedule' }" custom>
        <a
          :href="href"
          class="today-open"
          data-testid="home-today-open"
          @click="launch($event, 'schedule', navigate)"
          >{{ t('home.today.open') }}<AppIcon name="right" :size="18"
        /></a>
      </RouterLink>
    </div>

    <!-- No medicines at all: how to get reminders. -->
    <p v-if="!medicines.length" class="today-empty">{{ t('home.today.noMeds') }}</p>
    <p v-else-if="!doses.length" class="today-empty">{{ t('schedule.noneToday') }}</p>
    <p v-else-if="failed" class="today-empty" role="alert">{{ t('home.today.loadFailed') }}</p>

    <template v-else>
      <div class="turn-box">
        <Transition name="turn" mode="out-in">
          <!-- The reminder: the next pill to take. -->
          <div
            v-if="shown"
            :key="face"
            class="focus"
            :data-testid="dueDose ? 'home-today-due' : 'home-today-upcoming'"
          >
            <h3 class="visually-hidden">
              {{
                dueDose
                  ? t('schedule.due.one', { name: shown.label })
                  : t('schedule.next', { name: shown.label, time: timeText(shown.time) })
              }}
            </h3>
            <div class="fchips">
              <!-- A bell (a reminder), ringing with the capsule. A link to Schedule too, like "Open my schedule". Named in words
                   for screen readers: "Take now. Open my schedule" (or "Next. …"). -->
              <RouterLink v-slot="{ href, navigate }" :to="{ name: 'schedule' }" custom>
                <a
                  :href="href"
                  class="bell"
                  :class="{ ringing }"
                  :aria-label="`${dueDose ? t('schedule.slot.now') : t('home.today.nextChip')}. ${t('home.today.open')}`"
                  data-testid="home-today-bell"
                  @click="launch($event, 'schedule', navigate)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="26"
                    height="26"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      class="bell-body"
                      d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8.5 2.5 8.5h-17S6 15.5 6 9"
                    />
                    <path class="bell-clapper" d="M10.3 20.5a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                </a>
              </RouterLink>
              <span class="fchip"
                ><AppIcon name="clock" :size="18" />{{ timeText(shown.time) }}</span
              >
            </div>
            <div class="fdose-row">
              <span class="amount"
                ><KindIcon kind="medication" :size="40" /><span
                  v-if="amountOf(shown.instruction)"
                  >{{ amountOf(shown.instruction) }}</span
                ></span
              >
              <span class="fdose-words">
                <strong class="fdose-name"
                  >{{ shown.label }}
                  <span
                    v-if="purposeOf(shown)"
                    class="fdose-purpose"
                    data-testid="home-today-purpose"
                    >({{ purposeOf(shown) }})</span
                  ></strong
                >
                <span v-if="foodOf(shown.instruction)" class="fdose-food"
                  ><AppIcon name="food" :size="18" />{{ foodOf(shown.instruction) }}</span
                >
              </span>
            </div>
            <button
              v-if="dueDose"
              type="button"
              class="take-btn"
              :disabled="saving.has(shown.id)"
              :aria-label="t('schedule.due.takeLabel', { name: shown.label })"
              data-testid="home-today-take"
              @click="take(shown)"
            >
              <AppIcon name="checkCircle" :size="22" />{{ t('schedule.due.take') }}
            </button>
            <p v-else class="later-words" data-testid="home-today-next">
              {{ t('schedule.next', { name: shown.label, time: timeText(shown.time) }) }}
            </p>
          </div>
          <!-- Nothing left to take: everything taken, or only earlier doses not ticked (the line below points to Schedule). -->
          <div v-else-if="face === 'done'" key="done" class="focus focus-done">
            <AppIcon name="checkCircle" :size="30" />
            <p class="done-words">{{ t('schedule.allDone') }}</p>
          </div>
          <div v-else-if="face === 'rest'" key="rest" class="focus focus-done">
            <p class="done-words">{{ t('home.today.rest') }}</p>
          </div>
        </Transition>
      </div>

      <p v-if="ready" class="progress-words" data-testid="home-today-progress">
        {{ t('schedule.progress', { done: doneCount, total: doses.length }) }}
      </p>
      <RouterLink
        v-if="ready && missed"
        :to="{ name: 'schedule' }"
        class="missed"
        data-testid="home-today-missed"
        ><AppIcon name="alert" :size="20" />{{
          t('home.today.missed', { n: missed }, missed)
        }}</RouterLink
      >
    </template>

    <p
      class="today-status"
      :class="{ bad: notSaved }"
      role="status"
      data-testid="home-today-status"
    >
      <template v-if="saved">{{ t('home.today.saved') }}</template>
      <template v-else-if="notSaved">{{ t('schedule.tickFailed') }}</template>
    </p>
  </section>
</template>

<style scoped>
/* Fills its place: on computers, the same height as the greeting beside it. */
.today {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--r-card);
  background: var(--color-card);
  box-shadow: var(--shadow-card);
}
.today-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  flex-wrap: wrap;
}
.today-title {
  margin: 0;
  font-size: var(--t21, 21px);
  font-weight: 800;
  line-height: 1.25;
}
.today-open {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: var(--hit);
  padding: 0 4px;
  font-size: 17px;
  font-weight: 700;
  color: var(--color-link);
  text-decoration: none;
}
.today-open:hover {
  text-decoration: underline;
}
.today-empty {
  margin: 0;
  font-size: 18px;
  line-height: 1.5;
  color: var(--color-text-muted);
}

/* The dark reminder card. Turns over on its horizontal axis to the next reminder, like a pill-box lid. */
.turn-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  perspective: 900px;
}
.focus {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  border-radius: var(--r-card);
  background: linear-gradient(160deg, #1f4c4c 0%, #163a3a 100%);
  color: #f2fbfa;
  box-shadow: 0 16px 34px -18px rgba(10, 50, 50, 0.7);
  transform-origin: 50% 50%;
}
.fchips {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
/* Not .chip: that is the app's own light chip. */
.fchip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, 0.12);
  color: #f2fbfa;
  font-size: 16px;
  font-weight: 700;
}

/* The bell: a light round badge, swinging from its top now and then. */
.bell {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  border-radius: 50%;
  background: #f2fbfa;
  color: #163a3a;
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.12);
  text-decoration: none;
  cursor: pointer;
  transition: transform 120ms var(--ease-out);
}
.bell:hover {
  color: #163a3a;
  transform: scale(1.06);
}
.bell:active {
  transform: scale(0.94);
}
.bell:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px rgba(143, 220, 213, 0.7);
}
.bell svg {
  overflow: visible;
  transform-origin: 50% 8%;
}
.bell-body,
.bell-clapper {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.bell.ringing svg {
  animation: ring 1.1s ease-in-out;
}
.bell.ringing::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  box-shadow: 0 0 0 0 rgba(242, 251, 250, 0.55);
  animation: ripple 1.1s ease-out;
}
@keyframes ring {
  0%,
  100% {
    rotate: 0deg;
  }
  10% {
    rotate: 18deg;
  }
  22% {
    rotate: -16deg;
  }
  34% {
    rotate: 12deg;
  }
  46% {
    rotate: -9deg;
  }
  58% {
    rotate: 5deg;
  }
  70% {
    rotate: -2deg;
  }
}
@keyframes ripple {
  to {
    box-shadow: 0 0 0 12px rgba(242, 251, 250, 0);
  }
}

.fdose-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.amount {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 76px;
  padding: 10px 8px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 16px;
  font-weight: 600;
  text-align: center;
}
.fdose-words {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.fdose-name {
  font-size: var(--t22, 22px);
  font-weight: 800;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.fdose-purpose {
  font-size: 16px;
  font-weight: 600;
}
.fdose-food {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 17px;
  color: #bfe3df;
}
/* One big button, full width: easy to see, easy to press. */
.take-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  padding: 10px 18px;
  border: 0;
  border-radius: var(--r-pill);
  background: #f2fbfa;
  color: #163a3a;
  font: inherit;
  font-size: 19px;
  font-weight: 800;
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.12);
  cursor: pointer;
  transition:
    transform 120ms var(--ease-out),
    background-color var(--dur) var(--ease-out);
}
.take-btn:hover {
  background: #ffffff;
}
.take-btn:active {
  transform: scale(0.98);
}
.take-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px rgba(143, 220, 213, 0.6);
}
.take-btn:disabled {
  cursor: progress;
  opacity: 0.85;
}
.later-words {
  margin: 0;
  font-size: 17px;
  color: #bfe3df;
}
.focus-done {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
}
.done-words {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.4;
}

.turn-enter-active {
  animation: turn-in 420ms var(--ease-settle);
}
.turn-leave-active {
  animation: turn-out 200ms ease-in;
}
@keyframes turn-in {
  from {
    opacity: 0;
    transform: rotateX(-80deg);
  }
}
@keyframes turn-out {
  to {
    opacity: 0;
    transform: rotateX(80deg);
  }
}

.progress-words {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text-muted);
}
.missed {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  min-height: var(--hit);
  padding: 6px 14px;
  border-radius: var(--r-pill);
  background: var(--color-warning-bg);
  color: var(--color-warning-text);
  font-size: 17px;
  font-weight: 700;
  text-decoration: none;
}
.missed:hover {
  color: var(--color-warning-text);
  text-decoration: underline;
}
.today-status {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-success-text);
}
.today-status.bad {
  color: var(--color-danger-text);
}
.today-status:empty {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .turn-enter-active,
  .turn-leave-active,
  .bell.ringing svg,
  .bell.ringing::after {
    animation: none;
  }
}
</style>

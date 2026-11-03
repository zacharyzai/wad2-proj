<!-- Owner: Asher. Home's "Today's medicines": the dose that is due now with one big "I've taken it", otherwise what comes
     next, how many of today's doses are taken (one dot per dose, like a pill box), and a gentle line for any earlier dose not
     ticked yet. Everything about doses comes from the Schedule page's own rules (src/rules/schedule.js), ticks and words
     (schedule.*), so Home and Schedule always agree; the full list, changes and missed-dose advice stay on Schedule.
     A tick turns the card over (CSS 3D) to what is next; still with reduced motion. -->
<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMedicinesStore } from '../../stores/medicines'
import { buildSchedule, dosesOn, timeInSingapore, timeStates, todayInSingapore } from '../../rules/schedule'
import { dosesTaken, setDoseTaken } from '../../api/client'
import AppIcon from '../layout/AppIcon.vue'
const { medicines } = useMedicinesStore()

const { t, locale } = useI18n()

const today = ref(todayInSingapore())
const nowTime = ref(timeInSingapore())
const doses = computed(() => dosesOn(medicines.map((m) => buildSchedule(m, m.schedule ?? {})), today.value))

// The day's times, each 'earlier', 'now' or 'later', as on Schedule's Today.
const groups = computed(() => {
  const byTime = new Map()
  for (const dose of doses.value) byTime.set(dose.time, [...(byTime.get(dose.time) ?? []), dose])
  const list = [...byTime].map(([time, list]) => ({ time, doses: list }))
  const states = timeStates(list.map((g) => g.time), nowTime.value)
  return list.map((g, i) => ({ ...g, state: states[i] }))
})

const taken = reactive(new Set()) // dose ids ticked today
const ready = ref(false)
const failed = ref(false)
const saving = reactive(new Set()) // dose ids whose tick is on its way
const saved = ref(false) // "Marked as taken." for a few seconds after a tick
const notSaved = ref(false) // the last tick didn't reach the account

const allTaken = (g) => g.doses.every((d) => taken.has(d.id))
const due = computed(() => (ready.value ? groups.value.find((g) => g.state === 'now' && !allTaken(g)) : null))
const next = computed(() => groups.value.filter((g) => g.state === 'later').flatMap((g) => g.doses).find((d) => !taken.has(d.id)))
const missed = computed(() => groups.value.filter((g) => g.state === 'earlier').flatMap((g) => g.doses).filter((d) => !taken.has(d.id)).length)
const doneCount = computed(() => doses.value.filter((d) => taken.has(d.id)).length)
// Which face the card shows; a change of face turns the card over.
const face = computed(() => (!ready.value ? 'wait' : due.value ? `due-${due.value.time}` : doneCount.value === doses.value.length ? 'done' : 'next'))

// Words for times and doses, in the page language (Singapore times, whatever the device's time zone), as on Schedule.
const timeText = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(locale.value, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' })
}
const doseText = ({ count, unit, food }) =>
  [count != null && `${count} ${t(`unit.${unit ?? 'other'}`, count)}`, food && t(`food.${food}`)].filter(Boolean).join(' · ')

async function loadTicks() {
  const date = today.value
  ready.value = false
  failed.value = false
  const res = await dosesTaken(date)
  if (date !== today.value) return // the day changed while this was on its way
  if (!res.ok) return (failed.value = true)
  taken.clear()
  for (const id of res.data.taken) taken.add(id)
  ready.value = true
}

// A new day in Singapore starts with nothing ticked; the clock also moves "Take now" along during the day.
function newDay() {
  nowTime.value = timeInSingapore()
  if (todayInSingapore() === today.value) return false
  today.value = todayInSingapore()
  loadTicks()
  return true
}

// "I've taken it" ticks one medicine of the time that is due: when several are due, each has its own button, so one that
// wasn't taken is never ticked with the others. (Due means within the hour, so it is never "too early".) Shown at once;
// if the account doesn't save it, the tick goes back and a short message says so.
let savedTimer = 0
async function take(dose) {
  if (saving.has(dose.id) || taken.has(dose.id) || newDay()) return
  const date = today.value
  saving.add(dose.id)
  taken.add(dose.id)
  const res = await setDoseTaken(dose.id, date, true)
  saving.delete(dose.id)
  if (date !== today.value) return
  if (!res.ok) taken.delete(dose.id)
  notSaved.value = !res.ok
  saved.value = res.ok
  clearTimeout(savedTimer)
  if (saved.value) savedTimer = setTimeout(() => (saved.value = false), 5000)
}

const onVisible = () => document.visibilityState === 'visible' && newDay()
let clock = 0
onMounted(() => {
  loadTicks()
  document.addEventListener('visibilitychange', onVisible)
  clock = setInterval(newDay, 60_000)
})
onBeforeUnmount(() => {
  clearInterval(clock)
  clearTimeout(savedTimer)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <section class="today" aria-labelledby="today-title" data-testid="home-today">
    <div class="today-head">
      <span class="tile today-tile" aria-hidden="true"><AppIcon name="calendar" :size="24" /></span>
      <h2 id="today-title" class="today-title">{{ t('home.today.title') }}</h2>
      <RouterLink :to="{ name: 'schedule' }" class="today-open" data-testid="home-today-open">{{ t('home.today.open') }}<AppIcon name="right" :size="18" /></RouterLink>
    </div>

    <!-- No medicines at all: how to get reminders. -->
    <p v-if="!medicines.length" class="today-empty">{{ t('home.today.noMeds') }}</p>
    <p v-else-if="!doses.length" class="today-empty">{{ t('schedule.noneToday') }}</p>
    <p v-else-if="failed" class="today-empty" role="alert">{{ t('home.today.loadFailed') }}</p>

    <template v-else>
      <div class="turn-box">
        <Transition name="turn" mode="out-in">
          <!-- Due now: what to take, and one button for all of it. -->
          <div v-if="due" :key="face" class="face due" data-testid="home-today-due">
            <h3 class="due-title">{{ due.doses.length === 1 ? t('schedule.due.one', { name: due.doses[0].label }) : t('schedule.due.many', { n: due.doses.length }) }}</h3>
            <template v-if="due.doses.length === 1">
              <p class="due-dose">{{ doseText(due.doses[0].instruction) }}</p>
              <p class="due-when">{{ t('schedule.due.text', { time: timeText(due.time) }) }}</p>
              <button type="button" class="btn btn-primary take" :disabled="saving.has(due.doses[0].id)" data-testid="home-today-take" @click="take(due.doses[0])"><AppIcon name="check" />{{ t('schedule.due.take') }}</button>
            </template>
            <!-- Several due together: one row and one button each. -->
            <template v-else>
              <p class="due-when">{{ t('schedule.due.textMany', { time: timeText(due.time) }) }}</p>
              <ul class="due-list">
                <li v-for="d in due.doses" :key="d.id" :data-testid="`home-today-dose-${d.id}`">
                  <span class="due-med"><strong>{{ d.label }}</strong><span>{{ doseText(d.instruction) }}</span></span>
                  <span v-if="taken.has(d.id)" class="badge badge-success"><AppIcon name="check" :size="18" :stroke="3" />{{ t('schedule.taken') }}</span>
                  <button v-else type="button" class="btn btn-primary take-one" :disabled="saving.has(d.id)" :aria-label="t('schedule.due.takeLabel', { name: d.label })" data-testid="home-today-take" @click="take(d)"><AppIcon name="check" />{{ t('schedule.due.take') }}</button>
                </li>
              </ul>
            </template>
          </div>
          <!-- Nothing due: everything taken, or what comes next. -->
          <div v-else-if="face === 'done'" key="done" class="face done-face">
            <AppIcon name="checkCircle" :size="28" />
            <p class="done-words">{{ t('schedule.allDone') }}</p>
          </div>
          <div v-else-if="face === 'next'" key="next" class="face">
            <p v-if="next" class="next-words" data-testid="home-today-next">{{ t('schedule.next', { name: next.label, time: timeText(next.time) }) }}</p>
          </div>
        </Transition>
      </div>

      <div v-if="ready" class="progress-row">
        <span class="dots" aria-hidden="true"><span v-for="d in doses" :key="d.id" class="dot" :class="{ on: taken.has(d.id) }"></span></span>
        <span class="progress-words" data-testid="home-today-progress">{{ t('schedule.progress', { done: doneCount, total: doses.length }) }}</span>
      </div>
      <RouterLink v-if="ready && missed" :to="{ name: 'schedule' }" class="missed" data-testid="home-today-missed"><AppIcon name="alert" :size="20" />{{ t('home.today.missed', { n: missed }, missed) }}</RouterLink>
    </template>

    <p class="today-status" :class="{ bad: notSaved }" role="status" data-testid="home-today-status">
      <template v-if="saved">{{ t('home.today.saved') }}</template>
      <template v-else-if="notSaved">{{ t('schedule.tickFailed') }}</template>
    </p>
  </section>
</template>

<style scoped>
.today { display: flex; flex-direction: column; gap: 14px; padding: 20px; border: 1px solid var(--color-border); border-radius: var(--r-card); background: var(--color-card); box-shadow: var(--shadow-card); }
.today-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.today-tile { width: 44px; height: 44px; border-radius: 14px; background: var(--color-tint); color: var(--color-tint-text); }
.today-title { flex: 1 1 auto; min-width: 0; margin: 0; font-size: var(--t21, 21px); font-weight: 800; line-height: 1.25; }
.today-open { display: inline-flex; align-items: center; gap: 4px; min-height: var(--hit); padding: 0 4px; font-size: 17px; font-weight: 700; color: var(--color-link); text-decoration: none; }
.today-open:hover { text-decoration: underline; }
.today-empty { margin: 0; font-size: 18px; line-height: 1.5; color: var(--color-text-muted); }

/* The card turns over on its horizontal axis to the next face, like flipping a pill-box lid. */
.turn-box { perspective: 900px; }
.face { display: flex; flex-direction: column; gap: 8px; transform-origin: 50% 50%; }
.due { padding: 16px; border-radius: var(--r-panel); background: var(--color-tint); }
.due-title { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: var(--t26, 26px); line-height: 1.2; overflow-wrap: anywhere; text-wrap: balance; }
:lang(ta) .due-title { font-family: var(--font-sans); font-weight: 800; font-size: 21px; }
.due-dose { margin: 0; font-size: 18px; }
.due-when { margin: 0; font-size: 17px; color: var(--color-text-muted); }
.take { margin-top: 6px; width: 100%; }
.due-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.due-list li { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 10px 12px; border-radius: var(--r-sm); background: var(--color-card); }
.due-med { flex: 1 1 10rem; min-width: 0; display: flex; flex-direction: column; font-size: 17px; overflow-wrap: anywhere; }
.due-med strong { font-size: 18px; }
.take-one { flex: 1 1 auto; min-height: var(--hit); padding-block: 8px; }
.due-list .badge { min-height: var(--hit); }
.done-face { flex-direction: row; align-items: center; gap: 12px; padding: 14px 16px; border-radius: var(--r-panel); background: var(--color-success-bg); color: var(--color-success-text); }
.done-words { margin: 0; font-size: 18px; font-weight: 700; }
.next-words { margin: 0; font-size: 19px; font-weight: 700; line-height: 1.4; }

.turn-enter-active { animation: turn-in 420ms var(--ease-settle); }
.turn-leave-active { animation: turn-out 200ms ease-in; }
@keyframes turn-in { from { opacity: 0; transform: rotateX(-80deg); } }
@keyframes turn-out { to { opacity: 0; transform: rotateX(80deg); } }

/* One dot per dose today, filled when taken; the words beside them say the same. */
.progress-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.dots { display: flex; flex-wrap: wrap; gap: 6px; }
.dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--color-primary); background: transparent; transition: background-color var(--dur) var(--ease-out); }
.dot.on { background: var(--color-primary); }
.progress-words { font-size: 17px; font-weight: 600; color: var(--color-text-muted); }
.missed { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; min-height: var(--hit); padding: 6px 14px; border-radius: var(--r-pill); background: var(--color-warning-bg); color: var(--color-warning-text); font-size: 17px; font-weight: 700; text-decoration: none; }
.missed:hover { color: var(--color-warning-text); text-decoration: underline; }
.today-status { margin: 0; font-size: 17px; font-weight: 600; color: var(--color-success-text); }
.today-status.bad { color: var(--color-danger-text); }
.today-status:empty { display: none; }

@media (prefers-reduced-motion: reduce) { .turn-enter-active, .turn-leave-active { animation: none; } }
</style>

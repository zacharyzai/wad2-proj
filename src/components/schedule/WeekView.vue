<!-- Owner: Lokesh (built by Claude, declared in README.txt; one row per medicine, plain states and "I took it" added later).
     Schedule, "This week": Monday to Sunday at a glance, one row per medicine and time of day, from the ticks saved on the
     account (docs/doses-contract.md). Each medicine's name sits above its row of days, so seven days fit on a phone.
     A real table, so screen readers can move by day; every mark says its state in words too (icon and shape, never colour
     alone). One plain sentence says how the week is going; "Not ticked this week" lists the doses whose time passed with
     no tick, each with "I took it" (and Undo) for a tick that was forgotten. Sums: weekSummary in src/rules/schedule.js. -->
<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { dosesTaken, setDoseTaken } from '../../api/client'
import { weekOf, weekSummary } from '../../rules/schedule'
import AppIcon from '../layout/AppIcon.vue'
import ErrorBanner from '../layout/ErrorBanner.vue'

const props = defineProps({
  entries: { type: Array, required: true },
  today: { type: String, required: true },
  now: { type: String, required: true }, // 'HH:MM' in Singapore
  takenToday: { type: Set, required: true }, // today's ticks, live from the Today tab
  flagged: { type: Array, default: () => [] }, // [{ medicine, entry }] never on the timetable
})
// Today's ticks belong to the Today tab (it saves them, and says if one fails): a tick for today goes there.
const emit = defineEmits(['toggle'])
const SLOT_ICONS = { morning: 'sunrise', afternoon: 'sun', evening: 'sunset', bedtime: 'bed' }
const STATE_ICONS = { ok: 'check', not: 'alert', now: 'clock', later: null }
const STATES = ['ok', 'not', 'now', 'later']

const { t, locale } = useI18n()
const day = (date, options) => new Date(`${date}T00:00:00Z`).toLocaleDateString(locale.value, { timeZone: 'UTC', ...options })
const timeText = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(locale.value, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' })
}

// Earlier days this week come from the server once per visit to the tab (and again on a new day); today is live.
const past = reactive(new Map())
const loadError = ref(null)
async function load() {
  loadError.value = null
  const dates = weekOf(props.today).filter((date) => date < props.today && !past.has(date))
  const answers = await Promise.all(dates.map((date) => dosesTaken(date)))
  answers.forEach((res, i) => (res.ok ? past.set(dates[i], new Set(res.data.taken)) : (loadError.value = res.error.code)))
}
watch(() => props.today, load, { immediate: true })

const week = computed(() => weekSummary(props.entries, props.today, props.now, (date) => (date === props.today ? props.takenToday : past.get(date) ?? null)))
const ready = computed(() => weekOf(props.today).every((date) => date >= props.today || past.has(date)))
const cellLabel = (row, date, state) => t('schedule.week.cell', { name: row.label, day: day(date, { weekday: 'long' }), slot: t(`timing.${row.slot}`), state: t(`schedule.week.state.${state}`) })

// One sentence for the week, instead of a count: what (if anything) needs a look.
const sentence = computed(() => {
  if (!ready.value) return t('schedule.week.loading')
  const n = week.value.notTicked.length
  if (n) return t('schedule.week.notTicked', { n }, n)
  return t(week.value.anyPassed ? 'schedule.week.allTicked' : 'schedule.week.nothingYet')
})

// "I took it": a tick that was forgotten. Earlier days are saved here; today's go to the Today tab. "Ticked: …" then
// stays in view with Undo (focus moves to it, as the row it was on has gone).
const done = ref(null) // { dose, text } of the last "I took it", for Undo
const failed = ref(false)
const doneBox = ref(null)
const doseWords = (d) => ({ name: d.label, day: day(d.date, { weekday: 'long' }), slot: t(`timing.${d.slot}`) })
async function setTick(d, want) {
  if (d.date === props.today) {
    emit('toggle', d)
    return true
  }
  const ticks = past.get(d.date)
  want ? ticks.add(d.id) : ticks.delete(d.id)
  const res = await setDoseTaken(d.id, d.date, want)
  if (res.ok) return true
  want ? ticks.delete(d.id) : ticks.add(d.id)
  return false
}
async function took(d) {
  failed.value = false
  if (!(await setTick(d, true))) return (failed.value = true)
  done.value = { dose: d, text: t('schedule.week.ticked', doseWords(d)) }
  await nextTick()
  doneBox.value?.focus()
}
async function undo() {
  const d = done.value.dose
  done.value = null
  failed.value = !(await setTick(d, false))
}
</script>

<template>
  <div class="week d-flex flex-column gap-4" data-testid="schedule-week">
    <ErrorBanner v-if="loadError" :code="loadError" retryable @retry="load" />

    <div class="week-sum" data-testid="week-summary">
      <span class="text-muted-a11y">{{ t('schedule.week.range', { start: day(week.days[0], { weekday: 'long', day: 'numeric', month: 'long' }), end: day(week.days[6], { weekday: 'long', day: 'numeric', month: 'long' }) }) }}</span>
      <strong class="week-say" :class="{ warn: ready && week.notTicked.length }" data-testid="week-sentence">{{ sentence }}</strong>
    </div>

    <section class="card week-card">
      <table class="week-table">
        <caption class="visually-hidden">{{ t('schedule.week.caption') }}</caption>
        <thead>
          <tr>
            <th v-for="date in week.days" :key="date" scope="col" :class="{ today: date === today }" :aria-current="date === today ? 'date' : null">
              <span class="dow">{{ day(date, { weekday: 'short' }) }}</span>
              <span class="dnum">{{ day(date, { day: 'numeric' }) }}</span>
            </th>
          </tr>
        </thead>
        <!-- One medicine and time: its name across the top, then its seven days. -->
        <tbody v-for="row in week.rows" :key="row.id" :data-testid="`week-row-${row.id}`">
          <tr class="med-head">
            <th colspan="7" scope="rowgroup">
              <span class="med-line">
                <span class="slot-tile sm" :class="`slot-${row.slot}`" aria-hidden="true"><AppIcon :name="SLOT_ICONS[row.slot] ?? 'clock'" :size="20" /></span>
                <span class="med-words">
                  <span class="med-name">{{ row.label }}</span>
                  <span class="med-when">{{ t(`timing.${row.slot}`) }} · {{ timeText(row.time) }}</span>
                </span>
              </span>
            </th>
          </tr>
          <tr>
            <td v-for="cell in row.cells" :key="cell.date" :class="{ today: cell.date === today }">
              <span v-if="cell.state !== 'none'" class="wk-mark" :class="`wk-mark-${cell.state}`" role="img" :aria-label="cellLabel(row, cell.date, cell.state)" :data-state="cell.state">
                <AppIcon v-if="STATE_ICONS[cell.state]" :name="STATE_ICONS[cell.state]" :size="18" :stroke="2.75" />
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!week.rows.length" class="text-muted-a11y m-0">{{ t('schedule.noneToday') }}</p>
      <ul class="legend" aria-hidden="true">
        <li v-for="s in STATES" :key="s"><span class="wk-mark" :class="`wk-mark-${s}`"><AppIcon v-if="STATE_ICONS[s]" :name="STATE_ICONS[s]" :size="14" :stroke="3" /></span>{{ t(`schedule.week.state.${s}`) }}</li>
      </ul>
      <p class="explain m-0">{{ t('schedule.week.explain') }}</p>
    </section>

    <!-- After "I took it": what was ticked, with Undo. Kept outside the list, which may now be empty and gone. -->
    <p v-if="done" ref="doneBox" class="done-note m-0" tabindex="-1" role="status" data-testid="week-ticked">
      <AppIcon name="checkCircle" :size="22" /><span>{{ done.text }}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-testid="week-undo" @click="undo">{{ t('schedule.week.undo') }}</button>
    </p>
    <p v-if="failed" class="fail-note m-0" role="alert">{{ t('schedule.tickFailed') }}</p>

    <div class="week-lists">
      <section v-if="ready && week.notTicked.length" class="card d-flex flex-column gap-3" aria-labelledby="not-title">
        <h2 id="not-title" class="h3 m-0">{{ t('schedule.week.listTitle') }}</h2>
        <p class="m-0">{{ t('schedule.week.forgot') }}</p>
        <ul class="plain" data-testid="week-not-ticked">
          <li v-for="d in week.notTicked" :key="`${d.date}-${d.id}`">
            <span class="wk-mark wk-mark-not" aria-hidden="true"><AppIcon name="alert" :size="16" :stroke="2.75" /></span>
            <span class="d-flex flex-column flex-grow-1 min-w-0">
              <strong>{{ d.label }}</strong>
              <span class="text-muted-a11y">{{ day(d.date, { weekday: 'long', day: 'numeric', month: 'short' }) }} · {{ t(`timing.${d.slot}`) }}</span>
            </span>
            <button type="button" class="btn btn-secondary btn-sm took" :aria-label="t('schedule.week.tookLabel', doseWords(d))" data-testid="week-took" @click="took(d)">
              <AppIcon name="check" :size="20" />{{ t('schedule.week.took') }}
            </button>
          </li>
        </ul>
        <p class="m-0 text-muted-a11y">{{ t('schedule.slot.missed') }}</p>
      </section>

      <section v-if="flagged.length" class="card d-flex flex-column gap-3" aria-labelledby="notdaily-title">
        <h2 id="notdaily-title" class="h3 m-0">{{ t('schedule.week.notDaily') }}</h2>
        <ul class="plain">
          <li v-for="r in flagged" :key="r.medicine.id">
            <span class="tile tile-soft" aria-hidden="true"><AppIcon name="calendar" :size="20" /></span>
            <span class="d-flex flex-column">
              <strong>{{ r.entry.label }}</strong>
              <span v-if="r.medicine.medication.frequencyType && r.medicine.medication.frequencyType !== 'daily'" class="text-muted-a11y">{{ t(`freq.${r.medicine.medication.frequencyType}`) }}</span>
            </span>
          </li>
        </ul>
        <RouterLink :to="{ query: { view: 'meds' } }" class="btn btn-outline btn-sm align-self-start">{{ t('schedule.pharm.title') }}<AppIcon name="right" :size="18" /></RouterLink>
      </section>
    </div>
  </div>
</template>

<style scoped>
.week-sum { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-lead); }
.week-say { font-size: var(--t21, 21px); line-height: 1.35; }
.week-say.warn { color: var(--color-warning-text); }
.week-card { padding: 16px 12px; gap: 12px; }
.week-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.week-table thead th { padding: 4px 0 10px; text-align: center; font-weight: 600; color: var(--color-text-muted); }
.week-table thead th.today { color: var(--color-tint-text); }
.dow { display: block; font-size: 16px; }
.dnum { display: block; font-size: var(--t20, 20px); font-weight: 800; font-variant-numeric: tabular-nums; }
.week-table thead th.today .dnum { display: inline-grid; place-items: center; min-width: 34px; height: 34px; border-radius: var(--r-pill); background: var(--color-primary); color: var(--color-on-primary); }

/* Each medicine: its name on a line of its own, then its days. */
.med-head th { padding: 14px 4px 6px; text-align: left; border-top: 1px solid var(--color-border); }
.med-line { display: flex; align-items: center; gap: 12px; }
.med-words { display: flex; flex-direction: column; min-width: 0; }
.med-name { font-size: 18px; font-weight: 800; line-height: 1.3; overflow-wrap: anywhere; }
.med-when { font-size: 16px; font-weight: 600; color: var(--color-text-muted); }
.week-table tbody td { padding: 4px 0 8px; text-align: center; }
.week-table td.today { background: color-mix(in srgb, var(--color-tint) 55%, transparent); }

/* Taken: filled green with a tick. Not ticked: warning ring with "!". Take now: teal ring with a clock. Later: an empty ring. */
.wk-mark { width: 34px; height: 34px; border-radius: var(--r-pill); display: inline-grid; place-items: center; box-sizing: border-box; flex: none; }
.wk-mark-ok { background: var(--color-success); color: #fff; }
.wk-mark-not { background: var(--color-warning-bg); border: 2px solid var(--color-warning); color: var(--color-warning-text); }
.wk-mark-now { background: var(--color-tint); border: 2px solid var(--color-primary); color: var(--color-tint-text); }
.wk-mark-later { border: 2px solid var(--color-border-strong); }
.legend { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 0; padding: 4px 4px 0; list-style: none; font-size: 16px; font-weight: 600; color: var(--color-text-muted); }
.legend li { display: inline-flex; align-items: center; gap: 8px; }
.legend .wk-mark { width: 24px; height: 24px; }
.explain { padding: 0 4px; font-size: 16px; color: var(--color-text-muted); }

.done-note { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 12px 16px; border-radius: var(--r-panel); background: var(--color-success-bg); color: var(--color-success-text); font-weight: 700; }
.done-note:focus { outline: none; box-shadow: var(--focus-ring); }
.fail-note { padding: 12px 16px; border-radius: var(--r-panel); background: var(--color-danger-bg); color: var(--color-danger-text); font-weight: 700; }

.week-lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 20px; } /* cards in a row are the same height */
.plain { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.plain li { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--color-border); }
.plain li:first-child { border-top: 0; padding-top: 0; }
.took { flex: none; white-space: nowrap; }
@media (max-width: 420px) {
  .plain li { flex-wrap: wrap; }
  .took { width: 100%; }
}
</style>

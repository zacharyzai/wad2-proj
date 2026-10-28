<!-- Owner: Lokesh (built by Claude, declared in README.txt). Schedule, "This week": Monday to Sunday at a glance, one row per
     time of day, from the ticks saved on the account (docs/doses-contract.md). A real table, so screen readers can move
     by day and time; every cell says its state in words too (shape and icon, never colour alone). Sums: weekSummary. -->
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { dosesTaken } from '../../api/client'
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
const SLOT_ICONS = { morning: 'sunrise', afternoon: 'sun', evening: 'sunset', bedtime: 'bed' }
const STATE_ICONS = { ok: 'check', miss: 'x', up: null, none: null }

const { t, locale } = useI18n()
const day = (date, options) => new Date(`${date}T00:00:00Z`).toLocaleDateString(locale.value, { timeZone: 'UTC', ...options })

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
const cellLabel = (date, slot, state) => t('schedule.week.cell', { day: day(date, { weekday: 'long' }), slot: t(`timing.${slot}`), state: t(`schedule.week.state.${state}`) })
</script>

<template>
  <div class="week d-flex flex-column gap-4" data-testid="schedule-week">
    <ErrorBanner v-if="loadError" :code="loadError" retryable @retry="load" />

    <p class="week-sum m-0" data-testid="week-summary">
      <strong>{{ ready ? t('schedule.week.sum', { done: week.done, due: week.due }) : t('schedule.week.loading') }}</strong>
      <span class="text-muted-a11y">{{ t('schedule.week.range', { start: day(week.days[0], { weekday: 'long', day: 'numeric', month: 'long' }), end: day(week.days[6], { weekday: 'long', day: 'numeric', month: 'long' }) }) }}</span>
    </p>

    <section class="card week-card">
      <table class="week-table">
        <caption class="visually-hidden">{{ t('schedule.week.caption') }}</caption>
        <thead>
          <tr>
            <td></td>
            <th v-for="date in week.days" :key="date" scope="col" :class="{ today: date === today }" :aria-current="date === today ? 'date' : null">
              <span class="dow">{{ day(date, { weekday: 'short' }) }}</span>
              <span class="dnum">{{ day(date, { day: 'numeric' }) }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in week.rows" :key="row.slot">
            <th scope="row">
              <span class="slot-tile sm" :class="`slot-${row.slot}`"><AppIcon :name="SLOT_ICONS[row.slot]" :size="22" /></span>
              <span class="visually-hidden">{{ t(`timing.${row.slot}`) }}</span>
            </th>
            <td v-for="cell in row.cells" :key="cell.date" :class="{ today: cell.date === today }">
              <span v-if="cell.state !== 'none'" class="wk-mark" :class="`wk-mark-${cell.state}`" role="img" :aria-label="cellLabel(cell.date, row.slot, cell.state)" :data-state="cell.state">
                <AppIcon v-if="STATE_ICONS[cell.state]" :name="STATE_ICONS[cell.state]" :size="18" :stroke="3" />
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!week.rows.length" class="text-muted-a11y m-0">{{ t('schedule.noneToday') }}</p>
      <ul class="legend" aria-hidden="true">
        <li><span class="wk-mark wk-mark-ok"><AppIcon name="check" :size="14" :stroke="3" /></span>{{ t('schedule.week.state.ok') }}</li>
        <li><span class="wk-mark wk-mark-miss"><AppIcon name="x" :size="14" :stroke="3" /></span>{{ t('schedule.week.state.miss') }}</li>
        <li><span class="wk-mark wk-mark-up"></span>{{ t('schedule.week.state.up') }}</li>
      </ul>
    </section>

    <div class="week-lists">
      <section class="card d-flex flex-column gap-3" aria-labelledby="missed-title">
        <h2 id="missed-title" class="h3 m-0">{{ t('schedule.week.missedTitle') }}</h2>
        <ul v-if="week.missed.length" class="plain" data-testid="week-missed">
          <li v-for="m in week.missed" :key="`${m.date}${m.time}${m.label}`">
            <span class="wk-mark wk-mark-miss" aria-hidden="true"><AppIcon name="x" :size="16" :stroke="3" /></span>
            <span class="d-flex flex-column">
              <strong>{{ m.label }}</strong>
              <span class="text-muted-a11y">{{ day(m.date, { weekday: 'long', day: 'numeric', month: 'short' }) }} · {{ t(`timing.${m.slot}`) }}</span>
            </span>
          </li>
        </ul>
        <p v-else class="m-0 text-muted-a11y">{{ ready ? t('schedule.week.noneMissed') : '' }}</p>
        <p v-if="week.missed.length" class="m-0 text-muted-a11y">{{ t('schedule.slot.missed') }}</p>
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
.week-sum { display: flex; flex-direction: column; gap: 2px; font-size: var(--fs-lead); }
.week-card { padding: 16px 12px; gap: 12px; }
.week-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.week-table th:first-child, .week-table td:first-child { width: 48px; }
.week-table thead th { padding: 4px 0 10px; text-align: center; font-weight: 600; color: var(--color-text-muted); }
.week-table thead th.today { color: var(--color-tint-text); }
.dow { display: block; font-size: 16px; }
.dnum { display: block; font-size: var(--t20, 20px); font-weight: 800; font-variant-numeric: tabular-nums; }
.week-table thead th.today .dnum { display: inline-grid; place-items: center; min-width: 34px; height: 34px; border-radius: var(--r-pill); background: var(--color-primary); color: var(--color-on-primary); }
.week-table tbody tr { border-top: 1px solid var(--color-border); }
.week-table tbody th, .week-table tbody td { padding: 8px 0; text-align: center; }
.week-table td.today { background: color-mix(in srgb, var(--color-tint) 55%, transparent); }

/* Taken: filled green with a tick. Missed: warning ring with a cross. Coming up: an empty ring. */
.wk-mark { width: 34px; height: 34px; border-radius: var(--r-pill); display: inline-grid; place-items: center; box-sizing: border-box; flex: none; }
.wk-mark-ok { background: var(--color-success); color: #fff; }
.wk-mark-miss { background: var(--color-warning-bg); border: 2px solid var(--color-warning); color: var(--color-warning-text); }
.wk-mark-up { border: 2px solid var(--color-border-strong); }
.legend { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 0; padding: 4px 4px 0; list-style: none; font-size: 16px; font-weight: 600; color: var(--color-text-muted); }
.legend li { display: inline-flex; align-items: center; gap: 8px; }
.legend .wk-mark { width: 24px; height: 24px; }

.week-lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 20px; align-items: start; }
.plain { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.plain li { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--color-border); }
.plain li:first-child { border-top: 0; padding-top: 0; }
</style>

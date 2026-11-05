<script setup>
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useDosesStore } from '../../stores/doses'
import { useScheduleText } from '../../composables/useScheduleText'
import { weekOf, weekSummary } from '../../rules/schedule'
import ErrorBanner from '../layout/ErrorBanner.vue'

const props = defineProps({
  entries: { type: Array, required: true },
  selected: { type: String, required: true }, // 'YYYY-MM-DD'
})
const emit = defineEmits(['select'])

const { t } = useI18n()
const { dateText } = useScheduleText()
const doses = useDosesStore()
const { today, nowTime, taken, past, pastError } = storeToRefs(doses)

const days = computed(() => weekOf(today.value))
watch(days, (list) => doses.loadPast(list), { immediate: true })
const ready = computed(() =>
  days.value.every((date) => date >= today.value || past.value.has(date)),
)
const week = computed(() =>
  weekSummary(props.entries, today.value, nowTime.value, (date) =>
    date === today.value ? taken.value : (past.value.get(date) ?? null),
  ),
)

// One state per day, from its doses: 'ok' all taken, 'not' something not ticked, 'open' still to come, 'none' nothing.
const dayState = computed(() =>
  days.value.map((date, i) => {
    const cells = week.value.rows.map((r) => r.cells[i].state).filter((s) => s !== 'none')
    if (!cells.length) return 'none'
    if (cells.includes('not')) return 'not'
    return cells.every((s) => s === 'ok') ? 'ok' : 'open'
  }),
)
const sentence = computed(() => {
  if (!ready.value) return t('schedule.week.loading')
  const n = week.value.notTicked.length
  if (n) return t('schedule.strip.notTicked', { n }, n)
  return t(week.value.anyPassed ? 'schedule.week.allTicked' : 'schedule.week.nothingYet')
})
// A full date for screen readers, e.g. "Monday, 3 November".
const dayName = (date) => dateText(date, { weekday: 'long', day: 'numeric', month: 'long' })
</script>

<template>
  <section class="strip-box" aria-labelledby="strip-title" data-testid="day-strip">
    <ErrorBanner v-if="pastError" :code="pastError" retryable @retry="doses.loadPast(days)" />
    <div class="strip-head">
      <h2 id="strip-title" class="strip-month">
        {{ dateText(selected, { month: 'long', year: 'numeric' }) }}
      </h2>
      <button
        v-if="selected !== today"
        type="button"
        class="back-today"
        data-testid="strip-today"
        @click="emit('select', today)"
      >
        {{ t('schedule.strip.today') }}
      </button>
    </div>
    <div class="pillbox" role="group" :aria-label="t('schedule.strip.label')">
      <button
        v-for="(date, i) in days"
        :key="date"
        type="button"
        class="comp"
        :class="[`is-${dayState[i]}`, { today: date === today }]"
        :aria-pressed="date === selected"
        :aria-current="date === today ? 'date' : null"
        :data-testid="`day-${date}`"
        :data-state="dayState[i]"
        @click="emit('select', date)"
      >
        <!-- Seen: the day's letter on the lid, the date on its capsule, and a badge. Heard: that, then the whole day and how it
             went (the seen words stay in the name). -->
        <span class="lid">{{ dateText(date, { weekday: 'narrow' }) }}</span>
        <span class="capsule">
          <span class="half top"></span><span class="half bottom"></span>
          <span class="num">{{ dateText(date, { day: 'numeric' }) }}</span>
          <span
            v-if="dayState[i] === 'ok' || dayState[i] === 'not'"
            class="badge-dot"
            aria-hidden="true"
            >{{ dayState[i] === 'ok' ? '✓' : '!' }}</span
          >
        </span>
        <span class="visually-hidden"
          >{{ dayName(date) }}: {{ t(`schedule.strip.state.${dayState[i]}`) }}</span
        >
      </button>
    </div>
    <p
      class="strip-say m-0"
      :class="{ warn: ready && week.notTicked.length }"
      data-testid="week-sentence"
    >
      {{ sentence }}
    </p>
  </section>
</template>

<style scoped>
.strip-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.strip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.strip-month {
  margin: 0;
  font-size: var(--t20, 20px);
  font-weight: 800;
}
.back-today {
  min-height: 44px;
  padding: 6px 14px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--color-tint);
  color: var(--color-tint-text);
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}
.back-today:hover {
  background: var(--color-tint-strong);
}

/* The pill box: a clear plastic box, seven compartments side by side. */
.pillbox {
  position: relative;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 5px;
  padding: 10px 8px;
  border-radius: 26px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-card) 92%, transparent),
    color-mix(in srgb, var(--color-surface-2) 85%, transparent)
  );
  border: 1px solid var(--color-border-strong);
  box-shadow:
    var(--shadow-card),
    inset 0 2px 0 rgba(255, 255, 255, 0.6);
}

/* Small phones (iPhone 6, 375px): tighter gaps, so each day is still a 44px-wide tap target. */
@media (max-width: 399.98px) {
  .pillbox {
    gap: 2px;
    padding: 10px 6px;
  }
}

/* A compartment: its own colour, like the rainbow lids of a weekly pill box; the day's letter on the lid. */
.comp {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 6px 0 10px;
  border: 0;
  border-radius: 16px;
  background: var(--color-surface-2);
  box-shadow:
    inset 0 -3px 0 var(--color-border-strong),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 280ms var(--ease-out),
    box-shadow 280ms var(--ease-out);
}
.comp:hover:not([aria-pressed='true']) {
  background: var(--color-border);
}
/* The day you are on: its own compartment colour and its own pill, always different from the rest. */
.comp[aria-pressed='true'] {
  background: var(--color-tint-strong);
  box-shadow:
    inset 0 -3px 0 var(--color-primary),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
.comp:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.lid {
  font-size: 16px;
  font-weight: 800;
  color: var(--color-text-muted);
}
.comp[aria-pressed='true'] .lid {
  color: var(--color-tint-text);
}

/* The capsule: upright, two halves, the date on it, the same for every day but today (teal and cream). The chosen day's
   lifts out of the box, with a teal ring round it. */
.capsule {
  position: relative;
  display: grid;
  place-items: center;
  width: min(100%, 38px);
  height: 62px;
  border-radius: 19px;
  overflow: visible;
  box-shadow: 0 3px 6px -2px rgba(60, 40, 20, 0.25);
  transition:
    transform 380ms cubic-bezier(0.3, 1.5, 0.5, 1),
    box-shadow 300ms var(--ease-out);
}
.half {
  position: absolute;
  left: 0;
  right: 0;
  height: 50%;
}
.half.top {
  top: 0;
  border-radius: 19px 19px 0 0;
  background: #d3e6e3;
}
.half.bottom {
  bottom: 0;
  border-radius: 0 0 19px 19px;
  background: #fffdfa;
}
.capsule::after {
  content: '';
  position: absolute;
  left: 7px;
  top: 7px;
  width: 6px;
  height: 20px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.55);
} /* the shine */
.num {
  position: relative;
  z-index: 1;
  font-size: var(--t18, 18px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #2b2622;
}
.comp[aria-pressed='true'] .half.top {
  background: var(--color-primary);
}
.comp[aria-pressed='true'] .half.bottom {
  background: #f3d27a;
}
.comp[aria-pressed='true'] .num {
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
.comp[aria-pressed='true'] .capsule {
  transform: translateY(-8px) rotate(-8deg);
  box-shadow: 0 14px 18px -8px rgba(20, 70, 70, 0.55);
}
/* Today, when you are looking at another day: a thin ring, so it is easy to find again (the colours stay the same). */
.comp.today:not([aria-pressed='true']) .capsule {
  box-shadow:
    0 0 0 2px var(--color-surface-2),
    0 0 0 4px var(--color-primary),
    0 3px 6px -2px rgba(60, 40, 20, 0.25);
}
.comp:active .capsule {
  scale: 0.94;
}
/* How the day went: a badge on the capsule (the button's name says it in words). */
.badge-dot {
  position: absolute;
  right: -5px;
  top: -8px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--color-card);
  font-size: 16px;
  font-weight: 900;
  line-height: 1;
  color: #fff;
}
.is-ok .badge-dot {
  background: var(--color-success);
}
.is-not .badge-dot {
  background: var(--color-warning);
}

.strip-say {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-muted);
}
.strip-say.warn {
  color: var(--color-warning-text);
}
@media (prefers-reduced-motion: reduce) {
  .capsule {
    transition: none;
  }
}
</style>

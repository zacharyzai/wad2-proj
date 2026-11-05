<!-- Owner: Asher. The top of one senior's page for their caregiver (views/CareSeniorView.vue), in place of a plain title: a
     teal card with Back, a "Read only" tag, their picture, today's date, their name (the page's heading) and how today is
     going in words; a ring that fills to the share of today's doses taken; three counts (taken, not ticked, to come); the
     next dose and how many medicines; and when it was last updated, with Refresh. Before a timetable is shared, only the
     name and "Not shared yet". The ring fills in on arrival. Reduced motion: it is simply full to its value. -->
<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScheduleText } from '../../composables/useScheduleText'
import { dayParts, dayState } from '../../rules/care'
import { todayInSingapore } from '../../rules/schedule'
import AppIcon from '../layout/AppIcon.vue'
import CareAvatar from './CareAvatar.vue'

const props = defineProps({
  name: { type: String, required: true },
  shared: { type: Boolean, default: true },
  doses: { type: Array, default: () => [] }, // [{ time, label, status }]
  medicines: { type: Number, default: 0 },
  updated: { type: String, default: '' }, // "10:42 am"
})
const emit = defineEmits(['refresh'])

const { t } = useI18n()
const { dateText, timeText } = useScheduleText()
const STATE_ICON = {
  missed: 'alert',
  done: 'checkCircle',
  onTrack: 'clock',
  none: 'calendar',
  notShared: 'info',
}

const today = computed(() =>
  ['taken', 'missed', 'upcoming'].reduce(
    (c, s) => ({ ...c, [s]: props.doses.filter((d) => d.status === s).length }),
    {},
  ),
)
const state = computed(() => (props.shared ? dayState(today.value) : 'notShared'))
const parts = computed(() => dayParts(today.value))
const percent = computed(() => Math.round(parts.value.taken))
const next = computed(
  () =>
    [...props.doses]
      .filter((d) => d.status === 'upcoming')
      .sort((a, b) => a.time.localeCompare(b.time))[0] ?? null,
)
const RING = 2 * Math.PI * 30
const STATS = [
  { key: 'taken', icon: 'checkCircle' },
  { key: 'missed', icon: 'alert' },
  { key: 'upcoming', icon: 'clock' },
]
</script>

<template>
  <section
    class="ch"
    :class="`is-${state}`"
    aria-labelledby="ch-title"
    data-testid="care-hero"
    :data-state="state"
  >
    <div class="ch-top">
      <RouterLink :to="{ name: 'care' }" class="ch-back" :aria-label="t('nav.back')"
        ><AppIcon name="left" :size="24" :stroke="2.5"
      /></RouterLink>
      <span class="ch-ro"><AppIcon name="lock" :size="16" />{{ t('care.hero.readOnly') }}</span>
    </div>

    <div class="ch-main">
      <CareAvatar :name="name" :state="shared ? state : null" :size="76" />
      <div class="ch-words">
        <span class="ch-date">{{
          dateText(todayInSingapore(), { weekday: 'long', day: 'numeric', month: 'long' })
        }}</span>
        <h1 id="ch-title" class="ch-title">
          <span class="ch-name">{{ name }}</span
          ><span class="ch-sub">{{ t('care.hero.today') }}</span>
        </h1>
        <span class="ch-state" data-testid="care-hero-state"
          ><AppIcon :name="STATE_ICON[state]" :size="18" />{{ t(`care.state.${state}`) }}</span
        >
      </div>
      <!-- The share of today's doses taken (the counts below say it in words). -->
      <svg v-if="shared && parts.total" class="ch-ring" viewBox="0 0 72 72" aria-hidden="true">
        <circle cx="36" cy="36" r="30" class="ch-ring-track" />
        <circle
          cx="36"
          cy="36"
          r="30"
          class="ch-ring-fill"
          :style="{ '--full': RING, '--to': RING * (1 - percent / 100) }"
          :stroke-dasharray="RING"
          :stroke-dashoffset="RING * (1 - percent / 100)"
        />
        <text x="36" y="38" text-anchor="middle" class="ch-ring-num">{{ percent }}%</text>
        <text x="36" y="50" text-anchor="middle" class="ch-ring-sub">
          {{ t('care.hero.done') }}
        </text>
      </svg>
    </div>

    <template v-if="shared">
      <ul class="ch-stats list-unstyled m-0" :aria-label="t('care.hero.statsLabel')">
        <li
          v-for="s in STATS"
          :key="s.key"
          class="ch-stat"
          :class="`st-${s.key}`"
          :data-testid="`care-hero-${s.key}`"
        >
          <span class="ch-stat-icon" aria-hidden="true"><AppIcon :name="s.icon" :size="20" /></span>
          <span class="ch-stat-num">{{ today[s.key] }}</span>
          <span class="ch-stat-words">{{ t(`care.status.${s.key}`) }}</span>
        </li>
      </ul>
      <dl class="ch-facts m-0">
        <div>
          <dt><AppIcon name="clock" :size="18" />{{ t('care.next') }}</dt>
          <dd data-testid="care-hero-next">
            {{ next ? `${timeText(next.time)} · ${next.label}` : t('care.nextNone') }}
          </dd>
        </div>
        <div>
          <dt><AppIcon name="pill" :size="18" />{{ t('care.meds') }}</dt>
          <dd>{{ t('care.medsCount', { n: medicines }, medicines) }}</dd>
        </div>
      </dl>
    </template>

    <div class="ch-foot">
      <span class="ch-note">{{ t('care.medsNote', { name }) }}</span>
      <span class="ch-update">
        <span v-if="updated" data-testid="care-updated">{{
          t('care.updated', { time: updated })
        }}</span>
        <button
          type="button"
          class="ch-refresh"
          data-testid="care-refresh"
          @click="emit('refresh')"
        >
          <AppIcon name="replay" :size="20" />{{ t('care.refresh') }}
        </button>
      </span>
    </div>
  </section>
</template>

<style scoped>
.ch {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px 22px 18px;
  overflow: hidden;
  isolation: isolate;
  border-radius: var(--r-card);
  background: linear-gradient(135deg, #1a7070 0%, #22788f 55%, #2f86b8 100%);
  color: #fff;
  box-shadow: 0 22px 44px -22px rgba(26, 90, 140, 0.6);
  animation: ch-in 520ms var(--ease-settle) both;
}
/* Soft light in the corner, drifting slowly. */
.ch::before {
  content: '';
  position: absolute;
  right: -80px;
  top: -90px;
  z-index: -1;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.22), transparent 70%);
  animation: ch-glow 10s ease-in-out infinite alternate;
}
.ch::after {
  content: '';
  position: absolute;
  left: -60px;
  bottom: -110px;
  z-index: -1;
  width: 240px;
  height: 240px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(143, 240, 230, 0.16), transparent 70%);
}

.ch-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ch-back {
  display: grid;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  transition:
    background-color 200ms var(--ease-out),
    transform 250ms var(--ease-settle);
}
.ch-back:hover {
  background: #fff;
  color: #135555;
  transform: translateX(-2px);
}
.ch-back:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 3px;
}
.ch-ro {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: var(--r-pill);
  background: rgba(10, 40, 40, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.25);
  font-size: 16px;
  font-weight: 700;
}

.ch-main {
  display: flex;
  align-items: center;
  gap: 18px;
}
.ch-main :deep(.ca-dot) {
  border-color: #1f7480;
}
.ch-words {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ch-date {
  font-size: 16px;
  font-weight: 600;
  opacity: 0.9;
}
.ch-title {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #fff;
}
.ch-name {
  font-family: var(--font-display);
  font-size: clamp(28px, 6vw, 38px);
  font-weight: 400;
  line-height: 1.1;
  overflow-wrap: anywhere;
}
.ch-sub {
  font-family: var(--font-sans);
  font-size: 18px;
  font-weight: 700;
  opacity: 0.92;
}
.ch-state {
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 4px 12px;
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, 0.16);
  font-size: 16px;
  font-weight: 700;
}
.is-missed .ch-state {
  background: #fff1e0;
  color: #8a4200;
}
.is-done .ch-state {
  background: #dcf7e8;
  color: #0d5c3d;
}

.ch-ring {
  flex: none;
  width: 112px;
  height: 112px;
}
.ch-ring circle {
  fill: none;
  stroke-width: 7;
}
.ch-ring-track {
  stroke: rgba(255, 255, 255, 0.25);
}
.ch-ring-fill {
  stroke: #b9f5c9;
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: 36px 36px;
  animation: ch-fill 1100ms var(--ease-out) 200ms both;
}
.is-missed .ch-ring-fill {
  stroke: #ffc98a;
}
.ch-ring-num {
  fill: #fff;
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 800;
}
.ch-ring-sub {
  fill: #fff;
  opacity: 0.85;
  font-family: var(--font-sans);
  font-size: 8px;
  font-weight: 600;
}

/* The three counts, each in its own frosted tile. */
.ch-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.ch-stat {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.ch-stat-icon {
  grid-row: 1 / 3;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
}
.st-taken .ch-stat-icon {
  background: #b9f5c9;
  color: #0d5c3d;
}
.st-missed .ch-stat-icon {
  background: #ffc98a;
  color: #6b3300;
}
.ch-stat-num {
  font-family: var(--font-display);
  font-size: 26px;
  line-height: 1.05;
  font-variant-numeric: tabular-nums lining-nums;
}
.ch-stat-words {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.25;
  opacity: 0.92;
  overflow-wrap: anywhere;
}

.ch-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.ch-facts > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(10, 40, 40, 0.22);
}
.ch-facts dt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 600;
  opacity: 0.9;
}
.ch-facts dd {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.ch-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}
.ch-note {
  font-size: 16px;
  opacity: 0.92;
}
.ch-update {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  font-weight: 600;
}
.ch-refresh {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: var(--hit);
  padding: 6px 16px;
  border-radius: var(--r-pill);
  border: 1px solid rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 200ms var(--ease-out),
    color 200ms var(--ease-out);
}
.ch-refresh:hover {
  background: #fff;
  color: #135555;
}
.ch-refresh:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 3px;
}
.ch-refresh:active .icon {
  rotate: -180deg;
  transition: rotate 300ms var(--ease-out);
}

@media (max-width: 575.98px) {
  .ch {
    padding: 16px;
  }
  /* The picture and the ring side by side, then the date, name and how today is going, full width. */
  .ch-main {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: 'face ring' 'words words';
    align-items: center;
    row-gap: 12px;
  }
  .ch-main > .ca {
    grid-area: face;
  }
  .ch-words {
    grid-area: words;
  }
  .ch-ring {
    grid-area: ring;
    width: 92px;
    height: 92px;
  }
  .ch-stats {
    gap: 6px;
  }
  .ch-stat {
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    justify-items: start;
    row-gap: 4px;
    padding: 10px;
  }
  .ch-stat-icon {
    grid-row: auto;
    width: 32px;
    height: 32px;
  }
  .ch-facts {
    grid-template-columns: 1fr;
  }
}

@keyframes ch-in {
  from {
    transform: translateY(12px);
  }
}
@keyframes ch-glow {
  to {
    transform: translate(-30px, 24px) scale(1.12);
  }
}
@keyframes ch-fill {
  from {
    stroke-dashoffset: var(--full);
  }
  to {
    stroke-dashoffset: var(--to);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ch,
  .ch::before,
  .ch-ring-fill {
    animation: none;
  }
  .ch-back,
  .ch-back:hover {
    transform: none;
  }
}
</style>

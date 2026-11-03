<!-- Owner: Asher. Schedule: a day other than today, picked on the day strip (DayStrip.vue). Its medicines by time of day, in
     the same cards as Today (TodayList.vue). An earlier day says what was taken and warns, plainly, about any dose that was
     missed: that day is over, so it can no longer be ticked, and missed doses are a question for the pharmacist.
     A later day shows what is coming, to be ticked on the day.
     Earlier days' ticks: stores/doses.js. -->
<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useDosesStore } from '../../stores/doses'
import { useScheduleText, SLOT_ICONS } from '../../composables/useScheduleText'
import { dosesOn } from '../../rules/schedule'
import AppIcon from '../layout/AppIcon.vue'
import KindIcon from '../layout/KindIcon.vue'

const props = defineProps({
  entries: { type: Array, required: true },
  date: { type: String, required: true }, // not today
})

const { t } = useI18n()
const { dateText, timeText, doseText } = useScheduleText()
const doses = useDosesStore()
const { today, past } = storeToRefs(doses)

const earlier = computed(() => props.date < today.value)
const ticks = computed(() => past.value.get(props.date) ?? null) // null while loading (a later day has none)
const dayDoses = computed(() => dosesOn(props.entries, props.date))
const groups = computed(() => {
  const byTime = new Map()
  for (const dose of dayDoses.value) byTime.set(dose.time, [...(byTime.get(dose.time) ?? []), dose])
  return [...byTime].map(([time, list]) => ({ time, doses: list, slot: list.every((d) => d.slot === list[0].slot) ? list[0].slot : null }))
})
const stateOf = (d) => (!earlier.value ? 'later' : ticks.value?.has(d.id) ? 'ok' : 'not')
const notTicked = computed(() => (earlier.value && ticks.value ? dayDoses.value.filter((d) => !ticks.value.has(d.id)).length : 0))
const heading = computed(() => dateText(props.date, { weekday: 'long', day: 'numeric', month: 'long' }))
const lead = computed(() => {
  if (!dayDoses.value.length) return t('schedule.noneOnDay')
  if (!earlier.value) return t('schedule.day.later')
  if (!ticks.value) return t('schedule.week.loading')
  return notTicked.value ? t('schedule.day.missed', { n: notTicked.value }, notTicked.value) : t('schedule.day.allTaken')
})
</script>

<template>
  <section class="other" aria-labelledby="other-title" data-testid="schedule-other-day" :data-date="date">
    <div class="other-head">
      <h2 id="other-title" class="other-title">{{ heading }}</h2>
      <p class="m-0" :class="earlier && notTicked ? 'warn' : 'text-muted-a11y'" data-testid="other-lead">{{ lead }}</p>
    </div>

    <!-- A day with a missed dose: one plain warning, with what to do. -->
    <p v-if="earlier && notTicked" class="missed-note m-0" role="note" data-testid="other-missed"><AppIcon name="alert" :size="22" /><span>{{ t('schedule.slot.missed') }}</span></p>

    <section v-for="g in groups" :key="g.time" class="slot-group" :class="`slot-${g.slot ?? 'other'}`" :aria-labelledby="`other-${g.time}`">
      <div class="group-head">
        <span class="slot-tile sm" aria-hidden="true"><AppIcon :name="SLOT_ICONS[g.slot] ?? 'clock'" :size="20" /></span>
        <h3 :id="`other-${g.time}`" class="group-name">{{ g.slot ? t(`timing.${g.slot}`) : timeText(g.time) }}</h3>
        <span class="group-count">{{ t('schedule.medsCount', { n: g.doses.length }, g.doses.length) }}</span>
      </div>
      <ul class="cards">
        <li v-for="(d, i) in g.doses" :key="d.id" class="dcard" :class="`is-${stateOf(d)}`" :style="{ '--n': i }" :data-testid="`other-${d.id}`" :data-state="stateOf(d)">
          <KindIcon kind="medication" :size="48" />
          <span class="dcard-info">
            <span class="tag">{{ timeText(d.time) }}</span>
            <strong class="dcard-name">{{ d.label }}</strong>
            <span class="dcard-detail">{{ doseText(d.instruction) }}</span>
          </span>
          <span v-if="stateOf(d) === 'ok'" class="pill pill-ok"><AppIcon name="check" :size="18" :stroke="3" />{{ t('schedule.taken') }}</span>
          <span v-else-if="stateOf(d) === 'later'" class="pill pill-later">{{ t('schedule.week.state.later') }}</span>
          <span v-else-if="ticks" class="pill pill-not"><AppIcon name="alert" :size="16" />{{ t('schedule.day.missedState') }}</span>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped src="../../styles/components/DayCards.css"></style>
<style scoped>
.other { display: flex; flex-direction: column; gap: 18px; }
.other-head { display: flex; flex-direction: column; gap: 4px; }
.other-title { margin: 0; font-size: var(--t22, 22px); font-weight: 800; }
.warn { color: var(--color-warning-text); font-weight: 700; }
.missed-note { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; border-radius: var(--r-panel); background: var(--color-warning-bg); border: 1px solid var(--color-warning-border); color: var(--color-warning-text); font-size: 17px; font-weight: 700; line-height: 1.4; }
.missed-note :deep(svg) { flex: none; margin-top: 1px; }
</style>

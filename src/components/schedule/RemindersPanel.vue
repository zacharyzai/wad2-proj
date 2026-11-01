<!-- Owner: Lokesh (built by Claude, declared in README.txt). Schedule, Reminders: the day's dose times, one row per time of
     day, however many medicines, with each time in it and what is due then. A medicine can have its own time ("Change"), so a
     slot may hold several (Morning 7:30 and 8:00). Finished courses send no reminders, so they're left out. -->
<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDosesStore } from '../../stores/doses'
import { useScheduleText, nameOf, SLOT_ICONS } from '../../composables/useScheduleText'
import AppIcon from '../layout/AppIcon.vue'

const props = defineProps({
  rows: { type: Array, required: true }, // [{ medicine, entry }] on the timetable
})

const { t } = useI18n()
const { timeText } = useScheduleText()
const doses = useDosesStore()

const doseTimes = computed(() => {
  const slots = new Map(Object.keys(SLOT_ICONS).map((slot) => [slot, new Map()]))
  for (const r of props.rows) {
    if (r.entry.endDate && r.entry.endDate < doses.today) continue
    for (const d of r.entry.doses) {
      const times = slots.get(d.id.slice(r.medicine.id.length + 1))
      times?.set(d.time, [...(times.get(d.time) ?? []), nameOf(r.medicine.medication)])
    }
  }
  return [...slots]
    .filter(([, times]) => times.size)
    .map(([slot, times]) => ({ slot, times: [...times].sort(([a], [b]) => a.localeCompare(b)).map(([time, names]) => ({ time, names })) }))
})
</script>

<template>
  <section v-if="doseTimes.length" class="card d-flex flex-column gap-2" aria-labelledby="times-title" data-testid="schedule-times">
    <h2 id="times-title" class="h3 m-0">{{ t('schedule.rem.times') }}</h2>
    <ul class="time-list">
      <li v-for="d in doseTimes" :key="d.slot" :data-testid="`times-${d.slot}`">
        <span class="slot-tile sm" :class="`slot-${d.slot}`" aria-hidden="true"><AppIcon :name="SLOT_ICONS[d.slot] ?? 'clock'" :size="20" /></span>
        <span class="flex-grow-1">{{ t(`timing.${d.slot}`) }}</span>
        <ul class="slot-times">
          <li v-for="x in d.times" :key="x.time">
            <strong class="tnum">{{ timeText(x.time) }}</strong>
            <span class="text-muted-a11y">{{ x.names.join(', ') }}</span>
          </li>
        </ul>
      </li>
    </ul>
    <p class="m-0 text-muted-a11y">{{ t('schedule.rem.timesHelp') }}</p>
    <RouterLink :to="{ query: { view: 'meds' } }" class="btn btn-outline btn-sm align-self-start">{{ t('schedule.tab.meds') }}<AppIcon name="right" :size="18" /></RouterLink>
  </section>
</template>

<style scoped src="../../styles/components/RemindersPanel.css"></style>

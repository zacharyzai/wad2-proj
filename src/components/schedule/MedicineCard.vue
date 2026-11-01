<!-- Owner: Lokesh (built by Claude, declared in README.txt). Schedule, "My medicines": one medicine on the timetable, with
     Change (Days and times, Fix what we read, Remove), "I don't need this any more" and Start again. Which panel is open is
     the page's choice (one at a time across all cards), so it comes in as props; every button is an emit. -->
<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDosesStore } from '../../stores/doses'
import { useScheduleText } from '../../composables/useScheduleText'
import AppIcon from '../layout/AppIcon.vue'
import EditDaysForm from './EditDaysForm.vue'

const props = defineProps({
  medicine: { type: Object, required: true },
  entry: { type: Object, required: true }, // its ScheduleEntry
  managing: Boolean, // the Change options are open
  editing: Boolean, // Days and times is open
  askingStop: Boolean, // "Stop taking it?" is open
})
defineEmits(['manage', 'edit', 'fix', 'remove', 'ask-stop', 'stop', 'cancel-stop', 'again', 'save', 'cancel-edit'])

const { t } = useI18n()
const { doseText, timesText, purposeOf, supplyText, dateStatus } = useScheduleText()
const doses = useDosesStore()
const id = props.medicine.id
const status = computed(() => props.entry.endDate && dateStatus(props.entry, doses.today))
</script>

<template>
  <li class="card med-card" :data-testid="`med-${id}`">
    <div class="med-line">
      <span class="tile tile-soft" aria-hidden="true"><AppIcon name="pill" :size="24" /></span>
      <span class="med-info">
        <span class="med-name">{{ entry.label }}</span>
        <span v-if="purposeOf(id)" class="text-muted-a11y fw-semibold" data-testid="med-purpose">{{ purposeOf(id) }}</span>
        <span class="text-muted-a11y">{{ doseText(entry.instruction) }}</span>
        <span class="med-times"><AppIcon name="clock" :size="18" />{{ timesText(entry) }}</span>
        <span v-if="supplyText(medicine.medication)" class="med-supply" data-testid="med-supply"><AppIcon name="pill" :size="18" />{{ supplyText(medicine.medication) }}</span>
        <span v-if="status" class="badge align-self-start" :class="{ 'badge-teal': status.kind === 'now' }">{{ status.text }}</span>
      </span>
      <button
        type="button"
        class="btn btn-secondary btn-sm change"
        :data-change="id"
        :aria-expanded="managing"
        :aria-controls="managing ? `manage-${id}` : null"
        :aria-label="t('schedule.meds.changeOne', { name: entry.label })"
        @click="$emit('manage')"
      >
        <AppIcon name="pencil" :size="20" />{{ t('schedule.meds.change') }}
      </button>
    </div>

    <!-- The one thing people want when they are better: stop, in one tap and in plain words. It ends the course (the medicine
         stays in the list as finished, with Start again) instead of deleting it. A short check-in first: we only stop the
         reminders, and never say that stopping is safe. -->
    <template v-if="status?.kind === 'now'">
      <button v-if="!askingStop" type="button" class="btn btn-outline" :data-stop="id" :data-testid="`stop-${id}`" :aria-label="`${t('schedule.stop.button')}: ${entry.label}`" @click="$emit('ask-stop')">
        <AppIcon name="xCircle" :size="22" />{{ t('schedule.stop.button') }}
      </button>
      <div v-else class="alert alert-warning flex-column" role="alertdialog" :aria-labelledby="`stop-q-${id}`" :aria-describedby="`stop-text-${id}`" :data-testid="`stop-ask-${id}`" @keydown.esc="$emit('cancel-stop')">
        <strong :id="`stop-q-${id}`">{{ t('schedule.stop.ask', { name: entry.label }) }}</strong>
        <span :id="`stop-text-${id}`">{{ t('schedule.stop.text') }}</span>
        <div class="d-flex flex-column flex-sm-row gap-2">
          <button type="button" class="btn btn-primary" :data-stop-yes="id" @click="$emit('stop')"><AppIcon name="check" :size="22" />{{ t('schedule.stop.yes') }}</button>
          <button type="button" class="btn btn-secondary" @click="$emit('cancel-stop')">{{ t('schedule.stop.no') }}</button>
        </div>
      </div>
    </template>
    <button v-else-if="status?.kind === 'ended'" type="button" class="btn btn-outline" :data-testid="`again-${id}`" :aria-label="`${t('schedule.stop.again')}: ${entry.label}`" @click="$emit('again')">
      <AppIcon name="replay" :size="22" />{{ t('schedule.stop.again') }}
    </button>

    <div v-if="managing" :id="`manage-${id}`" class="manage" data-testid="schedule-manage">
      <button type="button" class="btn btn-outline btn-sm" :aria-label="t('schedule.meds.daysTimesOne', { name: entry.label })" @click="$emit('edit')"><AppIcon name="clock" :size="20" />{{ t('schedule.meds.daysTimes') }}</button>
      <button type="button" class="btn btn-outline btn-sm" :aria-label="t('schedule.fix.buttonOne', { name: entry.label })" @click="$emit('fix')"><AppIcon name="scan" :size="20" />{{ t('schedule.fix.button') }}</button>
      <button type="button" class="btn btn-outline btn-sm" :aria-label="t('schedule.meds.removeOne', { name: entry.label })" @click="$emit('remove')"><AppIcon name="xCircle" :size="20" />{{ t('schedule.meds.remove') }}</button>
    </div>

    <EditDaysForm v-if="editing" :medicine="medicine" :entry="entry" :label="entry.label" @save="$emit('save', $event)" @cancel="$emit('cancel-edit')" />

    <!-- Not on the timetable until we know how long to take it for: say so, with its button in view (never behind Change). -->
    <div v-else-if="!entry.endDate" class="alert alert-warning flex-column" data-testid="schedule-need-days">
      <span class="d-flex gap-2"><AppIcon name="alert" /><strong>{{ t('schedule.meds.needDays') }}</strong></span>
      <span>{{ t('schedule.meds.needDaysHelp') }}</span>
      <button type="button" class="btn btn-primary btn-sm align-self-start" :aria-label="t('schedule.meds.setDaysOne', { name: entry.label })" @click="$emit('edit')"><AppIcon name="pencil" :size="20" />{{ t('schedule.meds.setDays') }}</button>
    </div>
  </li>
</template>

<style scoped src="../../styles/components/MedicineCard.css"></style>

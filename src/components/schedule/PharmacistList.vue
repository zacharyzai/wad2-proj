<script setup>
import { useI18n } from 'vue-i18n'
import { useScheduleText } from '../../composables/useScheduleText'
import AppIcon from '../layout/AppIcon.vue'

defineProps({
  rows: { type: Array, required: true }, // [{ medicine, entry }]
  managing: { type: String, default: null }, // id of the medicine whose options are open
})
defineEmits(['manage', 'fix', 'remove'])

const { t } = useI18n()
const { purposeOf } = useScheduleText()
</script>

<template>
  <section
    class="card card-warning pharm"
    aria-labelledby="pharm-title"
    data-testid="schedule-pharmacist"
  >
    <div class="d-flex align-items-start gap-3">
      <span class="tile tile-warning" aria-hidden="true"><AppIcon name="users" :size="24" /></span>
      <div class="d-flex flex-column gap-1">
        <h2 id="pharm-title" class="h3 m-0">{{ t('schedule.pharm.title') }}</h2>
        <p class="m-0">{{ t('schedule.pharm.text') }}</p>
      </div>
    </div>
    <ul class="pharm-list">
      <li
        v-for="r in rows"
        :key="r.medicine.id"
        class="pharm-row"
        :data-testid="`med-${r.medicine.id}`"
      >
        <div class="med-line">
          <span class="med-info">
            <span
              v-if="
                r.medicine.medication.frequencyType &&
                r.medicine.medication.frequencyType !== 'daily'
              "
              class="badge badge-warning align-self-start"
              >{{ t(`freq.${r.medicine.medication.frequencyType}`) }}</span
            >
            <span class="med-name">{{ r.entry.label }}</span>
            <span v-if="purposeOf(r.medicine.id)" class="text-muted-a11y fw-semibold">{{
              purposeOf(r.medicine.id)
            }}</span>
            <span
              v-if="r.medicine.medication.rawInstruction"
              class="text-muted-a11y"
              :lang="r.medicine.source === 'label' ? 'en' : null"
              >“{{ r.medicine.medication.rawInstruction }}”</span
            >
          </span>
          <button
            type="button"
            class="btn btn-outline btn-sm change"
            :data-change="r.medicine.id"
            :aria-expanded="managing === r.medicine.id"
            :aria-controls="managing === r.medicine.id ? `manage-${r.medicine.id}` : null"
            :aria-label="t('schedule.meds.changeOne', { name: r.entry.label })"
            @click="$emit('manage', r.medicine.id)"
          >
            <AppIcon name="pencil" :size="20" />{{ t('schedule.meds.change') }}
          </button>
        </div>
        <!-- Fix is for a label we misread, e.g. "twice a day" read as "when needed". -->
        <div
          v-if="managing === r.medicine.id"
          :id="`manage-${r.medicine.id}`"
          class="manage"
          data-testid="schedule-manage"
        >
          <button
            type="button"
            class="btn btn-outline btn-sm"
            :aria-label="t('schedule.fix.buttonOne', { name: r.entry.label })"
            @click="$emit('fix', r.medicine)"
          >
            <AppIcon name="scan" :size="20" />{{ t('schedule.fix.button') }}
          </button>
          <button
            type="button"
            class="btn btn-outline btn-sm"
            :aria-label="t('schedule.meds.removeOne', { name: r.entry.label })"
            @click="$emit('remove', r.medicine)"
          >
            <AppIcon name="xCircle" :size="20" />{{ t('schedule.meds.remove') }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped src="../../styles/components/MedicineCard.css"></style>

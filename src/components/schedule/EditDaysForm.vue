<!-- Owner: Lokesh (built by Claude, declared in README.txt). Schedule, "Days and times" for one medicine: number of days, start
     date, a time for each dose. Emits save({ startDate, days, times }) once every field is valid, or cancel. -->
<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDosesStore } from '../../stores/doses'
import { useScheduleText, SLOT_ICONS } from '../../composables/useScheduleText'
import {
  doseSlots,
  labelLimitDays,
  supplyDays,
  validDate,
  validDays,
  validTime,
  MAX_DAYS,
} from '../../rules/schedule'
import AppIcon from '../layout/AppIcon.vue'

const props = defineProps({
  medicine: { type: Object, required: true },
  entry: { type: Object, required: true }, // its ScheduleEntry, for the times it has now
  label: { type: String, required: true },
})
const emit = defineEmits(['save', 'cancel'])

const { t } = useI18n()
const { supplyText } = useScheduleText()
const id = props.medicine.id
const limit = labelLimitDays(props.medicine.medication)

const form = reactive({
  days: props.medicine.schedule?.days ?? supplyDays(props.medicine.medication) ?? '', // a label with a quantity fills it in
  startDate: props.medicine.schedule?.startDate ?? useDosesStore().today,
  times: Object.fromEntries(props.entry.doses.map((d) => [d.id.slice(id.length + 1), d.time])),
})
const formEl = ref(null) // no document.getElement… lookups
const daysInput = ref(null)
const tried = ref(false) // errors show after the first Save, not while the person is still typing
const slots = doseSlots(props.medicine.medication) ?? []
const problems = computed(() => {
  const p = {}
  if (!/^\d+$/.test(String(form.days).trim()) || !validDays(Number(form.days)))
    p.days = t('schedule.form.bad.days', { max: MAX_DAYS })
  if (!validDate(form.startDate)) p.startDate = t('schedule.form.bad.start')
  for (const slot of slots) if (!validTime(form.times[slot])) p[slot] = t('schedule.form.bad.time')
  return p
})
// A field's problem, shown only after the first save attempt.
const shown = (key) => (tried.value ? problems.value[key] : null)

// Saves the changed days and times, or focuses the first problem.
async function save() {
  tried.value = true
  if (Object.keys(problems.value).length) {
    await nextTick()
    return formEl.value.querySelector('[aria-invalid="true"]')?.focus()
  }
  emit('save', { startDate: form.startDate, days: Number(form.days), times: { ...form.times } })
}

onMounted(() => daysInput.value.focus())
</script>

<template>
  <form
    ref="formEl"
    class="edit-form"
    novalidate
    :aria-label="t('schedule.form.title', { name: label })"
    @submit.prevent="save"
  >
    <div class="field">
      <label :for="`days-${id}`" class="field-label">{{ t('schedule.form.days') }}</label>
      <span :id="`days-help-${id}`" class="field-help"
        >{{ t('schedule.form.daysHelp')
        }}<template v-if="supplyText(medicine.medication)">
          {{ supplyText(medicine.medication) }}</template
        ></span
      >
      <input
        :id="`days-${id}`"
        ref="daysInput"
        v-model="form.days"
        class="field-input days-input"
        :class="{ 'is-error': shown('days') }"
        inputmode="numeric"
        maxlength="3"
        autocomplete="off"
        :aria-invalid="Boolean(shown('days'))"
        :aria-describedby="`days-help-${id}` + (shown('days') ? ` days-error-${id}` : '')"
        data-testid="schedule-days"
      />
      <p v-if="shown('days')" :id="`days-error-${id}`" class="field-error" role="alert">
        {{ shown('days') }}
      </p>
      <!-- Not a block: the person may know better (a doctor told them), so this only says what the label says. -->
      <p
        v-if="limit && Number(form.days) > limit"
        class="alert alert-warning m-0"
        data-testid="schedule-over-limit"
      >
        <AppIcon name="alert" :size="20" />{{
          t('schedule.form.overLimit', { days: limit }, limit)
        }}
      </p>
    </div>
    <div class="field">
      <label :for="`start-${id}`" class="field-label">{{ t('schedule.form.start') }}</label>
      <input
        :id="`start-${id}`"
        v-model="form.startDate"
        type="date"
        class="field-input"
        :class="{ 'is-error': shown('startDate') }"
        :aria-invalid="Boolean(shown('startDate'))"
        :aria-describedby="shown('startDate') ? `start-error-${id}` : null"
        data-testid="schedule-start"
      />
      <p v-if="shown('startDate')" :id="`start-error-${id}`" class="field-error" role="alert">
        {{ shown('startDate') }}
      </p>
    </div>
    <fieldset class="field times">
      <legend class="field-label">{{ t('schedule.form.times') }}</legend>
      <div class="time-grid">
        <div v-for="slot in slots" :key="slot" class="field">
          <label :for="`time-${id}-${slot}`" class="time-label"
            ><AppIcon :name="SLOT_ICONS[slot]" :size="20" />{{ t(`timing.${slot}`) }}</label
          >
          <input
            :id="`time-${id}-${slot}`"
            v-model="form.times[slot]"
            type="time"
            class="field-input"
            :class="{ 'is-error': shown(slot) }"
            :aria-invalid="Boolean(shown(slot))"
            :aria-describedby="shown(slot) ? `time-error-${id}-${slot}` : null"
            :data-testid="`schedule-time-${slot}`"
          />
          <p v-if="shown(slot)" :id="`time-error-${id}-${slot}`" class="field-error" role="alert">
            {{ shown(slot) }}
          </p>
        </div>
      </div>
    </fieldset>
    <div class="d-flex flex-column flex-sm-row gap-3">
      <button type="submit" class="btn btn-primary" data-testid="schedule-save">
        <AppIcon name="check" />{{ t('schedule.form.save') }}
      </button>
      <button type="button" class="btn btn-ghost" @click="emit('cancel')">
        {{ t('schedule.form.cancel') }}
      </button>
    </div>
  </form>
</template>

<style scoped src="../../styles/components/EditDaysForm.css"></style>

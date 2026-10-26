<!-- Owner: Asher. One labelled field on Confirm. Flagged = amber, left empty and marked "Please check"; never guessed. -->
<script setup>
import { useI18n } from 'vue-i18n'
import AppIcon from '../layout/AppIcon.vue'

defineProps({
  label: { type: String, required: true },
  // Set for a single input so the label is clickable; leave unset for button groups.
  for: { type: String, default: null },
  flagged: { type: Boolean, default: false },
  note: { type: String, default: null }, // why it is flagged, when it isn't just unreadable ("Must be more than 0")
})

const { t } = useI18n()
</script>

<template>
  <div class="field" :class="{ flagged }" :role="$props.for ? null : 'group'" :aria-label="$props.for ? null : label">
    <div class="field-row">
      <component :is="$props.for ? 'label' : 'span'" :for="$props.for" class="field-label">{{ label }}</component>
      <Transition name="fc-fade"><span v-if="flagged" class="badge badge-warning check"><AppIcon name="alert" :size="16" />{{ t('confirm.pleaseCheck') }}</span></Transition>
    </div>
    <slot />
    <Transition name="fc-note"><div v-if="flagged" class="note-wrap"><span class="field-note">{{ note ?? t('confirm.couldntRead') }}</span></div></Transition>
  </div>
</template>

<style scoped src="../../styles/components/ConfirmField.css"></style>

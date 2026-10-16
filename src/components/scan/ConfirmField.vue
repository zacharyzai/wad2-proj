<!-- Owner: Asher. One labelled field on Confirm. Flagged = amber, left empty and marked "Please check"; never guessed. -->
<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  label: { type: String, required: true },
  // Set for a single input so the label is clickable; leave unset for button groups.
  for: { type: String, default: null },
  flagged: { type: Boolean, default: false },
})

const { t } = useI18n()
</script>

<template>
  <div class="field" :class="{ flagged }" :role="$props.for ? null : 'group'" :aria-label="$props.for ? null : label">
    <component :is="$props.for ? 'label' : 'span'" :for="$props.for" class="field-label">
      {{ label }}
      <span v-if="flagged" class="tag tag-amber">{{ t('confirm.pleaseCheck') }}</span>
    </component>
    <slot />
    <span v-if="flagged" class="field-note">{{ t('confirm.couldntRead') }}</span>
  </div>
</template>

<style scoped>
.field { display: flex; flex-direction: column; gap: 8px; }
.field.flagged { padding: 16px; border: 3px solid var(--amber); border-radius: 12px; background: var(--amber-soft); }
.field-label { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-weight: 700; }
.field-note { color: var(--amber-ink); }
</style>

<!-- One labelled field on Confirm; flagged fields are amber and left empty rather than guessed. -->
<script setup>
import { useI18n } from 'vue-i18n'
import AppIcon from '../layout/AppIcon.vue'
import InfoTip from '../layout/InfoTip.vue'

defineProps({
  label: { type: String, required: true },
  // Set for a single input so the label is clickable; leave unset for button groups.
  for: { type: String, default: null },
  flagged: { type: Boolean, default: false },
  note: { type: String, default: null }, // why it is flagged, when it isn't just unreadable ("Must be more than 0")
  help: { type: String, default: null }, // a line of help, kept behind an "i" button until wanted (needs `for`: the input's aria-describedby is `<for>-help`)
})

const { t } = useI18n()
</script>

<template>
  <div
    class="field"
    :class="{ flagged }"
    :role="$props.for ? null : 'group'"
    :aria-label="$props.for ? null : label"
  >
    <div class="field-row">
      <!-- The "i" sits right after the words it explains (not at the far edge, where the row's badge goes). -->
      <span class="label-group">
        <component :is="$props.for ? 'label' : 'span'" :for="$props.for" class="field-label">{{
          label
        }}</component>
        <InfoTip
          v-if="help && $props.for"
          :id="`${$props.for}-help`"
          :text="help"
          :label="t('tip.more', { name: label })"
        />
      </span>
      <Transition name="fc-fade"
        ><span v-if="flagged" class="badge badge-warning check"
          ><AppIcon name="alert" :size="16" />{{ t('confirm.pleaseCheck') }}</span
        ></Transition
      >
    </div>
    <slot />
    <Transition name="fc-note"
      ><div v-if="flagged" class="note-wrap">
        <span class="field-note">{{ note ?? t('confirm.couldntRead') }}</span>
      </div></Transition
    >
  </div>
</template>

<style scoped src="../../styles/components/ConfirmField.css"></style>

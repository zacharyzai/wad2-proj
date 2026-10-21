<!-- Owner: Lokesh. One tappable bill line: category icon + colour + label, the amount, and a plain explanation that opens below with read-aloud. -->
<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ReadAloud from '../explain/ReadAloud.vue'
import AppIcon from '../layout/AppIcon.vue'
import { money } from './lines'

const props = defineProps({
  // { id, icon, tone, name, nameLang, tag, amountCents, minus, text } built by BillView
  line: { type: Object, required: true },
  open: { type: Boolean, default: false },
})
defineEmits(['toggle'])

const { t } = useI18n()
const amount = computed(() => (props.line.minus ? '−' : '') + money(props.line.amountCents))
// Spoken as words ("$8.70 taken off"), since a minus sign isn't read the same way by every voice.
const speech = computed(() => {
  const said = props.line.minus ? t('bill.takenOffAmount', { amount: money(props.line.amountCents) }) : money(props.line.amountCents)
  return `${props.line.name}. ${said}. ${props.line.text}`
})
const panelId = computed(() => `line-${props.line.id}`)
</script>

<template>
  <li class="line" :class="`tone-${line.tone}`">
    <button type="button" class="line-btn" :aria-expanded="open" :aria-controls="panelId" @click="$emit('toggle')">
      <span class="line-tile"><AppIcon :name="line.icon" :size="24" /></span>
      <span class="d-flex flex-column gap-1 flex-grow-1 min-w-0">
        <span class="line-name" :lang="line.nameLang">{{ line.name }}</span>
        <span class="line-tag">{{ line.tag }}</span>
      </span>
      <span class="line-amount">{{ amount }}</span>
      <AppIcon :name="open ? 'up' : 'down'" :size="22" class="line-chev" />
    </button>
    <div v-if="open" :id="panelId" class="line-panel">
      <p class="line-text">{{ line.text }}</p>
      <ReadAloud :text="speech" />
    </div>
  </li>
</template>

<style scoped src="../../styles/components/BillLine.css"></style>

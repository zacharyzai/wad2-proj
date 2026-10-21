<!-- Owner: Zachary. Two-part status pill (adapted from 21st.dev's Tremor StatusBadge): a bold left label with an optional
     status-coloured icon, a divider, then a muted right label. Icons are AppIcon names. Extra attributes and classes fall through to the outer span. -->
<script setup>
import AppIcon from './AppIcon.vue'

defineProps({
  leftLabel: { type: String, required: true },
  rightLabel: { type: String, required: true },
  leftIcon: { type: String, default: null },
  rightIcon: { type: String, default: null },
  status: { type: String, default: 'default', validator: (v) => ['success', 'error', 'default'].includes(v) },
})
</script>

<template>
  <span class="status-badge" :class="`status-badge--${status}`">
    <span class="part main">
      <AppIcon v-if="leftIcon" :name="leftIcon" :size="18" class="status-icon" />
      {{ leftLabel }}
    </span>
    <span class="divider" aria-hidden="true"></span>
    <span class="part">
      <AppIcon v-if="rightIcon" :name="rightIcon" :size="18" />
      {{ rightLabel }}
    </span>
  </span>
</template>

<style scoped>
/* Tremor's 12px label is below the app's 16px minimum, so text uses --fs-small; spacing keeps the original px. */
.status-badge { display: inline-flex; align-items: center; gap: 10px; padding: 6px 12px; border: 1px solid var(--color-border); border-radius: var(--r-pill); background: var(--color-card); font-size: var(--fs-small); line-height: 1.3; }
.part { display: inline-flex; align-items: center; gap: 6px; color: var(--color-text-muted); }
.part :deep(.icon) { margin-left: -2px; }
.main { font-weight: 600; color: var(--color-text); }
.divider { width: 1px; height: 18px; background: var(--color-border-strong); }
.status-badge--success .status-icon { color: var(--color-success-text); }
.status-badge--error .status-icon { color: var(--color-danger-text); }
</style>

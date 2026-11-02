<!-- Owner: Asher. A scan carries on when the person taps away from Scan mid-way (views/ScanView.vue). This small notice,
     above the phone tabs (bottom right on desktop), says it is still reading, then that it is ready to check, or that it
     could not finish, with one button to it. Gone once they are on Scan or Confirm, which show the scan themselves. -->
<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { scanStore } from '../../stores/scan'
import AppIcon from '../layout/AppIcon.vue'
import Spinner from '../layout/Spinner.vue'

const { t } = useI18n()
const route = useRoute()

const away = computed(() => scanStore.away)
watch(
  () => route.name,
  (name) => (name === 'scan' || name === 'confirm') && (scanStore.away = null),
)
// Ready: straight to checking it. Still going or failed: back to Scan, which shows it.
const go = computed(() => (away.value?.status === 'ready' ? { name: 'confirm' } : { name: 'scan', query: { type: away.value?.type } }))
const ACTION = { working: 'see', ready: 'check', failed: 'why' }
</script>

<template>
  <Transition name="away">
    <div v-if="away" class="away" :class="`is-${away.status}`" role="status" data-testid="scan-away">
      <span class="away-mark" aria-hidden="true">
        <Spinner v-if="away.status === 'working'" :size="26" />
        <AppIcon v-else :name="away.status === 'ready' ? 'checkCircle' : 'alert'" :size="26" />
      </span>
      <p class="away-words">{{ t(`scan.away.${away.status}.${away.type}`) }}</p>
      <RouterLink :to="go" class="btn away-go" :class="away.status === 'ready' ? 'btn-primary' : 'btn-secondary'" data-testid="scan-away-go">{{ t(`scan.away.${ACTION[away.status]}`) }}</RouterLink>
      <button v-if="away.status !== 'working'" type="button" class="away-close" :aria-label="t('scan.away.close')" @click="scanStore.away = null"><AppIcon name="x" :size="22" /></button>
    </div>
  </Transition>
</template>

<style scoped>
/* Phones: across the bottom, just above the tabs. Desktop: a card in the bottom-right corner. */
/* Its own layer in page changes (motion.css), like the tab bar: otherwise the page and the disclaimer footer, which glide
   in their own layers, are drawn over it for a moment. */
.away { view-transition-name: scan-away; position: fixed; z-index: 15; left: 12px; right: 12px; bottom: calc(92px + env(safe-area-inset-bottom)); display: flex; align-items: center; flex-wrap: wrap; gap: 10px 12px; padding: 12px 12px 12px 16px; border: 1px solid var(--color-border); border-radius: var(--r-panel); background: var(--color-card); color: var(--color-text); box-shadow: var(--shadow-hover); }
.away-mark { flex: none; display: grid; place-items: center; color: var(--color-primary-text); }
.is-ready .away-mark { color: var(--color-success-text); }
.is-failed .away-mark { color: var(--color-warning-text); }
.away-words { flex: 1 1 160px; min-width: 0; margin: 0; font-size: 18px; font-weight: 700; line-height: 1.35; }
.away-go { flex: none; min-height: var(--hit); padding: 8px 18px; border-radius: var(--r-pill); font-size: 17px; }
.away-close { flex: none; width: var(--hit); height: var(--hit); display: grid; place-items: center; border: 0; border-radius: 50%; background: none; color: var(--color-text-muted); cursor: pointer; }
.away-close:hover { background: var(--color-surface-2); }
@media (min-width: 992px) {
  .away { left: auto; right: 24px; bottom: 24px; width: min(460px, calc(100vw - 296px)); }
}

.away-enter-active { transition: opacity 260ms var(--ease-out), transform 360ms var(--ease-settle); }
.away-leave-active { transition: opacity 160ms ease-in, transform 160ms ease-in; }
.away-enter-from, .away-leave-to { opacity: 0; transform: translateY(12px); }
</style>

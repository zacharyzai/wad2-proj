<!-- Owner: Isaac. The day/night toggle in the sidebar (desktop) and the phone header, so night mode is one tap from every
     page (the Account page still offers Day, Night or Same as my phone). A capsule-shaped track (a faint seam down the
     middle, like a pill): the knob carries the icon for what is showing and slides across; the other icon waits at the
     far end. A real switch (role="switch", on = night), named "Night mode", with a 48px tap area. Pressing it cross-fades
     the whole screen to the other colours (src/theme.js). -->
<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { setTheme, shownTheme } from '../../theme'
import { saveTheme } from '../../stores/auth'
import AppIcon from './AppIcon.vue'

const { t } = useI18n()
const isDark = computed(() => shownTheme.value === 'dark')

// An explicit Day or Night (pressing it is a choice, even from "Same as my phone"). Saved to the account in the
// background; this device remembers it either way.
function toggle(event) {
  const next = isDark.value ? 'light' : 'dark'
  setTheme(next, event.currentTarget)
  saveTheme(next)
}
</script>

<template>
  <button type="button" role="switch" class="tt" :class="{ dark: isDark }" :aria-checked="isDark" data-testid="theme-toggle" @click="toggle">
    <span class="track" aria-hidden="true">
      <span class="knob"><AppIcon :name="isDark ? 'moon' : 'sun'" :size="16" :stroke="1.75" /></span>
      <span class="other"><AppIcon :name="isDark ? 'sun' : 'moon'" :size="16" :stroke="1.75" /></span>
    </span>
    <span class="tt-label">{{ t('nav.nightMode') }}</span>
  </button>
</template>

<style scoped>
.tt { display: inline-flex; align-items: center; justify-content: center; gap: 12px; min-width: var(--hit); min-height: var(--hit); padding: 0 2px; border: 0; border-radius: var(--r-pill); background: none; color: var(--color-text); font: 600 16px / 1.25 var(--font-sans); text-align: left; }
/* Phones: the toggle alone beside Account; its name is still "Night mode". */
.tt-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* 64 × 32 capsule: day = paper with a soft edge, night = the darkest surface. The seam is the capsule's join. */
.track { position: relative; flex: none; display: flex; align-items: center; justify-content: space-between; width: 64px; height: 32px; padding: 3px; border-radius: var(--r-pill); border: 1.5px solid color-mix(in srgb, var(--color-text-muted) 70%, transparent); background: var(--color-card); transition: background-color 300ms var(--ease-out), border-color 300ms var(--ease-out); }
.track::before { content: ''; position: absolute; left: 50%; top: 22%; bottom: 22%; width: 1px; background: currentColor; opacity: 0.14; }
.dark .track { background: var(--color-page); }

/* Both circles are 24px; the knob slides 32px to the right in day mode, the other icon 32px to the left (they swap ends). */
.knob, .other { position: relative; z-index: 1; flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; transition: transform 320ms var(--ease-spring), background-color 300ms var(--ease-out), color 300ms var(--ease-out); }
.knob { background: var(--color-surface-2); color: var(--color-text); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18); transform: translateX(32px); }
.other { color: var(--color-text-muted); transform: translateX(-32px); }
.dark .knob, .dark .other { transform: none; }
.tt:active .knob { scale: 0.9; }

/* Sidebar (desktop): a full-width row with its words, like the menu items above it. */
@media (min-width: 992px) {
  .tt { width: 100%; justify-content: flex-start; min-height: 52px; padding: 6px 12px; border: 1px solid var(--color-border); border-radius: 16px; transition: background-color var(--dur) var(--ease-out); }
  .tt:hover { background: var(--color-surface-2); }
  .tt-label { position: static; width: auto; height: auto; overflow: visible; clip-path: none; white-space: normal; }
}
</style>

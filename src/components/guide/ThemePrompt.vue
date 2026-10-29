<!-- Owner: Isaac. Day, night or "same as my phone": asked once, on Home, to an account that hasn't chosen (a new signup,
     or an account from before this setting), then the Beginner's guide follows (stores/guide.js). Tapping a choice changes
     the page at once so they see it; Next (or Esc, which keeps what is showing) saves it to the account.
     Looks like the guide's own card: a bottom sheet on phones, a centred card from 768px. Native <dialog>: focus stays inside. -->
<script setup>
import { nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { guide, maybeShowGuide } from '../../stores/guide'
import { saveTheme } from '../../stores/auth'
import { THEME_ICONS, THEMES, setTheme, themeChoice } from '../../theme'
import AppIcon from '../layout/AppIcon.vue'

const { t } = useI18n()
const route = useRoute()
const box = ref(null)

watch(
  () => guide.askTheme,
  async (open) => {
    if (!open) return
    await nextTick()
    if (!box.value?.open) box.value?.showModal()
  },
  { immediate: true }, // the first page can ask before this component has mounted
)

// Next or Esc (Esc keeps what is showing). Not the dialog's close event: Chrome skips it after an Esc we handled ourselves.
function finish() {
  if (!guide.askTheme) return
  box.value?.close()
  saveTheme(themeChoice.value)
  guide.askTheme = false
  maybeShowGuide(route, false) // now the Beginner's guide
}
</script>

<template>
  <dialog v-if="guide.askTheme" ref="box" class="ask" aria-labelledby="theme-ask-title" aria-describedby="theme-ask-text" data-testid="theme-prompt" @keydown.esc.prevent="finish" @cancel.prevent="finish">
    <h2 id="theme-ask-title">{{ t('account.theme.title') }}</h2>
    <p id="theme-ask-text" class="m-0">{{ t('account.theme.note') }}</p>
    <div class="segmented theme-choices" role="group" aria-labelledby="theme-ask-title">
      <button v-for="c in THEMES" :key="c" type="button" :aria-pressed="themeChoice === c" :autofocus="themeChoice === c" :data-theme-choice="c" @click="setTheme(c)">
        <AppIcon :name="THEME_ICONS[c]" :size="22" />{{ t(`account.theme.${c}`) }}
      </button>
    </div>
    <p class="text-muted-a11y m-0">{{ t('account.theme.later') }}</p>
    <button type="button" class="btn btn-primary" data-testid="theme-prompt-next" @click="finish">{{ t('guide.next') }}<AppIcon name="right" /></button>
  </dialog>
</template>

<style scoped>
/* Same as the guide's card steps (GuideDialog.vue): bottom sheet on phones, centred card ≥768px. */
.ask[open] { display: flex; }
.ask { position: fixed; inset: auto 0 0; width: 100%; max-width: 100%; max-height: 100dvh; margin: 0; flex-direction: column; gap: 16px; overflow-y: auto; padding: 20px 20px calc(28px + env(safe-area-inset-bottom)); border: 0; border-radius: 24px 24px 0 0; background: var(--color-card); color: var(--color-text); box-shadow: 0 -6px 40px rgba(0, 0, 0, 0.22); animation: rise 280ms var(--ease-out) both; }
.ask::backdrop { background: rgba(20, 18, 16, 0.66); animation: fade 200ms ease-out both; }
h2 { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: var(--t28, 28px); line-height: 1.2; text-wrap: pretty; }
:lang(ta) h2 { font-family: var(--font-sans); font-weight: 800; }
@media (min-width: 768px) {
  .ask { inset: 0; margin: auto; width: 520px; max-height: calc(100dvh - 80px); padding: 32px; border-radius: 24px; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28); }
  .btn { align-self: flex-end; }
}
@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(24px); } }
@media (prefers-reduced-motion: reduce) { .ask, .ask::backdrop { animation: none; } }
</style>

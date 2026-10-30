<!-- Owner: Isaac. "Log out of this phone or computer?" as a calm pop-up, so a senior always knows what is about to happen:
     the app's capsule waving goodbye, the question, "Come back soon!", the reminder that logging back in needs the email
     and password, and two big choices in words: Stay logged in (focused first, so a stray Enter never logs anyone out)
     and Log out. Esc or a tap outside also means stay. Native <dialog>: focus stays inside and returns afterwards. -->
<script setup>
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['stay', 'leave'])
const { t } = useI18n()
const box = ref(null)

watch(
  () => props.open,
  async (open) => {
    await nextTick()
    if (open && !box.value?.open) box.value?.showModal()
    else if (!open && box.value?.open) box.value.close()
  },
)
// A tap on the dimmed area around the card (the dialog element itself, not its contents) means stay.
const onClick = (event) => event.target === box.value && emit('stay')
</script>

<template>
  <dialog ref="box" class="leave" aria-labelledby="leave-title" aria-describedby="leave-text" data-testid="account-logout-ask" @cancel.prevent="emit('stay')" @click="onClick">
    <div class="art" aria-hidden="true">
      <svg viewBox="0 0 240 170" width="240" height="170">
        <defs><clipPath id="leave-capsule"><rect x="60" y="62" width="120" height="60" rx="30" /></clipPath></defs>
        <circle class="dot" cx="38" cy="40" r="6" /><circle class="dot soft" cx="206" cy="132" r="9" /><circle class="dot" cx="214" cy="56" r="4" />
        <ellipse class="shadow" cx="120" cy="150" rx="56" ry="7" />
        <g transform="rotate(-14 120 92)">
          <!-- The resting arm, then the capsule (teal and cream halves, a gloss), its face on the cream half -->
          <path class="limb" d="M70 112 L56 128" /><circle class="hand" cx="54" cy="131" r="6" />
          <g clip-path="url(#leave-capsule)">
            <rect class="half-a" x="60" y="62" width="60" height="60" /><rect class="half-b" x="120" y="62" width="60" height="60" />
            <rect class="gloss" x="72" y="68" width="96" height="9" rx="4.5" />
          </g>
          <circle class="eye" cx="142" cy="88" r="4" /><circle class="eye" cx="160" cy="88" r="4" />
          <path class="smile" d="M141 99 Q151 107 161 99" />
          <circle class="cheek" cx="134" cy="98" r="4" /><circle class="cheek" cx="168" cy="98" r="4" />
          <!-- The waving arm: swings from the shoulder, three times -->
          <g class="wave-arm"><path class="limb" d="M172 70 L192 44" /><circle class="hand" cx="194" cy="40" r="7" /></g>
        </g>
        <path class="swish" d="M212 28 q8 8 2 18" /><path class="swish" d="M222 22 q10 12 2 26" />
      </svg>
    </div>
    <div class="body">
      <h2 id="leave-title">{{ t('account.logoutAsk') }}</h2>
      <p class="bye">{{ t('account.logoutBye') }}</p>
      <p id="leave-text" class="note">{{ t('account.logoutNote') }}</p>
      <div class="acts">
        <button type="button" class="btn btn-secondary" autofocus data-testid="account-logout-stay" @click="emit('stay')">{{ t('account.stay') }}</button>
        <button type="button" class="btn btn-primary" data-testid="account-logout-yes" @click="emit('leave')"><AppIcon name="logout" />{{ t('account.logout') }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.leave { width: min(440px, calc(100% - 32px)); max-height: calc(100dvh - 32px); padding: 0; margin: auto; overflow: auto; border: 0; border-radius: var(--r-card); background: var(--color-card); color: var(--color-text); box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28); }
.leave[open] { animation: pop 340ms var(--ease-spring) both; }
.leave::backdrop { background: rgba(20, 18, 16, 0.6); animation: fade 220ms ease-out both; }

/* The picture sits on a soft teal panel across the top of the card. */
.art { display: grid; place-items: center; padding: 18px 16px 6px; background: var(--color-tint); }
.art svg { display: block; width: min(240px, 100%); height: auto; }
.dot { fill: var(--color-primary); opacity: 0.18; }
.dot.soft { fill: #f3d27a; opacity: 0.6; }
.shadow { fill: rgba(0, 0, 0, 0.1); }
.half-a { fill: var(--color-primary); }
.half-b { fill: #f3d27a; }
.gloss { fill: #fff; opacity: 0.35; }
.eye { fill: #2b2622; }
.smile { fill: none; stroke: #2b2622; stroke-width: 3; stroke-linecap: round; }
.cheek { fill: #f08a7e; opacity: 0.5; }
.limb { fill: none; stroke: var(--color-text); stroke-width: 3.5; stroke-linecap: round; }
.hand { fill: #fffdfa; stroke: var(--color-text); stroke-width: 2.5; }
.swish { fill: none; stroke: var(--color-primary-text); stroke-width: 2.5; stroke-linecap: round; opacity: 0; animation: swish 1.2s ease-in-out 3 300ms; }
.wave-arm { transform-box: view-box; transform-origin: 172px 70px; animation: wave 1.2s ease-in-out 3 300ms; }

.body { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 22px 24px 26px; text-align: center; }
h2 { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: var(--t26, 26px); line-height: 1.2; text-wrap: balance; }
:lang(ta) h2 { font-family: var(--font-sans); font-weight: 800; font-size: 22px; }
.bye { margin: 0; font-family: var(--font-display); font-size: 20px; color: var(--color-primary-text); }
:lang(ta) .bye { font-family: var(--font-sans); font-weight: 700; }
.note { margin: 4px 0 0; font-size: 17px; line-height: 1.5; color: var(--color-text-muted); text-wrap: pretty; }
.acts { width: 100%; display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
.acts .btn { flex: 1 1 0; border-radius: var(--r-pill); }
@media (min-width: 480px) { .acts { flex-direction: row; } }

@keyframes pop { from { opacity: 0; transform: translateY(14px) scale(0.97); } }
@keyframes fade { from { opacity: 0; } }
@keyframes wave { 0%, 100% { rotate: 0deg; } 30% { rotate: -16deg; } 70% { rotate: 14deg; } }
@keyframes swish { 40%, 60% { opacity: 0.8; } }
@media (prefers-reduced-motion: reduce) { .leave[open], .leave::backdrop, .wave-arm, .swish { animation: none; } }
</style>

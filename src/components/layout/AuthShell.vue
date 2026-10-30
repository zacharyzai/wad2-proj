<!-- Owner: Isaac. Frame for Log in, Create account, Forgot and Reset (no app sidebar: nothing else works before you log in).
     The same top bar as Start (name, languages), a short teal band with a big Back button and the greeting, then the
     form on a card. Under it, one plain line to the other choice: "New here? Create account" or "Already have an
     account? Log in". Start (StartView.vue) tells what the app does, so this page is only about the form. -->
<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'
import PublicHeader from './PublicHeader.vue'

const props = defineProps({ active: { type: String, required: true } }) // 'login', 'signup', 'forgot' or 'reset'
const { t, locale } = useI18n()
const route = useRoute()
// Back: Log in and Create account go to Start; Forgot and Reset go to Log in.
const back = computed(() => (['login', 'signup'].includes(props.active) ? { name: 'start' } : { name: 'login' }))
</script>

<template>
  <div class="auth" :class="`lang-${locale}`">
    <PublicHeader />

    <section class="auth-band">
      <div class="auth-band-in">
        <RouterLink :to="back" class="auth-back" data-testid="auth-back"><AppIcon name="left" :size="22" :stroke="2.5" />{{ t('nav.back') }}</RouterLink>
        <div class="auth-hello">
          <h1>{{ t(`auth.hello.${active}`) }}</h1>
          <p>{{ t(`auth.hello.${active}Lead`) }}</p>
        </div>
      </div>
      <svg class="auth-wave" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
        <path class="wave-back" d="M0 70C240 20 480 10 760 46s520 64 680 16V120H0z" />
        <path class="wave-front" d="M0 92C300 52 560 60 820 86s440 30 620-6V120H0z" />
      </svg>
    </section>

    <section class="auth-sheet">
      <div class="auth-form">
        <slot />
        <p class="auth-note"><AppIcon name="lock" :size="20" /><span>{{ t('auth.privacy') }}</span></p>
      </div>

      <!-- The other choice, in words: one line and one big button. Keeps ?next= so the person still ends up where they wanted. -->
      <div v-if="active === 'login'" class="auth-switch" data-testid="auth-switch">
        <span>{{ t('auth.newHere') }}</span>
        <RouterLink :to="{ name: 'signup', query: route.query }" class="btn btn-outline">{{ t('auth.signup') }}</RouterLink>
      </div>
      <div v-else-if="active === 'signup'" class="auth-switch" data-testid="auth-switch">
        <span>{{ t('start.have') }}</span>
        <RouterLink :to="{ name: 'login', query: route.query }" class="btn btn-outline">{{ t('auth.login') }}</RouterLink>
      </div>
    </section>
  </div>
</template>

<style>
/* Not scoped on purpose: Log in, Create account, Forgot and Reset put their form inside the slot and reuse .auth-field,
   .auth-label and friends. */
.auth { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; background: var(--color-page); }

/* The band: teal like Start's, shorter, with Back and the greeting. */
.auth-band { --band: var(--color-primary); position: relative; background: var(--band); color: #fff; }
:root[data-theme='dark'] .auth-band { --band: var(--color-primary-pressed); }
.auth-band-in { max-width: 560px; margin: 0 auto; padding: 18px 20px 4px; display: flex; flex-direction: column; align-items: flex-start; gap: 16px; }
.auth-back { display: inline-flex; align-items: center; gap: 8px; min-height: var(--hit); padding: 0 18px 0 12px; border-radius: var(--r-pill); border: 1.5px solid rgba(255, 255, 255, 0.55); color: #fff; font-size: 18px; font-weight: 700; text-decoration: none; transition: background-color var(--dur) var(--ease-out); }
.auth-back:hover { background: rgba(255, 255, 255, 0.14); color: #fff; }
.auth-hello { display: flex; flex-direction: column; gap: 10px; }
.auth-hello h1 { font-family: var(--font-display); font-weight: 400; font-size: clamp(36px, 7vw, 56px); line-height: 1.05; letter-spacing: -0.015em; color: #fff; text-wrap: balance; }
.lang-ta .auth-hello h1 { font-family: var(--font-sans); font-weight: 800; font-size: clamp(28px, 5vw, 40px); line-height: 1.25; }
.auth-hello p { max-width: 34em; font-size: var(--fs-lead); line-height: 1.5; color: #e0f7f5; text-wrap: pretty; } /* 5.4:1 on teal */
.auth-wave { display: block; width: 100%; height: clamp(44px, 6vw, 90px); margin: -2px 0 -1px; } /* -1px: no hairline of teal under the wave */
.auth-wave .wave-back { fill: rgba(255, 255, 255, 0.16); }
.auth-wave .wave-front { fill: var(--color-page); }

/* The form on a card, rising into the wave; the switch line under it. */
.auth-sheet { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 22px; padding: 0 16px 48px; }
.auth-form { position: relative; width: 100%; max-width: 560px; margin-top: clamp(-40px, -3vw, -20px); display: flex; flex-direction: column; gap: 22px; padding: clamp(20px, 3vw, 32px); border-radius: var(--r-card); background: var(--color-card); border: 1px solid var(--color-border); box-shadow: var(--shadow-hover); }
.auth-switch { width: 100%; max-width: 560px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 12px 16px; font-size: 19px; font-weight: 600; }
.auth-switch .btn { min-height: 56px; padding: 0 28px; border-radius: var(--r-pill); }
@media (max-width: 575.98px) { .auth-switch { flex-direction: column; } .auth-switch .btn { width: 100%; } }

.auth-label { display: block; margin-bottom: var(--s-2); font-size: 18px; font-weight: 700; }
.auth-field {
  display: flex; align-items: center; gap: 12px; min-height: var(--h-field); padding: 0 6px 0 var(--s-4);
  border: 1.5px solid var(--color-border-strong); border-radius: var(--r-field); background: var(--color-page); color: var(--color-text-muted);
  transition: border-color var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out), background-color var(--dur) var(--ease-out);
}
.auth-field:focus-within { border-color: var(--color-primary); background: var(--color-card); color: var(--color-primary-text); box-shadow: var(--focus-ring); }
.auth-field.bad { border: 2px solid var(--color-danger); }
.auth-field input, .auth-field select { flex: 1; min-width: 0; min-height: var(--z52, 52px); border: 0; outline: 0; background: transparent; color: var(--color-text); font: 500 19px var(--font-sans); }
.auth-field input:focus, .auth-field select:focus { box-shadow: none; }
.auth-eye { width: var(--hit); height: var(--hit); display: grid; place-items: center; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--color-text-muted); }
.auth-eye:hover { background: var(--color-surface-2); color: var(--color-text); }
.auth-check { display: flex; align-items: center; gap: 12px; min-height: var(--hit); font-size: 18px; font-weight: 600; cursor: pointer; }
.auth-check input { width: 26px; height: 26px; flex: none; accent-color: var(--color-primary); }
.auth-help { display: block; margin-top: var(--s-2); font-size: var(--fs-small); line-height: 1.45; color: var(--color-text-muted); }
/* Signup: "I am a senior / a caregiver" cards. The thick border and the filled dot show the choice, not colour alone. */
.auth-roles { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--s-2); min-width: 0; }
.auth-role { display: flex; gap: var(--s-3); align-items: flex-start; padding: var(--s-3) var(--s-4); border: 1px solid var(--color-border-strong); border-radius: var(--r-field); background: var(--color-card); cursor: pointer; }
.auth-role.on { border: 2px solid var(--color-primary); padding: calc(var(--s-3) - 1px) calc(var(--s-4) - 1px); background: var(--color-tint); }
.auth-role input { width: 26px; height: 26px; flex: none; margin-top: 2px; accent-color: var(--color-primary); }
.auth-role:focus-within { box-shadow: var(--focus-ring); }
/* "Forgot your password?": a big, plain link to the reset page (Login). */
.auth-forgot-link { align-self: flex-start; display: inline-flex; align-items: center; min-height: var(--hit); font-size: 18px; font-weight: 700; color: var(--color-link); text-decoration: underline; text-underline-offset: 3px; }
/* Forgot / Reset: what happened, in a calm panel (Check your email, Password changed, Link expired). */
.auth-panel { display: flex; flex-direction: column; gap: 14px; padding: 20px; border-radius: var(--r-card); border: 1px solid var(--color-border); background: var(--color-surface-2); }
.auth-panel h2 { display: flex; align-items: center; gap: 12px; margin: 0; font-size: var(--t24, 24px); line-height: 1.25; }
.auth-panel p { margin: 0; font-size: 18px; line-height: 1.55; }
.auth-panel .tile { width: 48px; height: 48px; border-radius: 14px; }
.auth-panel-acts { display: flex; flex-direction: column; gap: 10px; }
.auth-warn { display: flex; gap: 8px; align-items: flex-start; margin-top: var(--s-2); color: var(--color-danger-text); font-size: var(--fs-small); font-weight: 600; line-height: 1.45; }
.auth-note { display: flex; gap: var(--s-2); margin: 0; font-size: var(--fs-small); line-height: 1.5; color: var(--color-text-muted); }
.auth-note .icon { flex: none; margin-top: 1px; color: var(--color-primary-text); }
</style>

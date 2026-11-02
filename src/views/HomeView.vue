<!-- Owner: Isaac. Home, kept simple for seniors: a greeting with the app's capsule (the one that waves goodbye on log out), one
     question, and three big choices that each go somewhere different: scan a medicine label, scan a bill, Ask. "Today's
     medicines" (components/home/TodayMedicines.vue) shows what is due. The last bill checked, when there is one, is one
     quiet line back to it. Phones: one column, Today's medicines under the greeting. Desktop (≥992px): the greeting and
     Today's medicines side by side, the choices in one row under them.
     The choices press in where touched and lean a little towards the mouse (CSS 3D); still with reduced motion. -->
<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { scanStore } from '../stores/scan'
import { authStore } from '../stores/auth'
import { money } from '../components/bill/lines'
import AppIcon from '../components/layout/AppIcon.vue'
import KindIcon from '../components/layout/KindIcon.vue'
import WavingCapsule from '../components/home/WavingCapsule.vue'
import TodayMedicines from '../components/home/TodayMedicines.vue'

const { t, locale } = useI18n()

const CHOICES = [
  // kind: shown as the coloured capsule or bill (KindIcon), so the two scans look like what they are.
  { key: 'med', to: { name: 'scan', query: { type: 'medication' } }, kind: 'medication', title: 'home.med.title', text: 'home.med.text' },
  { key: 'bill', to: { name: 'scan', query: { type: 'bill' } }, kind: 'bill', title: 'home.bill.title', text: 'home.bill.text' },
  { key: 'ask', to: { name: 'ask' }, icon: 'chat', title: 'pages.ask', text: 'home.ask.text' },
]

const hour = new Date().getHours()
const greet = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
// "Good afternoon, Mdm Tan!" with the name on the account (the same words Ask greets with); just the greeting without one.
const hello = computed(() => (authStore.user?.name ? t('ask.hello', { greet: t(`home.greet.${greet}`), name: authStore.user.name }) : t(`home.greet.${greet}`)))

// The bill last checked on Confirm (what the Bill page shows): one line back to it. Nothing when there isn't one.
const lastBill = computed(() => (scanStore.confirmed && scanStore.current?.type === 'bill' ? scanStore.current.bill : null))
const lastBillAbout = computed(() => {
  const bill = lastBill.value
  const date = bill?.visitDate && new Date(`${bill.visitDate}T00:00`).toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' })
  return [bill?.clinic, date].filter(Boolean).join(' · ')
})

// Press in where touched, and lean a little towards the mouse: the card tilts by --rx/--ry and sinks while data-pressed.
// (A data attribute, not a class: RouterLink owns the class list.)
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches
function lean(event, degrees) {
  const el = event.currentTarget
  const box = el.getBoundingClientRect()
  const x = (event.clientX - box.left) / box.width - 0.5
  const y = (event.clientY - box.top) / box.height - 0.5
  el.style.setProperty('--rx', `${(-y * 2 * degrees).toFixed(2)}deg`)
  el.style.setProperty('--ry', `${(x * 2 * degrees).toFixed(2)}deg`)
}
function onMove(event) {
  if (event.pointerType === 'mouse' && !still() && !('pressed' in event.currentTarget.dataset)) lean(event, 4)
}
function onDown(event) {
  if (still()) return
  event.currentTarget.dataset.pressed = ''
  lean(event, 7)
}
function onUp(event) {
  delete event.currentTarget.dataset.pressed
  if (event.pointerType === 'mouse') onMove(event)
  else rest(event)
}
function rest(event) {
  const el = event.currentTarget
  delete el.dataset.pressed
  el.style.removeProperty('--rx')
  el.style.removeProperty('--ry')
}
</script>

<template>
  <div class="page home">
    <section class="greet-panel">
      <div class="greet-words">
        <p class="greet" data-testid="home-greet">{{ hello }}</p>
        <h1 class="display">{{ t('home.title') }}</h1>
        <p class="greet-lead">{{ t('home.lead') }}</p>
      </div>
      <WavingCapsule class="capsule" />
    </section>

    <TodayMedicines class="today-card" />

    <div class="choices">
      <RouterLink
        v-for="c in CHOICES"
        :key="c.key"
        :to="c.to"
        class="go"
        :class="`go-${c.key}`"
        :data-testid="`home-${c.key}`"
        @pointermove="onMove"
        @pointerdown="onDown"
        @pointerup="onUp"
        @pointerleave="rest"
        @pointercancel="rest"
      >
        <KindIcon v-if="c.kind" :kind="c.kind" size="var(--z64, 64px)" class="go-tile" />
        <span v-else class="tile tile-lg go-tile"><AppIcon :name="c.icon" :size="30" /></span>
        <span class="go-words">
          <span class="go-title">{{ t(c.title) }}</span>
          <span class="text-muted-a11y">{{ t(c.text) }}</span>
        </span>
        <span class="chev"><AppIcon name="right" :size="22" /></span>
      </RouterLink>
    </div>

    <!-- The Bill page has no tab of its own: this is the way back to the last bill and its subsidies. -->
    <RouterLink v-if="lastBill" :to="{ name: 'bill' }" class="last-bill" data-testid="home-last-bill">
      <KindIcon kind="bill" :size="48" class="last-tile" />
      <span class="last-title">{{ t('home.lastBill') }}</span>
      <span v-if="lastBill.totalPayableCents != null" class="last-amount">{{ money(lastBill.totalPayableCents) }}</span>
      <span v-if="lastBillAbout" class="last-about">{{ lastBillAbout }}</span>
      <span class="chev"><AppIcon name="right" :size="20" /></span>
    </RouterLink>
  </div>
</template>

<style scoped src="../styles/views/HomeView.css"></style>

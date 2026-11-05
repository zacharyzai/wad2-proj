<script setup>
import { computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScanStore } from '../stores/scan'
import { useAuthStore } from '../stores/auth'
import { money } from '../components/bill/lines'
import AppIcon from '../components/layout/AppIcon.vue'
import KindIcon from '../components/layout/KindIcon.vue'
import WavingCapsule from '../components/home/WavingCapsule.vue'
import TodayMedicines from '../components/home/TodayMedicines.vue'
import CardLaunch from '../components/home/CardLaunch.vue'
import { launch, endLaunch } from '../composables/useCardLaunch'
const scanStore = useScanStore()
const authStore = useAuthStore()

const { t, locale } = useI18n()
onBeforeUnmount(endLaunch)

const CHOICES = [
  // kind: shown as the coloured capsule or bill (KindIcon), so the two scans look like what they are.
  {
    key: 'med',
    to: { name: 'scan', query: { type: 'medication' } },
    kind: 'medication',
    title: 'home.med.title',
    text: 'home.med.text',
  },
  {
    key: 'bill',
    to: { name: 'scan', query: { type: 'bill' } },
    kind: 'bill',
    title: 'home.bill.title',
    text: 'home.bill.text',
  },
  { key: 'ask', to: { name: 'ask' }, icon: 'chat', title: 'pages.ask', text: 'home.ask.text' },
]

// Each list is shown twice in a row, so the loop is seamless: when the first copy has moved out, the second is in its place.
const LABEL_LOOP = ['med-1', 'med-2', 'med-3', 'med-1', 'med-2', 'med-3']
const RECEIPT_LOOP = ['bill-1', 'bill-2', 'bill-3', 'bill-1', 'bill-2', 'bill-3']
// Each picture's real size (from its SVG), so the strips keep their shape while the pictures load instead of growing.
const SIZE = {
  'med-1': 360,
  'med-2': 360,
  'med-3': 360,
  'bill-1': 360,
  'bill-2': 420,
  'bill-3': 448,
} // height when 480 wide

const hour = new Date().getHours()
const greet = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
// "Good afternoon, Mdm Tan!" with the name on the account (the same words Ask greets with); just the greeting without one.
const hello = computed(() =>
  authStore.user?.name
    ? t('ask.hello', { greet: t(`home.greet.${greet}`), name: authStore.user.name })
    : t(`home.greet.${greet}`),
)

// The bill last checked on Confirm (what the Bill page shows): one line back to it. Nothing when there isn't one.
const lastBill = computed(() =>
  scanStore.confirmed && scanStore.current?.type === 'bill' ? scanStore.current.bill : null,
)
const lastBillAbout = computed(() => {
  const bill = lastBill.value
  const date =
    bill?.visitDate &&
    new Date(`${bill.visitDate}T00:00`).toLocaleDateString(locale.value, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  return [bill?.clinic, date].filter(Boolean).join(' · ')
})

// Press in where touched, and lean a little towards the mouse: the card tilts by --rx/--ry and sinks while data-pressed.
// (A data attribute, not a class: RouterLink owns the class list.)
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches
// Tilts a tile a few degrees towards the pointer.
function lean(event, degrees) {
  const el = event.currentTarget
  const box = el.getBoundingClientRect()
  const x = (event.clientX - box.left) / box.width - 0.5
  const y = (event.clientY - box.top) / box.height - 0.5
  el.style.setProperty('--rx', `${(-y * 2 * degrees).toFixed(2)}deg`)
  el.style.setProperty('--ry', `${(x * 2 * degrees).toFixed(2)}deg`)
}
// Tilts a tile gently as the mouse moves over it.
function onMove(event) {
  if (event.pointerType === 'mouse' && !still() && !('pressed' in event.currentTarget.dataset))
    lean(event, 4)
}
// Tilts a tile more when pressed.
function onDown(event) {
  if (still()) return
  event.currentTarget.dataset.pressed = ''
  lean(event, 7)
}
// Returns a tile to hover or rest when released.
function onUp(event) {
  delete event.currentTarget.dataset.pressed
  if (event.pointerType === 'mouse') onMove(event)
  else rest(event)
}
// Puts a tile back flat.
function rest(event) {
  const el = event.currentTarget
  delete el.dataset.pressed
  el.style.removeProperty('--rx')
  el.style.removeProperty('--ry')
}
</script>

<template>
  <div class="page home">
    <CardLaunch />

    <!-- One centred column: hello, the capsule, the question, its caption. -->
    <section class="greet-panel">
      <p class="greet" data-testid="home-greet">{{ hello }}</p>
      <WavingCapsule class="capsule" />
      <h1 class="display">{{ t('home.title') }}</h1>
      <p class="greet-lead">{{ t('home.lead') }}</p>
    </section>

    <TodayMedicines class="today-card" />

    <div class="choices">
      <RouterLink v-for="c in CHOICES" :key="c.key" v-slot="{ href, navigate }" :to="c.to" custom>
        <a
          :href="href"
          class="go"
          :class="`go-${c.key}`"
          :data-testid="`home-${c.key}`"
          @click="launch($event, c.key, navigate)"
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
          <!-- Decoration, so hidden from screen readers. After the arrow, so it gets a row of its own. -->
          <span v-if="c.key === 'med'" class="go-art labels" aria-hidden="true">
            <span class="labels-track"
              ><img
                v-for="(id, i) in LABEL_LOOP"
                :key="i"
                :src="`/samples/${id}.svg`"
                alt=""
                loading="lazy"
                decoding="async"
                width="480"
                :height="SIZE[id]"
            /></span>
          </span>
          <span v-else-if="c.key === 'bill'" class="go-art receipt" aria-hidden="true">
            <span class="receipt-slot"></span>
            <span class="receipt-paper"
              ><span class="receipt-track"
                ><img
                  v-for="(id, i) in RECEIPT_LOOP"
                  :key="i"
                  :src="`/samples/${id}.svg`"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width="480"
                  :height="SIZE[id]" /></span
            ></span>
          </span>
          <!-- Ask: a short chat that plays over and over: their question, the capsule typing, its answer. -->
          <span v-else class="go-art chat" aria-hidden="true">
            <span class="bubble mine">{{ t('home.ask.demoQ') }}</span>
            <span class="bubble theirs typing"><i></i><i></i><i></i></span>
            <span class="bubble theirs answer"
              ><span class="mini-cap"></span>{{ t('home.ask.demoA') }}</span
            >
          </span>
        </a>
      </RouterLink>
    </div>

    <!-- The Bill page has no tab of its own: this is the way back to the last bill and its subsidies. -->
    <RouterLink
      v-if="lastBill"
      :to="{ name: 'bill' }"
      class="last-bill"
      data-testid="home-last-bill"
    >
      <KindIcon kind="bill" :size="48" class="last-tile" />
      <span class="last-title">{{ t('home.lastBill') }}</span>
      <span v-if="lastBill.totalPayableCents != null" class="last-amount">{{
        money(lastBill.totalPayableCents)
      }}</span>
      <span v-if="lastBillAbout" class="last-about">{{ lastBillAbout }}</span>
      <span class="chev"><AppIcon name="right" :size="20" /></span>
    </RouterLink>
  </div>
</template>

<style scoped src="../styles/views/HomeView.css"></style>

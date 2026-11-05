<!-- Owner: Lokesh. Bill breakdown: every line of a medical bill (polyclinic, GP, dental, specialist, hospital, pharmacy...) with its category, and a tap-to-open plain explanation.
     Subsidies are checked from the account's date of birth and citizenship (no questions on this page); Back returns to where you came from. -->
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useScanStore } from '../stores/scan'
import { useAuthStore } from '../stores/auth'
import { scanSample } from '../api/client'
import BillLine from '../components/bill/BillLine.vue'
import SubsidyResults from '../components/bill/SubsidyResults.vue'
import EmptyState from '../components/layout/EmptyState.vue'
import LoadingState from '../components/layout/LoadingState.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import AppIcon from '../components/layout/AppIcon.vue'
import KindIcon from '../components/layout/KindIcon.vue'
import {
  CATEGORY_STYLE,
  SUBSIDY_STYLE,
  MEDISAVE_STYLE,
  money,
  minusMoney,
  sumCents,
  deducted,
} from '../components/bill/lines'
import { citizenshipText } from '../utils/account'
import { billGap, linesTotal, sectionsOff } from '../rules/billCheck'
const scanStore = useScanStore()
const authStore = useAuthStore()

const { t, locale } = useI18n()
const router = useRouter()

const SAMPLES = [
  { id: 'bill-1', key: 'bill1' },
  { id: 'bill-2', key: 'bill2' },
  { id: 'bill-3', key: 'bill3' },
  { id: 'bill-4', key: 'bill4' },
]

// Only a bill the user has checked on Confirm (or a built-in sample) is broken down.
const scan = computed(() =>
  scanStore.confirmed && scanStore.current?.type === 'bill' ? scanStore.current : null,
)
const bill = computed(() => scan.value?.bill)
// Lines that don't add up to the bill's total (a misread digit): the total shown is the bill's own; this says so, and where.
const gap = computed(() => (bill.value ? billGap(bill.value) : null))
const offSections = computed(() => (gap.value ? sectionsOff(bill.value) : []))
const unchecked = computed(() => !scanStore.confirmed && scanStore.current?.type === 'bill')

const loading = ref(false)
const errorCode = ref(null)
let lastSample = null

// Loads one of the built-in sample bills.
async function openSample(id) {
  lastSample = id
  loading.value = true
  errorCode.value = null
  const res = await scanSample(id)
  loading.value = false
  if (!res.ok) return (errorCode.value = res.error.code)
  // Samples are fixed, known-good data, so they don't need checking on Confirm.
  scanStore.current = res.data
  scanStore.photos = []
  scanStore.confirmed = true
  openedHere.value = true
}

// Back: a sample opened on this page closes again (back to the list of bills); otherwise return to the page before
// (usually Explain, via See full breakdown), or Home when this page was opened directly.
const openedHere = ref(false)
// Leaves the bill: back to the sample picker, or to where the user came from.
function goBack() {
  if (openedHere.value) {
    openedHere.value = false
    scanStore.current = null
    scanStore.confirmed = false
    return window.scrollTo({ top: 0 })
  }
  if (window.history.state?.back) router.back()
  else router.push({ name: 'home' })
}
// Scrolls to the top (instantly for reduced motion).
function toTop() {
  window.scrollTo({
    top: 0,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
  const h1 = document.querySelector('main h1')
  h1?.setAttribute('tabindex', '-1') // headings aren't focusable by default
  h1?.focus({ preventScroll: true })
}

// One line open at a time, so there is only ever one read-aloud player.
const openId = ref(null)
watch(bill, () => (openId.value = null))
// Opens a bill line's explanation, closing any other.
const toggle = (id) => (openId.value = openId.value === id ? null : id)

const date = computed(
  () =>
    bill.value?.visitDate &&
    new Date(`${bill.value.visitDate}T00:00`).toLocaleDateString(locale.value, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
)

const charged = computed(() =>
  (bill.value?.items ?? []).map((item, i) => {
    const category = Object.hasOwn(CATEGORY_STYLE, item.category) ? item.category : 'other'
    return {
      id: `item-${i}`,
      category,
      ...CATEGORY_STYLE[category],
      // Descriptions are copied from the bill, which is printed in English.
      name: item.description || t(`bill.category.${category}`),
      nameLang: item.description ? 'en' : null,
      tag: t(`bill.category.${category}`),
      amountCents: item.amountCents,
      text: t(`bill.explain.${category}`),
    }
  }),
)

// Most people only need the totals, GST and what comes off: each charge (every medicine, test…) is one tap away.
const showItems = ref(false)
watch(bill, () => (showItems.value = false))
const itemLines = computed(() => charged.value.filter((l) => l.category !== 'tax'))
const taxLines = computed(() => charged.value.filter((l) => l.category === 'tax'))

// A long bill (more than GROUP_AT charges, often 30+ over several pages): the charges open as one row per kind
// ("Medicine · 12 items · $84.20"), biggest first, each opening its own lines, instead of one long list. Shorter bills keep
// the plain list. The summary card names the three biggest kinds, which is often all people want to know.
const GROUP_AT = 6
const grouped = computed(() => itemLines.value.length > GROUP_AT)
const groups = computed(() => {
  const byKind = new Map()
  for (const line of itemLines.value)
    byKind.set(line.category, [...(byKind.get(line.category) ?? []), line])
  return [...byKind]
    .map(([category, lines]) => ({
      category,
      ...CATEGORY_STYLE[category],
      name: t(`bill.category.${category}`),
      lines,
      cents: sumCents(lines),
    }))
    .sort((a, b) => b.cents - a.cents)
})
const biggest = computed(() => (grouped.value ? groups.value.slice(0, 3) : []))
const openGroups = ref([])
watch(bill, () => (openGroups.value = []))
// Opens or closes one category of bill lines.
const toggleGroup = (category) =>
  (openGroups.value = openGroups.value.includes(category)
    ? openGroups.value.filter((c) => c !== category)
    : [...openGroups.value, category])

// Phones: with the charges open, "You pay" scrolls out of sight. A slim bar above the bottom tabs keeps it in view while the
// summary card is scrolled past, with a way back to it. Hidden on desktop, where the summary sits beside the list.
const summaryCard = ref(null)
const summaryPassed = ref(false)
let summaryWatch = null
watch(summaryCard, (card) => {
  summaryWatch?.disconnect()
  summaryPassed.value = false
  if (!card) return
  summaryWatch = new IntersectionObserver(
    ([entry]) => (summaryPassed.value = !entry.isIntersecting && entry.boundingClientRect.top < 0),
  )
  summaryWatch.observe(card)
})
onBeforeUnmount(() => summaryWatch?.disconnect())
const payBar = computed(() => showItems.value && summaryPassed.value)
// Scrolls to the payable summary card.
function toSummary() {
  summaryCard.value?.scrollIntoView({
    block: 'start',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
  summaryCard.value?.focus({ preventScroll: true })
}

const takenOff = computed(() => {
  const b = bill.value
  if (!b) return []
  return [
    ...b.subsidies.map((s, i) => ({
      id: `subsidy-${i}`,
      ...SUBSIDY_STYLE,
      name: t(`scheme.${s.scheme}`),
      // Already inside the net charges: shown so people see it, but without a minus (it isn't taken off again).
      tag: t(
        s.includedInItems
          ? 'bill.inLines'
          : s.scheme === 'insurance'
            ? 'bill.tag.insurance'
            : s.scheme === 'paid'
              ? 'bill.tag.paid'
              : 'bill.tag.subsidy',
      ),
      amountCents: s.amountCents,
      minus: !s.includedInItems,
      text: t(`bill.explain.scheme.${s.scheme}`),
    })),
    {
      id: 'medisave',
      ...MEDISAVE_STYLE,
      name: t('bill.medisave'),
      tag: t('bill.tag.medisave'),
      amountCents: b.medisaveCents,
      minus: true,
      text: b.medisaveCents
        ? t('bill.explain.medisave')
        : `${t('bill.explain.medisave')} ${t('bill.explain.medisaveNone')}`,
    },
  ]
})

// Subsidies are checked from the account (date of birth and citizenship, given at signup or on the Account page).
// Household income (citizens, from signup) gives the CHAS card colour.
const user = computed(() => authStore.user)
const answers = computed(() => ({
  birthYear: user.value?.dob ? Number(user.value.dob.slice(0, 4)) : null,
  residency:
    { birth: 'citizen', became: 'citizen', pr: 'pr', other: 'other' }[user.value?.citizenship] ??
    null,
  citizenSince: user.value?.citizenship === 'birth' ? 'birth' : (user.value?.citizenSince ?? null),
  income: user.value?.income ?? null,
}))

// The big amount counts up when a bill opens (a quick, visible "this is the number that matters"). Screen readers get the real amount.
const shownPay = ref(0)
let countFrame = 0
watch(
  () => bill.value?.totalPayableCents,
  (to) => {
    cancelAnimationFrame(countFrame)
    if (to == null) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return (shownPay.value = to)
    const start = performance.now()
    // One frame of the "payable" number count-up.
    const step = (now) => {
      const p = Math.min(1, (now - start) / 700)
      shownPay.value = Math.round(to * (1 - (1 - p) ** 3))
      if (p < 1) countFrame = requestAnimationFrame(step)
    }
    countFrame = requestAnimationFrame(step)
  },
  { immediate: true },
)
onBeforeUnmount(() => cancelAnimationFrame(countFrame))

// How the charges split: what you pay, what subsidies took off, what MediSave paid. Shares of the full charges, for the bar.
const split = computed(() => {
  const b = bill.value
  const charges = sumCents(b.items) || 1
  return [
    { key: 'pay', cents: b.totalPayableCents },
    { key: 'subsidy', cents: sumCents(deducted(b.subsidies)) },
    { key: 'medisave', cents: b.medisaveCents },
  ]
    .filter((part) => part.cents > 0)
    .map((part) => ({ ...part, pct: (part.cents / charges) * 100 }))
})

const summary = computed(() => [
  [
    t(
      bill.value.subsidies.some((x) => x.includedInItems)
        ? 'bill.summary.chargesNet'
        : 'bill.summary.charges',
    ),
    money(sumCents(bill.value.items)),
  ],
  [
    t(
      bill.value.subsidies.some((x) => x.scheme === 'insurance')
        ? 'bill.summary.subsidiesInsurance'
        : 'bill.summary.subsidies',
    ),
    minusMoney(sumCents(deducted(bill.value.subsidies))),
  ],
  [t('bill.summary.medisave'), minusMoney(bill.value.medisaveCents)],
])
</script>

<template>
  <div class="page">
    <div class="d-flex align-items-start gap-3">
      <button
        v-if="bill"
        type="button"
        class="back"
        :aria-label="openedHere ? t('bill.closeBill') : t('nav.back')"
        data-testid="bill-back"
        @click="goBack"
      ></button>
      <div class="page-head">
        <h1>{{ t('pages.bill') }}</h1>
        <p v-if="bill" class="lead-text">{{ t('bill.lead') }}</p>
      </div>
    </div>

    <p class="alert alert-note"><AppIcon name="info" />{{ t('bill.scope') }}</p>

    <div v-if="bill" class="cols">
      <div>
        <section
          ref="summaryCard"
          tabindex="-1"
          class="card card-result main-card rise"
          :aria-label="t('bill.summary.label')"
        >
          <span class="ring" aria-hidden="true"></span>
          <div class="d-flex align-items-center gap-3">
            <KindIcon kind="bill" class="glow" />
            <div class="d-flex flex-column min-w-0">
              <span class="clinic">{{ bill.clinic || t('pages.bill') }}</span>
              <span v-if="date" class="text-muted-a11y">{{ date }}</span>
            </div>
          </div>
          <i18n-t keypath="bill.pay" tag="h2" class="pay-title">
            <template #amount
              ><span class="hero-number"
                ><span aria-hidden="true">{{ money(shownPay) }}</span
                ><span class="visually-hidden">{{ money(bill.totalPayableCents) }}</span></span
              ></template
            >
          </i18n-t>
          <!-- Picture of the list below it (which has the words), so hidden from screen readers. -->
          <div class="split" aria-hidden="true">
            <span
              v-for="part in split"
              :key="part.key"
              class="seg"
              :class="`seg-${part.key}`"
              :style="{ flexGrow: part.pct }"
            ></span>
          </div>
          <dl class="summary-row">
            <div v-for="([label, amount], i) in summary" :key="label">
              <dt>
                <span
                  v-if="i"
                  class="swatch"
                  :class="i === 1 ? 'seg-subsidy' : 'seg-medisave'"
                  aria-hidden="true"
                ></span
                >{{ label }}
              </dt>
              <dd>{{ amount }}</dd>
            </div>
          </dl>
          <p v-if="biggest.length" class="biggest" data-testid="bill-biggest">
            <span class="biggest-label">{{ t('bill.biggest') }}</span>
            <span>
              <template v-for="(g, i) in biggest" :key="g.category"
                ><template v-if="i"> · </template>{{ g.name }}
                <strong>{{ money(g.cents) }}</strong></template
              >
            </span>
          </p>
          <span v-if="scan.source === 'sample'" class="badge badge-navy align-self-start"
            ><AppIcon name="file" :size="18" />{{ t('bill.sampleTag') }}</span
          >
        </section>

        <div v-if="gap" class="alert alert-info" role="note" data-testid="bill-gap">
          <AppIcon name="info" />
          <div class="d-flex flex-column gap-2">
            <strong>{{ t('bill.gap.title') }}</strong>
            <span>{{
              t('bill.gap.text', {
                lines: money(linesTotal(bill)),
                total: money(bill.totalPayableCents),
              })
            }}</span>
            <span v-for="s in offSections" :key="s.section">{{
              t('confirm.bill.gapWhere', { section: s.section, printed: money(s.printedCents) })
            }}</span>
            <span class="fw-normal">{{ t('bill.gap.subsidy') }}</span>
          </div>
        </div>

        <!-- What the subsidies below are based on, and where to change it (a caregiver can check with their parent's details there). -->
        <p v-if="user?.dob" class="basis" data-testid="bill-basis">
          <AppIcon name="user" :size="20" />
          <span class="d-flex flex-column">
            {{ t('bill.basis', { year: user.dob.slice(0, 4), status: citizenshipText(t, user) }) }}
            <RouterLink :to="{ name: 'account' }" class="basis-link"
              >{{ t('bill.basisChange') }}<AppIcon name="right" :size="18"
            /></RouterLink>
          </span>
        </p>
        <SubsidyResults :bill="bill" :answers="answers" />
      </div>

      <div>
        <section class="d-flex flex-column gap-3" aria-labelledby="bill-charged">
          <h2 id="bill-charged" class="section-label">{{ t('bill.charged') }}</h2>
          <button
            v-if="itemLines.length"
            type="button"
            class="btn btn-outline details-toggle"
            :aria-expanded="showItems"
            aria-controls="bill-items"
            data-testid="bill-items-toggle"
            @click="showItems = !showItems"
          >
            <AppIcon :name="showItems ? 'up' : 'down'" />{{
              t(showItems ? 'bill.hideItems' : 'bill.showItems', { n: itemLines.length })
            }}
          </button>
          <ul v-show="showItems" id="bill-items" class="lines">
            <template v-if="grouped">
              <li v-for="g in groups" :key="g.category" class="group" :class="`tone-${g.tone}`">
                <button
                  type="button"
                  class="group-btn"
                  :aria-expanded="openGroups.includes(g.category)"
                  :aria-controls="`group-${g.category}`"
                  data-testid="bill-group"
                  @click="toggleGroup(g.category)"
                >
                  <span class="group-tile"><AppIcon :name="g.icon" :size="24" /></span>
                  <span class="d-flex flex-column gap-1 flex-grow-1 min-w-0">
                    <span class="group-name">{{ g.name }}</span>
                    <span class="group-count">{{
                      t('bill.groupCount', { n: g.lines.length }, g.lines.length)
                    }}</span>
                  </span>
                  <span class="group-amount">{{ money(g.cents) }}</span>
                  <AppIcon
                    :name="openGroups.includes(g.category) ? 'up' : 'down'"
                    :size="22"
                    class="group-chev"
                  />
                </button>
                <ul
                  v-if="openGroups.includes(g.category)"
                  :id="`group-${g.category}`"
                  class="lines group-lines"
                >
                  <BillLine
                    v-for="line in g.lines"
                    :key="line.id"
                    :line="line"
                    :open="openId === line.id"
                    @toggle="toggle(line.id)"
                  />
                </ul>
              </li>
            </template>
            <template v-else>
              <BillLine
                v-for="line in itemLines"
                :key="line.id"
                :line="line"
                :open="openId === line.id"
                @toggle="toggle(line.id)"
              />
            </template>
          </ul>
          <ul v-if="taxLines.length" class="lines">
            <BillLine
              v-for="line in taxLines"
              :key="line.id"
              :line="line"
              :open="openId === line.id"
              @toggle="toggle(line.id)"
            />
          </ul>
        </section>
        <section class="d-flex flex-column gap-3" aria-labelledby="bill-off">
          <h2 id="bill-off" class="section-label">{{ t('bill.takenOff') }}</h2>
          <ul class="lines">
            <BillLine
              v-for="line in takenOff"
              :key="line.id"
              :line="line"
              :open="openId === line.id"
              @toggle="toggle(line.id)"
            />
          </ul>
        </section>
        <p class="total" data-testid="bill-total">
          <span>{{ t('bill.total') }}</span>
          <strong>{{ money(bill.totalPayableCents) }}</strong>
        </p>
        <div class="d-flex flex-column gap-3">
          <button type="button" class="btn btn-primary" data-testid="bill-done" @click="goBack">
            <AppIcon name="left" />{{ openedHere ? t('bill.closeBill') : t('nav.back') }}
          </button>
          <RouterLink :to="{ name: 'home' }" class="btn btn-secondary" data-testid="bill-home"
            ><AppIcon name="home" />{{ t('nav.home') }}</RouterLink
          >
          <RouterLink :to="{ name: 'scan', hash: '#bill' }" class="btn btn-outline"
            ><AppIcon name="scan" />{{ t('bill.another') }}</RouterLink
          >
          <button type="button" class="btn btn-ghost" data-testid="bill-top" @click="toTop">
            <AppIcon name="up" />{{ t('nav.backTop') }}
          </button>
        </div>
      </div>

      <Transition name="pay-bar">
        <div v-if="payBar" class="pay-bar" data-testid="bill-pay-bar">
          <span class="pay-bar-text"
            >{{ t('bill.total') }}<strong>{{ money(bill.totalPayableCents) }}</strong></span
          >
          <button type="button" data-testid="bill-pay-bar-top" @click="toSummary">
            <AppIcon name="up" :size="20" />{{ t('bill.toSummary') }}
          </button>
        </div>
      </Transition>
    </div>

    <div v-else-if="unchecked" class="alert alert-warning">
      <AppIcon name="alert" />
      <div class="d-flex flex-column gap-3">
        <span>{{ t('bill.unchecked.text') }}</span>
        <RouterLink :to="{ name: 'confirm' }" class="btn btn-primary btn-sm align-self-start">{{
          t('bill.unchecked.action')
        }}</RouterLink>
      </div>
    </div>

    <EmptyState v-else :title="t('bill.none.title')" :text="t('bill.none.text')" kind="bill">
      <RouterLink :to="{ name: 'scan', hash: '#bill' }" class="btn btn-primary"
        ><AppIcon name="scan" />{{ t('bill.scan') }}</RouterLink
      >
    </EmptyState>

    <!-- Samples: always offered when there's no real bill, and as "try another" while looking at a sample. -->
    <section
      v-if="!bill || scan.source === 'sample'"
      class="d-flex flex-column gap-3"
      aria-labelledby="bill-samples"
    >
      <h2 id="bill-samples" class="section-label">
        {{ bill ? t('bill.moreSamples') : t('bill.samplesTitle') }}
      </h2>
      <div class="samples" data-guide="bill-samples">
        <button
          v-for="sample in SAMPLES"
          :key="sample.id"
          type="button"
          class="card card-interactive sample"
          :disabled="loading"
          @click="openSample(sample.id)"
        >
          <img
            :src="`/samples/${sample.id}.svg`"
            alt=""
            loading="lazy"
            decoding="async"
            class="sample-thumb"
          />
          <span class="d-flex flex-column flex-grow-1">
            <span class="sample-name">{{ t(`bill.samples.${sample.key}`) }}</span>
            <span class="text-muted-a11y sample-kind">{{ t('bill.sampleTag') }}</span>
          </span>
          <AppIcon name="right" :size="22" />
        </button>
      </div>
      <LoadingState v-if="loading" />
      <ErrorBanner v-if="errorCode" :code="errorCode" retryable @retry="openSample(lastSample)" />
    </section>
  </div>
</template>

<style scoped src="../styles/views/BillView.css"></style>

<!-- Owner: Asher. From the Claude Design Explain screen (medicine card with big digits, read-aloud, quick check). All text comes from the human-checked templates in i18n, never from the AI. -->
<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { scanStore } from '../stores/scan'
import ReadAloud from '../components/explain/ReadAloud.vue'
import AppIcon from '../components/layout/AppIcon.vue'
import { billGap, linesTotal } from '../rules/billCheck'

const { t, locale } = useI18n()
const router = useRouter()

// Only a scan the user has confirmed may be explained.
const scan = scanStore.confirmed ? scanStore.current : null
if (!scan) router.replace({ name: scanStore.current ? 'confirm' : 'scan' })

const money = (cents) => '$' + (cents / 100).toFixed(2)
const minusMoney = (cents) => (cents > 0 ? '−' : '') + money(cents ?? 0) // never "−$0.00"
const sum = (xs) => xs.reduce((total, x) => total + x.amountCents, 0)
// Dose numbers always stay as digits, in every language.
const byValue = (a, b) => a - b
const TIME_ICONS = { morning: 'sunrise', afternoon: 'sun', evening: 'sunset', bedtime: 'bed' }

function medication(m) {
  const unit = (n) => t(`unit.${m.doseUnit ?? 'other'}`, n)
  const dose = { amount: m.doseAmount, unit: unit(m.doseAmount) }
  const base = { tag: t('explain.tag.medication'), icon: 'pill', name: m.name, sub: m.strength, warnings: m.warnings }

  if (m.frequencyType !== 'daily') {
    return {
      ...base,
      kind: t(`freq.${m.frequencyType ?? 'other'}`),
      title: t('explain.med.askTitle'),
      paras: [t('explain.med.askText'), m.rawInstruction && t('explain.med.labelSays', { text: m.rawInstruction })].filter(Boolean),
      q: t('explain.check.askQ'),
      options: [
        { label: t('explain.check.yes'), right: false },
        { label: t('explain.check.no'), right: true },
      ],
      right: t('explain.check.askRight'),
      wrong: t('explain.check.askWrong'),
    }
  }

  const wrongAmount = m.doseAmount > 1 ? m.doseAmount - 1 : m.doseAmount + 1
  return {
    ...base,
    title: t('explain.med.title', { ...dose, times: m.timesPerDay }, m.timesPerDay),
    paras: [
      m.timing?.length && t('explain.med.when', { list: m.timing.map((k) => t(`timing.${k}`)).join(t('explain.sep')) }),
      m.withFood && t(`explain.med.food.${m.withFood}`),
      t('explain.med.daily'),
    ].filter(Boolean),
    q: t('explain.check.medQ', { unit: unit(2) }),
    options: [m.doseAmount, wrongAmount].sort(byValue).map((n) => ({ label: `${n} ${unit(n)}`, right: n === m.doseAmount })),
    right: t('explain.check.medRight', dose),
    wrong: t('explain.check.medWrong', dose),
    // Big digits for the dose, then when and food. Always words beside the numbers and icons.
    stats: [
      { big: m.doseAmount, text: `${unit(m.doseAmount)} ${t('explain.stat.each')}` },
      { big: `${m.timesPerDay}×`, text: t('explain.stat.perDay') },
      m.withFood && { icon: 'food', text: t(`food.${m.withFood}`) },
    ].filter(Boolean),
    // All four parts of the day, so the ones to take stand out in a day strip; skipped ones are for sighted context only.
    times: m.timing?.length ? Object.keys(TIME_ICONS).map((k) => ({ key: k, icon: TIME_ICONS[k], text: t(`timing.${k}`), on: m.timing.includes(k) })) : [],
    canSchedule: true,
  }
}

function bill(b) {
  const charges = sum(b.items)
  const pay = b.totalPayableCents
  const wrongAmount = charges !== pay ? charges : pay + 1000
  const date = b.visitDate && new Date(`${b.visitDate}T00:00`).toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' })
  return {
    tag: t('explain.tag.bill'),
    icon: 'receipt',
    name: b.clinic || t('explain.tag.bill'),
    sub: date,
    title: t('explain.bill.title', { amount: money(pay) }),
    lines: [
      [t('explain.bill.charges'), money(charges)],
      [t('explain.bill.subsidies'), minusMoney(sum(b.subsidies.filter((s) => !s.includedInItems)))],
      [t('explain.bill.medisave'), minusMoney(b.medisaveCents)],
    ],
    paras: [t('explain.bill.p')],
    // Lines that don't add up to the bill's total (a misread digit): the total shown is the bill's own; say so, as Confirm and the Bill page do.
    note: billGap(b) ? t('bill.gap.text', { lines: money(linesTotal(b)), total: money(pay) }) : null,
    q: t('explain.check.billQ'),
    options: [pay, wrongAmount].sort(byValue).map((n) => ({ label: money(n), right: n === pay })),
    right: t('explain.check.billRight', { amount: money(pay) }),
    wrong: t('explain.check.billWrong', { amount: money(pay) }),
    canBreakdown: true,
  }
}

const view = computed(() => {
  if (!scan) return null
  const v = scan.type === 'medication' ? medication(scan.medication) : bill(scan.bill)
  v.options = [...v.options, { label: t('explain.check.notSure'), right: false }]
  return v
})

const speech = computed(() =>
  view.value ? [view.value.title, ...(view.value.lines ?? []).map((line) => line.join(' ')), view.value.note, ...view.value.paras].filter(Boolean).join(' ') : '',
)

const picked = ref(null)
watch(locale, () => (picked.value = null))
</script>

<template>
  <div v-if="view" class="page">
    <div class="d-flex align-items-center gap-3 flex-wrap">
      <RouterLink :to="{ name: 'confirm' }" class="back" :aria-label="t('nav.back')"></RouterLink>
      <span class="badge badge-success"><AppIcon name="checkCircle" :size="18" />{{ t('explain.checked') }}</span>
      <span v-if="view.kind" class="badge badge-warning"><AppIcon name="alert" :size="18" />{{ view.kind }}</span>
    </div>

    <div class="cols">
      <div>
        <section class="card card-result main-card rise">
          <span class="ring" aria-hidden="true"></span>
          <div class="d-flex align-items-center gap-3">
            <span class="tile tile-lg glow"><AppIcon :name="view.icon" :size="28" /></span>
            <div class="d-flex flex-column min-w-0">
              <span class="med-name" :class="{ long: view.lines }">{{ view.name }}</span>
              <span v-if="view.sub" class="text-muted-a11y">{{ view.sub }}</span>
            </div>
          </div>

          <!-- Bill: the amount inside the sentence is the big hero number. -->
          <i18n-t v-if="view.lines" keypath="explain.bill.title" tag="h1" class="explain-title">
            <template #amount><span class="hero-number">{{ money(scan.bill.totalPayableCents) }}</span></template>
          </i18n-t>
          <h1 v-else class="explain-title">{{ view.title }}</h1>

          <dl v-if="view.lines" class="summary-row">
            <div v-for="[label, amount] in view.lines" :key="label">
              <dt>{{ label }}</dt>
              <dd>{{ amount }}</dd>
            </div>
          </dl>

          <p v-if="view.note" class="alert alert-info m-0" role="note" data-testid="explain-gap">
            <AppIcon name="info" />
            <span><strong class="d-block">{{ t('bill.gap.title') }}</strong>{{ view.note }}</span>
          </p>

          <div v-if="view.stats" class="stats stagger">
            <div v-for="stat in view.stats" :key="stat.text" class="stat">
              <span v-if="stat.icon" class="stat-icon"><AppIcon :name="stat.icon" :size="44" /></span>
              <span v-else class="stat-big">{{ stat.big }}</span>
              <span class="stat-text">{{ stat.text }}</span>
            </div>
          </div>
          <ol v-if="view.times?.length" class="day-strip">
            <li v-for="time in view.times" :key="time.key" class="slot" :class="{ on: time.on }" :aria-hidden="!time.on">
              <AppIcon :name="time.icon" :size="26" />
              <span>{{ time.text }}</span>
              <span v-if="time.on" class="slot-check" aria-hidden="true"><AppIcon name="check" :size="14" :stroke="3" /></span>
            </li>
          </ol>

          <div class="body">
            <p v-for="p in view.paras" :key="p">{{ p }}</p>
          </div>
        </section>

        <div v-if="view.warnings?.length" class="alert alert-warning">
          <AppIcon name="info" />
          <div class="d-flex flex-column gap-1">
            <strong>{{ t('explain.med.warnings') }}</strong>
            <ul class="mb-0 ps-3" lang="en">
              <li v-for="w in view.warnings" :key="w">{{ w }}</li>
            </ul>
          </div>
        </div>
      </div>

      <div>
        <ReadAloud :text="speech" />

        <section class="card d-flex flex-column gap-3" :aria-label="t('explain.check.title')">
          <span class="section-label">{{ t('explain.check.title') }}</span>
          <h2 class="question">{{ view.q }}</h2>
          <div class="answers">
            <button
              v-for="(option, i) in view.options"
              :key="option.label"
              type="button"
              class="answer"
              :class="{ right: picked === i && option.right, wrong: picked === i && !option.right }"
              :aria-pressed="picked === i"
              @click="picked = i"
            >
              <span class="letter" aria-hidden="true">
                <AppIcon v-if="picked === i && option.right" name="check" :size="20" :stroke="3" />
                <template v-else>{{ 'ABC'[i] }}</template>
              </span>
              <span class="flex-grow-1">{{ option.label }}</span>
            </button>
          </div>
          <div role="status">
            <p v-if="picked !== null" class="feedback" :class="view.options[picked].right ? 'right' : 'wrong'">
              <AppIcon :name="view.options[picked].right ? 'checkCircle' : 'info'" :size="20" />
              {{ view.options[picked].right ? view.right : view.wrong }}
            </p>
          </div>
        </section>

        <div class="d-flex flex-column gap-3">
          <RouterLink v-if="view.canSchedule" :to="{ name: 'schedule' }" class="btn btn-primary"><AppIcon name="calendar" />{{ t('explain.add') }}</RouterLink>
          <RouterLink v-if="scan.type === 'medication'" :to="{ name: 'ask' }" class="btn btn-secondary"><AppIcon name="chat" />{{ t('explain.ask') }}</RouterLink>
          <RouterLink v-if="view.canBreakdown" :to="{ name: 'bill' }" class="btn btn-primary"><AppIcon name="receipt" />{{ t('explain.bill.breakdown') }}</RouterLink>
          <RouterLink :to="{ name: scan.type === 'bill' ? 'bill-scan' : 'scan' }" :class="view.canSchedule || view.canBreakdown ? 'btn btn-ghost' : 'btn btn-primary'"><AppIcon name="scan" />{{ t('explain.another') }}</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/views/ExplainView.css"></style>

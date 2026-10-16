<!-- Owner: Asher. First version from wireframe 1d, revamped after 1a/1b (big headline first, then cards). All text comes from the human-checked templates in i18n, never from the AI. -->
<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { scanStore } from '../stores/scan'
import ReadAloud from '../components/explain/ReadAloud.vue'

const { t, locale } = useI18n()
const router = useRouter()

// Only a scan the user has confirmed may be explained.
const scan = scanStore.confirmed ? scanStore.current : null
if (!scan) router.replace({ name: scanStore.current ? 'confirm' : 'scan' })

const money = (cents) => '$' + (cents / 100).toFixed(2)
const sum = (xs) => xs.reduce((total, x) => total + x.amountCents, 0)
// Dose numbers always stay as digits, in every language.
const byValue = (a, b) => a - b

function medication(m) {
  const unit = (n) => t(`unit.${m.doseUnit ?? 'other'}`, n)
  const dose = { amount: m.doseAmount, unit: unit(m.doseAmount) }
  const base = { tag: t('explain.tag.medication'), name: [m.name, m.strength].filter(Boolean).join(' '), warnings: m.warnings }

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
    // Card chips (1a): orange = amount, teal = when, green = food. Always words, never colour alone.
    chips: [
      { text: `${m.doseAmount} ${unit(m.doseAmount)}`, cls: 'tag-amber' },
      ...(m.timing ?? []).map((k) => ({ text: t(`timing.${k}`), cls: 'tag-teal' })),
      m.withFood && { text: t(`food.${m.withFood}`), cls: 'tag-green' },
    ].filter(Boolean),
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
    name: [b.clinic, date].filter(Boolean).join(' · '),
    title: t('explain.bill.title', { amount: money(pay) }),
    lines: [
      [t('explain.bill.charges'), money(charges)],
      [t('explain.bill.subsidies'), '−' + money(sum(b.subsidies))],
      [t('explain.bill.medisave'), '−' + money(b.medisaveCents)],
    ],
    paras: [t('explain.bill.p')],
    q: t('explain.check.billQ'),
    options: [pay, wrongAmount].sort(byValue).map((n) => ({ label: money(n), right: n === pay })),
    right: t('explain.check.billRight', { amount: money(pay) }),
    wrong: t('explain.check.billWrong', { amount: money(pay) }),
  }
}

const view = computed(() => {
  if (!scan) return null
  const v = scan.type === 'medication' ? medication(scan.medication) : bill(scan.bill)
  v.options = [...v.options, { label: t('explain.check.notSure'), right: false }]
  return v
})

const speech = computed(() =>
  view.value ? [view.value.title, ...(view.value.lines ?? []).map((line) => line.join(' ')), ...view.value.paras].join(' ') : '',
)

const picked = ref(null)
watch(locale, () => (picked.value = null))
</script>

<template>
  <div v-if="view" class="d-flex flex-column gap-4">
    <div class="d-flex align-items-start gap-3">
      <RouterLink :to="{ name: 'confirm' }" class="back" :aria-label="t('nav.back')"></RouterLink>
      <div class="d-flex flex-column gap-2 min-w-0">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <span class="tag">{{ view.tag }}</span>
          <span v-if="view.kind" class="tag tag-amber">{{ view.kind }}</span>
          <span v-if="!view.chips" class="lead-lg fw-bold text-soft">{{ view.name }}</span>
        </div>
        <h1 class="h-explain">{{ view.title }}</h1>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-lg-5 order-lg-last">
        <div class="stick"><ReadAloud :text="speech" /></div>
      </div>

      <div class="col-lg-7 d-flex flex-column gap-4">
        <div v-if="view.chips" class="box d-flex align-items-center gap-3">
          <span class="pill-icon" aria-hidden="true"></span>
          <div class="d-flex flex-column gap-2 min-w-0">
            <span class="med-name">{{ view.name }}</span>
            <div class="d-flex flex-wrap gap-2">
              <span v-for="chip in view.chips" :key="chip.text" class="tag" :class="chip.cls">{{ chip.text }}</span>
            </div>
          </div>
        </div>

        <div v-if="view.lines" class="box d-flex flex-column gap-3">
          <span class="eyebrow">{{ view.tag }}</span>
          <dl class="lines">
            <template v-for="[label, amount] in view.lines" :key="label">
              <dt>{{ label }}</dt>
              <dd>{{ amount }}</dd>
            </template>
            <dt class="pay">{{ t('explain.bill.pay') }}</dt>
            <dd class="pay">{{ money(scan.bill.totalPayableCents) }}</dd>
          </dl>
        </div>

        <div class="body d-flex flex-column gap-3">
          <p v-for="p in view.paras" :key="p">{{ p }}</p>
        </div>

        <div v-if="view.warnings?.length" class="box">
          <h2 class="h-sec mb-2">{{ t('explain.med.warnings') }}</h2>
          <ul class="mb-0" lang="en">
            <li v-for="w in view.warnings" :key="w">{{ w }}</li>
          </ul>
        </div>

        <section class="box soft d-flex flex-column gap-3" :aria-label="t('explain.check.title')">
          <span class="fw-bold text-soft">{{ t('explain.check.title') }}</span>
          <div class="question">{{ view.q }}</div>
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
              <span v-if="picked === i && option.right" aria-hidden="true">✓ </span>{{ option.label }}
            </button>
          </div>
          <div role="status">
            <div v-if="picked !== null" class="feedback" :class="view.options[picked].right ? 'right' : 'wrong'">
              {{ view.options[picked].right ? view.right : view.wrong }}
            </div>
          </div>
        </section>

        <div class="acts">
          <RouterLink v-if="view.canSchedule" :to="{ name: 'schedule' }" class="btn-main">{{ t('explain.add') }}</RouterLink>
          <RouterLink v-if="scan.type === 'medication'" :to="{ name: 'ask' }" class="btn-alt">{{ t('explain.ask') }}</RouterLink>
          <RouterLink :to="{ name: 'scan', query: { type: scan.type } }" :class="view.canSchedule ? 'btn-alt' : 'btn-main'">{{ t('explain.another') }}</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.h-explain { font-size: 28px; line-height: 1.25; font-weight: 800; letter-spacing: -0.01em; }
.min-w-0 { min-width: 0; }
.med-name { font-size: 24px; font-weight: 700; line-height: 1.25; }
/* Stand-in pill drawing until each medicine has its own photo (1c note). */
.pill-icon { flex: none; width: 56px; height: 56px; border: 2px solid var(--teal); border-radius: 14px; background: radial-gradient(circle, var(--teal) 0 9px, transparent 10px); }
@media (min-width: 768px) { .h-explain { font-size: 34px; } }
@media (min-width: 992px) { .h-explain { font-size: 38px; } }
.body { font-size: 22px; line-height: 1.5; max-width: 38em; }
.lines { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 0; margin: 0; font-size: 20px; }
.lines dd { margin: 0; padding-left: 16px; text-align: right; font-variant-numeric: tabular-nums; }
.lines dt { color: var(--muted); font-weight: 400; }
.lines .pay { padding-top: 10px; border-top: 2px dashed var(--line-strong); font-weight: 800; font-size: 26px; color: var(--ink); }
dd.pay { color: var(--teal-dark); }
.question { font-size: 24px; font-weight: 700; line-height: 1.3; }
.answers { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
@media (min-width: 576px) { .answers { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.answer { min-height: 60px; padding: 8px 16px; border: 2px solid var(--line-strong); border-radius: 14px; background: var(--surface); color: var(--ink); font-size: 20px; font-weight: 700; line-height: 1.25; }
.answer.right { border: 3px solid var(--green); background: var(--green-bg); color: var(--green-ink); }
.answer.wrong { border: 3px solid var(--amber); background: var(--amber-soft); color: var(--amber-ink); }
.feedback { padding: 12px 16px; border: 2px solid; border-radius: 10px; background: var(--surface); font-weight: 700; }
.feedback.right { border-color: var(--green); color: var(--green-ink); }
.feedback.wrong { border-color: var(--amber); color: var(--amber-ink); }
</style>

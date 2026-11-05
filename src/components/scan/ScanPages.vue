<!-- Owner: Asher (moved here from ScanView when merging into the split Scan screens, declared in README.txt). Scan, a bill
     photographed page by page: the pages so far, each with its own check, and one question: "Does this bill have another
     page?". ScanView keeps the pages and does the work; every button is an emit. -->
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '../layout/AppIcon.vue'
import Spinner from '../layout/Spinner.vue'

const props = defineProps({
  shots: { type: Array, required: true }, // [{ id, src, problem: 'checking' | 'dark' | 'blurry' | 'glare' | null, anyway }]
  max: { type: Number, required: true }, // most pages a scan takes
  cameraBlocked: { type: Boolean, default: false },
  askThrow: { type: Boolean, default: false }, // Cancel (or leaving) with 2+ pages asks before throwing them away
})
const emit = defineEmits(['retake', 'anyway', 'remove', 'add', 'done', 'cancel', 'keep', 'throw'])
const { t, locale } = useI18n()

const shotBad = (s) => s.problem !== null && s.problem !== 'checking' && !s.anyway
const badPages = computed(() => props.shots.flatMap((s, i) => (shotBad(s) ? [i + 1] : [])))
const checking = computed(() => props.shots.some((s) => s.problem === 'checking'))
const full = computed(() => props.shots.length >= props.max)
const badList = computed(() =>
  new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(badPages.value.map(String)),
)

const title = ref(null)
const throwBox = ref(null)
// After each photo (or a removed page) focus goes to the heading, so a screen reader hears the pages again.
async function focusTitle() {
  await nextTick()
  title.value?.focus()
}
defineExpose({ focusTitle })
watch(
  () => props.askThrow,
  async (open) => {
    if (!open) return
    await nextTick()
    throwBox.value?.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
    throwBox.value?.querySelector('button')?.focus({ preventScroll: true })
  },
)
</script>

<template>
  <div class="page rise" data-testid="scan-pages">
    <div class="page-head">
      <h1 ref="title" tabindex="-1">{{ t('scan.pages.title') }}</h1>
      <p class="lead-text">{{ t('scan.pages.count', { n: shots.length, max }) }}</p>
    </div>
    <div class="cols">
      <ol class="shots" :aria-label="t('scan.pages.title')">
        <li
          v-for="(s, i) in shots"
          :key="s.id"
          class="card shot"
          :class="{ bad: shotBad(s) }"
          data-testid="scan-page"
        >
          <span class="shot-head">
            {{ t('scan.pages.page', { n: i + 1 }) }}
            <Spinner v-if="s.problem === 'checking'" :size="24" />
            <AppIcon v-else-if="!shotBad(s)" name="checkCircle" :size="24" class="shot-ok" />
            <AppIcon v-else name="alert" :size="24" class="shot-warn" />
          </span>
          <img
            :src="s.src"
            :alt="t('scan.dz.pageAlt', { n: i + 1, total: shots.length })"
            class="shot-img"
          />
          <p
            class="shot-state"
            :class="{ warn: shotBad(s) }"
            role="status"
            data-testid="scan-page-state"
          >
            {{
              s.problem === 'checking'
                ? t('scan.pages.checking')
                : shotBad(s)
                  ? t(`scan.pages.problem.${s.problem}`)
                  : t('scan.pages.ok')
            }}
          </p>
          <div class="shot-acts">
            <button
              type="button"
              class="btn btn-sm"
              :class="shotBad(s) ? 'btn-primary' : 'btn-secondary'"
              :aria-label="t('scan.pages.retakeN', { n: i + 1 })"
              data-testid="scan-page-retake"
              @click="emit('retake', i)"
            >
              <AppIcon name="camera" :size="20" />{{ t('scan.pages.retake') }}
            </button>
            <button
              v-if="shotBad(s)"
              type="button"
              class="btn btn-ghost btn-sm"
              :aria-label="t('scan.pages.anywayN', { n: i + 1 })"
              data-testid="scan-page-anyway"
              @click="emit('anyway', i)"
            >
              {{ t('scan.pages.anyway') }}
            </button>
            <button
              v-else
              type="button"
              class="btn btn-ghost btn-sm"
              :aria-label="t('scan.pages.removeN', { n: i + 1 })"
              data-testid="scan-page-remove"
              @click="emit('remove', i)"
            >
              <AppIcon name="x" :size="20" />{{ t('scan.pages.remove') }}
            </button>
          </div>
        </li>
      </ol>

      <section class="card d-flex flex-column gap-3 more-card" aria-labelledby="more-q">
        <p v-if="cameraBlocked" class="alert alert-warning m-0" role="alert">
          <AppIcon name="alert" />{{ t('scan.cameraBlocked') }}
        </p>
        <template v-if="!full">
          <h2 id="more-q" class="more-q">{{ t('scan.pages.more') }}</h2>
          <button
            type="button"
            class="btn btn-primary"
            data-testid="scan-add-page"
            @click="emit('add')"
          >
            <AppIcon name="camera" />{{ t('scan.pages.add') }}
          </button>
        </template>
        <h2 v-else id="more-q" class="more-q">{{ t('scan.pages.full', { max }) }}</h2>
        <button
          type="button"
          class="btn"
          :class="full ? 'btn-primary' : 'btn-outline'"
          :disabled="badPages.length > 0 || checking"
          :aria-describedby="badPages.length ? 'fix-first' : null"
          data-testid="scan-pages-done"
          @click="emit('done')"
        >
          <AppIcon name="check" />{{ t('scan.pages.done') }}
        </button>
        <p v-if="badPages.length" id="fix-first" class="fix-first">
          {{ t('scan.pages.fixFirst', { pages: badList }) }}
        </p>
        <p class="privacy"><AppIcon name="receipt" :size="20" />{{ t('scan.pages.tip') }}</p>
        <div
          v-if="askThrow"
          ref="throwBox"
          class="alert alert-warning flex-column"
          role="alertdialog"
          aria-labelledby="throw-q"
          aria-describedby="throw-text"
          data-testid="scan-pages-throw"
        >
          <strong id="throw-q">{{ t('scan.pages.throw.title', { n: shots.length }) }}</strong>
          <span id="throw-text">{{ t('scan.pages.throw.text') }}</span>
          <div class="d-flex flex-column flex-sm-row gap-3">
            <button
              type="button"
              class="btn btn-primary"
              data-testid="scan-pages-keep"
              @click="emit('keep')"
            >
              {{ t('scan.pages.throw.keep') }}
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              data-testid="scan-pages-throw-yes"
              @click="emit('throw')"
            >
              {{ t('scan.pages.throw.yes') }}
            </button>
          </div>
        </div>
        <button
          v-else
          type="button"
          class="btn btn-ghost"
          data-testid="scan-pages-cancel"
          @click="emit('cancel')"
        >
          <AppIcon name="x" />{{ t('scan.cancel') }}
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped src="../../styles/components/ScanPages.css"></style>

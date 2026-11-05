<!-- Scan, when it didn't work: what went wrong (read aloud on request),
     tips or the photo, and what to do next. A bill scanned as a label (or the other way round) is a question instead:
     "Was this meant to be a bill?". Every button is an emit; ScanView does the work. -->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CHECK_ERRORS } from '../../utils/photoCheck'
import AppIcon from '../layout/AppIcon.vue'
import KindIcon from '../layout/KindIcon.vue'
import ReadAloud from '../explain/ReadAloud.vue'

const props = defineProps({
  code: { type: String, required: true }, // the error code
  type: { type: String, required: true }, // what they said it is: 'medication' | 'bill'
  photo: { type: String, default: null }, // the first page, kept for Try again
})
const emit = defineEmits([
  'retake',
  'upload',
  'anyway',
  'examples',
  'retry',
  'read-as',
  'not-other',
])

// A new photo can fix these; anything else is on our side, so the same photo is kept for "Try again".
// PHOTO_*: we looked at the photo on this device and can say why it won't read (utils/photoCheck.js). "Scan it anyway" skips that.
const PHOTO_ERRORS = [
  'UNREADABLE_IMAGE',
  'IMAGE_TOO_LARGE',
  'BAD_REQUEST',
  'UNSUPPORTED_FILE',
  ...Object.values(CHECK_ERRORS),
]
const TIPS = [
  { key: 'light', icon: 'sun' },
  { key: 'flat', icon: 'scan' },
  { key: 'whole', icon: 'zoom' },
]
// A bill scanned as a medicine label (or a label as a bill): Yes reads the same covered photo as the other kind (no
// retaking); No says it can't be read as what they chose (MISMATCH).
const OTHER_KIND = { LOOKS_LIKE_BILL: 'bill', LOOKS_LIKE_LABEL: 'medication' }

const { t } = useI18n()
const photoError = computed(() => PHOTO_ERRORS.includes(props.code))
const checkFailed = computed(() => Object.values(CHECK_ERRORS).includes(props.code))
// A clear photo of the wrong document: say so, keep the photo, no lighting tips. MISMATCH = they said it isn't the other kind either.
const wrongDoc = computed(() => props.code === 'WRONG_DOCUMENT' || props.code === 'MISMATCH')
const wrongDocKey = computed(() =>
  props.code === 'MISMATCH' ? `scan.mismatch.${props.type}` : `scan.wrongDoc.${props.type}`,
)
const otherKind = computed(() => OTHER_KIND[props.code] ?? null)

// What the screen says, in one place: shown, and read aloud on request (seniors with low vision can hear it).
const title = computed(() =>
  otherKind.value
    ? t(`scan.other.${otherKind.value}.title`)
    : wrongDoc.value
      ? t(`${wrongDocKey.value}.title`)
      : t(`errors.${props.code}`),
)
const text = computed(() => {
  if (otherKind.value) return t(`scan.other.${otherKind.value}.question`)
  if (wrongDoc.value) return t(`${wrongDocKey.value}.text`)
  if (photoError.value) return t('scan.photoHint')
  return props.photo ? t('scan.photoKept') : ''
})

// The button that was pressed is gone, so keyboard focus fell to the page: start it again here, at what went wrong.
const heading = ref(null)
onMounted(
  () =>
    (document.activeElement === document.body || !document.activeElement) && heading.value?.focus(),
)
</script>

<template>
  <div class="cols rise">
    <div>
      <!-- A question, not an error: calm tile, no "Error" badge. -->
      <KindIcon v-if="otherKind" :kind="otherKind" :size="88" />
      <template v-else>
        <span class="tile tile-warning err-tile"><AppIcon name="camera" :size="42" /></span>
        <span class="badge badge-warning align-self-start"
          ><AppIcon name="alert" :size="18" />{{ t('scan.errorTag') }}</span
        >
      </template>
      <div role="alert" class="d-flex flex-column gap-3">
        <h1 ref="heading" tabindex="-1">{{ title }}</h1>
        <p v-if="text" class="lead-text" :data-testid="otherKind ? 'scan-other-question' : null">
          {{ text }}
        </p>
      </div>
      <ReadAloud :text="`${title}. ${text}`" />
    </div>
    <div>
      <ul v-if="photoError" class="card tips">
        <li v-for="tip in TIPS" :key="tip.key">
          <span class="tile tile-soft"><AppIcon :name="tip.icon" :size="22" /></span>
          <span
            ><strong>{{ t(`scan.tips.${tip.key}.title`) }}.</strong>
            {{ t(`scan.tips.${tip.key}.text`) }}</span
          >
        </li>
      </ul>
      <img v-else-if="photo" :src="photo" :alt="t('scan.yourPhoto')" class="photo scan-preview" />
      <template v-if="otherKind">
        <button
          type="button"
          class="btn btn-primary"
          data-testid="scan-other-yes"
          @click="emit('read-as', otherKind)"
        >
          <AppIcon name="check" />{{ t(`scan.other.${otherKind}.yes`) }}
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          data-testid="scan-other-no"
          @click="emit('not-other')"
        >
          <AppIcon name="x" />{{ t(`scan.other.${otherKind}.no`) }}
        </button>
      </template>
      <template v-else-if="photoError || wrongDoc">
        <button type="button" class="btn btn-primary" @click="emit('retake')">
          <AppIcon name="camera" />{{ t('scan.retake') }}
        </button>
        <button type="button" class="btn btn-secondary" @click="emit('upload')">
          <AppIcon name="upload" />{{ t('scan.uploadOther') }}
        </button>
        <button
          v-if="checkFailed"
          type="button"
          class="btn btn-ghost"
          data-testid="scan-anyway"
          @click="emit('anyway')"
        >
          <AppIcon name="scan" />{{ t('scan.anyway') }}
        </button>
        <button v-if="wrongDoc" type="button" class="btn btn-ghost" @click="emit('examples')">
          <AppIcon name="sparkles" />{{ t('scan.useSample') }}
        </button>
      </template>
      <template v-else>
        <button type="button" class="btn btn-primary" @click="emit('retry')">
          <AppIcon name="replay" />{{ t('scan.tryAgain') }}
        </button>
        <button type="button" class="btn btn-secondary" @click="emit('examples')">
          <AppIcon name="sparkles" />{{ t('scan.useSample') }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped src="../../styles/components/ScanProblem.css"></style>

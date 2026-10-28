<!-- Owner: Asher. From the Claude Design Scan screens: choose, camera/upload, samples, processing and unclear-photo states. -->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { scanImage, scanSample } from '../api/client'
import { redactImage, warmUp } from '../utils/redact'
import { scanStore } from '../stores/scan'
import AppIcon from '../components/layout/AppIcon.vue'
import LoadingState from '../components/layout/LoadingState.vue'
import UploadDropzone from '../components/scan/UploadDropzone.vue'
import ReadAloud from '../components/explain/ReadAloud.vue'

const SAMPLES = [
  { id: 'med-1', type: 'medication', key: 'med1' },
  { id: 'med-2', type: 'medication', key: 'med2' },
  { id: 'med-3', type: 'medication', key: 'med3' },
  { id: 'bill-1', type: 'bill', key: 'bill1' },
]
// A new photo can fix these; anything else is on our side, so the same photo is kept for "Try again".
const PHOTO_ERRORS = ['UNREADABLE_IMAGE', 'IMAGE_TOO_LARGE', 'BAD_REQUEST', 'UNSUPPORTED_FILE']
const MAX_SIDE = 1600

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const type = computed(() => route.meta.scanType ?? 'medication') // /scan: labels; /bill/scan: bills
const samples = computed(() => SAMPLES.filter((s) => s.type === type.value))

const state = ref('idle') // idle | loading | error
const covering = ref(false) // loading, step 1: blacking out personal details on this phone
// The photo shown while it is covered, so people watch their details being blacked out: { original, covered }.
const coverView = ref(null)
const REVEAL_MS = 1100 // matches the cover-wipe animation in ScanView.css
const readingType = ref(type.value)
const errorCode = ref(null)
const photo = ref(null)
const camera = ref(null)
const upload = ref(null)
let lastRequest = null
let run = 0 // bumped by Cancel so a late reply is ignored

// Keeps the upload well under the 4 MB API limit (contract asks for about 1 MB).
function toJpeg(source, width, height) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8)
}

// An <img> decodes everything the browser can show (JPEG, PNG, WebP, SVG, …) and applies photo rotation;
// createImageBitmap can't read SVG.
function loadImage(file) {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

async function compress(file) {
  const img = await loadImage(file)
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('Image has no size')
  return toJpeg(img, img.naturalWidth, img.naturalHeight)
}

// Live camera in the frame box (wireframe 1b). Laptops ignore `capture` on file inputs, so this is the only way to reach their webcam.
const video = ref(null)
const stream = ref(null)
const cameraBlocked = ref(false)
// Until the first frame arrives the video is 0×0, and capturing would send an empty image.
const cameraReady = ref(false)

async function startCamera() {
  cameraBlocked.value = false
  // No camera API (e.g. plain http on a phone): the native camera via the file input still works.
  if (!navigator.mediaDevices?.getUserMedia) return camera.value.click()
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false })
  } catch {
    cameraBlocked.value = true // permission denied or no camera
    return
  }
  video.value.srcObject = stream.value
}

function stopCamera() {
  stream.value?.getTracks().forEach((track) => track.stop())
  stream.value = null
  cameraReady.value = false
}

function capture() {
  photo.value = toJpeg(video.value, video.value.videoWidth, video.value.videoHeight)
  stopCamera()
  coverAndSend(type.value)
}

async function retake() {
  state.value = 'idle'
  await nextTick() // the <video> only exists on the idle screen
  startCamera()
}

onBeforeUnmount(stopCamera)

async function send(docType, request) {
  const id = ++run
  lastRequest = { docType, request }
  readingType.value = docType
  state.value = 'loading'
  const res = await request()
  if (id !== run) return
  if (!res.ok) {
    errorCode.value = res.error.code
    state.value = 'error'
    return
  }
  scanStore.current = res.data
  scanStore.photo = photo.value
  scanStore.confirmed = false
  router.push({ name: 'confirm' })
}

function onFile(event) {
  const file = event.target.files[0]
  event.target.value = '' // lets the same file be picked again
  if (file) useFile(file)
}

async function useFile(file) {
  // H1: shrinking a big photo takes about a second on old phones; show that we're working, so nobody taps again.
  coverView.value = null
  readingType.value = type.value
  covering.value = true
  state.value = 'loading'
  try {
    photo.value = await compress(file)
  } catch {
    // The browser couldn't open the file (e.g. HEIC on a laptop, or not an image), so the server was never asked.
    covering.value = false
    photo.value = null
    errorCode.value = 'UNSUPPORTED_FILE'
    state.value = 'error'
    return
  }
  coverAndSend(type.value)
}

// Zachary: personal details are blacked out on this phone first (src/utils/redact.js), and only the covered photo is sent.
// If covering fails, nothing is sent. The covered photo is also what Confirm shows, so the user sees exactly what was sent.
// e2e tests swap in a fake via window.__redactForTests (e2e/helpers/mockImageScan.js); real covering needs the reader download.
let coverDocType = null
async function coverAndSend(docType) {
  const id = ++run
  coverDocType = docType
  readingType.value = docType
  covering.value = true
  state.value = 'loading'
  coverView.value = { original: photo.value, covered: null }
  let covered = null
  try {
    covered = await (window.__redactForTests ?? redactImage)(photo.value)
  } catch {
    // Reader could not load (offline, very old phone) or crashed: fail closed.
  }
  if (id !== run) return // cancelled
  if (!covered || !covered.keep.length) {
    covering.value = false
    // Nothing that looks like a label or bill was found: the covered photo would be all black, so don't send it.
    errorCode.value = covered ? 'UNREADABLE_IMAGE' : 'COVER_FAILED'
    state.value = 'error'
    return
  }
  photo.value = covered.dataUrl
  coverView.value = { ...coverView.value, covered: covered.dataUrl }
  // Let the blacked-out version wipe in before reading starts (shorter with reduced motion: there is no wipe).
  await new Promise((done) => setTimeout(done, matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : REVEAL_MS))
  if (id !== run) return
  covering.value = false
  send(docType, () => scanImage(docType, photo.value))
}

function trySample(sample) {
  // H6: the sample's picture goes to Confirm too, so there is something to check the fields against.
  photo.value = `/samples/${sample.id}.svg`
  coverView.value = null
  send(sample.type, () => scanSample(sample.id))
}

function retry() {
  if (errorCode.value === 'COVER_FAILED') return coverAndSend(coverDocType)
  send(lastRequest.docType, lastRequest.request)
}

function cancel() {
  run++
  covering.value = false
  state.value = 'idle'
}

const photoError = computed(() => PHOTO_ERRORS.includes(errorCode.value))
// A clear photo of the wrong document: say so, keep the photo, no lighting tips. MISMATCH = they said it isn't the other kind either.
const wrongDoc = computed(() => errorCode.value === 'WRONG_DOCUMENT' || errorCode.value === 'MISMATCH')
const wrongDocKey = computed(() => (errorCode.value === 'MISMATCH' ? `scan.mismatch.${type.value}` : `scan.wrongDoc.${type.value}`))

// A bill scanned as a medicine label (or a label as a bill): ask "Was this meant to be a bill?".
// Yes reads the same covered photo as the other kind (no retaking); No says it can't be read as what they chose.
const OTHER_KIND = { LOOKS_LIKE_BILL: 'bill', LOOKS_LIKE_LABEL: 'medication' }
const otherKind = computed(() => OTHER_KIND[errorCode.value] ?? null)
function readAsOther() {
  const kind = otherKind.value
  send(kind, () => scanImage(kind, photo.value))
}
function notOther() {
  errorCode.value = 'MISMATCH'
}

// What the error screen says, in one place: shown, and read aloud on request (H10: seniors with low vision can hear it).
const errorTitle = computed(() =>
  otherKind.value ? t(`scan.other.${otherKind.value}.title`) : wrongDoc.value ? t(`${wrongDocKey.value}.title`) : t(`errors.${errorCode.value}`),
)
const errorText = computed(() => {
  if (otherKind.value) return t(`scan.other.${otherKind.value}.question`)
  if (wrongDoc.value) return t(`${wrongDocKey.value}.text`)
  if (photoError.value) return t('scan.photoHint')
  return photo.value ? t('scan.photoKept') : ''
})
const TIPS = [
  { key: 'light', icon: 'sun' },
  { key: 'flat', icon: 'scan' },
  { key: 'whole', icon: 'zoom' },
]

// Home can hand over a picked photo or ask for a sample (/scan?sample=med-1).
onMounted(() => {
  const file = scanStore.pendingFile
  scanStore.pendingFile = null
  if (file) return useFile(file)
  const sample = SAMPLES.find((s) => s.id === route.query.sample)
  // Opened to take or pick a photo: start downloading the reader now (not for a sample, which never needs it; tests use a fake).
  if (!sample) return window.__redactForTests || warmUp()
  router.replace({ query: {} }) // so Back from Confirm doesn't run the sample again
  trySample(sample)
})
</script>

<template>
  <!-- Kept outside the states so Retake/Upload work from the error screen too. -->
  <input ref="camera" type="file" accept="image/*" capture="environment" class="d-none" data-testid="camera-input" @change="onFile" />
  <input ref="upload" type="file" accept="image/*" class="d-none" @change="onFile" />

  <div v-if="state === 'loading'" class="busy rise">
    <div v-if="coverView" class="cover-view" :class="{ done: coverView.covered }" aria-hidden="true">
      <img :src="coverView.original" alt="" />
      <img v-if="coverView.covered" :src="coverView.covered" alt="" class="cover-after" />
      <span class="cover-line"></span>
    </div>
    <div v-else class="progress-ring" aria-hidden="true">
      <svg width="216" height="216" viewBox="0 0 216 216">
        <circle cx="108" cy="108" r="96" fill="none" stroke="var(--color-surface-2)" stroke-width="12" />
        <circle cx="108" cy="108" r="96" fill="none" stroke="var(--color-primary)" stroke-width="12" stroke-linecap="round" stroke-dasharray="603" stroke-dashoffset="400" />
      </svg>
      <span class="progress-ring__pulse" style="inset: 26px"></span>
      <span class="progress-ring__pulse" style="inset: 42px"></span>
      <span class="progress-ring__core"><AppIcon :name="readingType === 'bill' ? 'receipt' : 'pill'" :size="40" /></span>
    </div>
    <LoadingState :label="covering ? t('scan.covering') : t(`scan.reading.${readingType}`)" />
    <p class="lead-text">{{ t('scan.wait') }}</p>
    <span class="reassure-pill"><AppIcon name="shield" :size="20" class="text-teal" />{{ t('scan.neverStored') }}</span>
    <button type="button" class="btn btn-ghost" @click="cancel">{{ t('scan.cancel') }}</button>
  </div>

  <div v-else-if="state === 'error'" class="cols rise">
    <div>
      <!-- A question, not an error: calm tile, no "Error" badge. -->
      <span v-if="otherKind" class="tile tile-soft err-tile"><AppIcon :name="otherKind === 'bill' ? 'receipt' : 'pill'" :size="42" /></span>
      <template v-else>
        <span class="tile tile-warning err-tile"><AppIcon name="camera" :size="42" /></span>
        <span class="badge badge-warning align-self-start"><AppIcon name="alert" :size="18" />{{ t('scan.errorTag') }}</span>
      </template>
      <div role="alert" class="d-flex flex-column gap-3">
        <h1>{{ errorTitle }}</h1>
        <p v-if="errorText" class="lead-text" :data-testid="otherKind ? 'scan-other-question' : null">{{ errorText }}</p>
      </div>
      <ReadAloud :text="`${errorTitle}. ${errorText}`" />
    </div>
    <div>
      <ul v-if="photoError" class="card tips">
        <li v-for="tip in TIPS" :key="tip.key">
          <span class="tile tile-soft"><AppIcon :name="tip.icon" :size="22" /></span>
          <span><strong>{{ t(`scan.tips.${tip.key}.title`) }}.</strong> {{ t(`scan.tips.${tip.key}.text`) }}</span>
        </li>
      </ul>
      <img v-else-if="photo" :src="photo" :alt="t('scan.yourPhoto')" class="photo scan-preview" />
      <template v-if="otherKind">
        <button type="button" class="btn btn-primary" data-testid="scan-other-yes" @click="readAsOther"><AppIcon name="check" />{{ t(`scan.other.${otherKind}.yes`) }}</button>
        <button type="button" class="btn btn-secondary" data-testid="scan-other-no" @click="notOther"><AppIcon name="x" />{{ t(`scan.other.${otherKind}.no`) }}</button>
      </template>
      <template v-else-if="photoError || wrongDoc">
        <button type="button" class="btn btn-primary" @click="retake"><AppIcon name="camera" />{{ t('scan.retake') }}</button>
        <button type="button" class="btn btn-secondary" @click="upload.click()"><AppIcon name="upload" />{{ t('scan.uploadOther') }}</button>
        <button v-if="wrongDoc" type="button" class="btn btn-ghost" @click="state = 'idle'"><AppIcon name="sparkles" />{{ t('scan.useSample') }}</button>
      </template>
      <template v-else>
        <button type="button" class="btn btn-primary" @click="retry"><AppIcon name="replay" />{{ t('scan.tryAgain') }}</button>
        <button type="button" class="btn btn-secondary" @click="state = 'idle'"><AppIcon name="sparkles" />{{ t('scan.useSample') }}</button>
      </template>
    </div>
  </div>

  <div v-else class="page">
    <div class="d-flex align-items-start gap-3">
      <!-- Bills are scanned from the Bill page, so this goes back there. (Medicine Scan is a main tab: no Back.) -->
      <RouterLink v-if="type === 'bill'" :to="{ name: 'bill' }" class="back" :aria-label="t('nav.back')" data-testid="scan-back"></RouterLink>
      <div class="page-head">
        <h1>{{ t(type === 'bill' ? 'home.bill.title' : 'home.med.title') }}</h1>
        <p class="lead-text">{{ t(`scan.lead.${type}`) }}</p>
      </div>
    </div>

    <div class="cols">
      <!-- Everything for getting a photo in, in one place: camera first (most people scan with a phone), then upload. -->
      <section aria-labelledby="add-title">
        <h2 id="add-title" class="section-label">{{ t('scan.addPhoto') }}</h2>
        <!-- The video stays mounted (hidden) so startCamera can attach the stream to it. -->
        <div v-show="stream" class="frame-area">
          <video ref="video" class="live" autoplay playsinline muted @playing="cameraReady = true" :aria-label="t('scan.preview')"></video>
          <span class="frame" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="frame-hint"><AppIcon name="sun" :size="18" />{{ t(`scan.frame.${type}`) }}</span>
        </div>
        <template v-if="stream">
          <button type="button" class="btn btn-primary" :disabled="!cameraReady" @click="capture"><AppIcon name="camera" />{{ t('scan.capture') }}</button>
          <button type="button" class="btn btn-secondary" @click="stopCamera"><AppIcon name="x" />{{ t('scan.cancel') }}</button>
        </template>
        <template v-else>
          <button type="button" class="btn btn-primary" data-guide="scan-take" @click="startCamera"><AppIcon name="camera" />{{ t('scan.take') }}</button>
          <p v-if="cameraBlocked" class="alert alert-warning" role="alert"><AppIcon name="alert" />{{ t('scan.cameraBlocked') }}</p>
          <p class="or">{{ t('scan.or') }}</p>
          <UploadDropzone class="dz-full" @select="useFile" />
        </template>
        <p class="privacy"><AppIcon name="shield" :size="20" />{{ t('scan.privacy') }}</p>
      </section>

      <section aria-labelledby="samples-title">
        <h2 id="samples-title" class="section-label">{{ t('scan.samplesTitle') }}</h2>
        <div class="d-flex flex-column gap-3 stagger">
          <button v-for="sample in samples" :key="sample.id" type="button" class="card card-interactive sample" @click="trySample(sample)">
            <img :src="`/samples/${sample.id}.svg`" alt="" class="sample-thumb" />
            <span class="d-flex flex-column flex-grow-1">
              <span class="sample-name">{{ t(`scan.samples.${sample.key}`) }}</span>
              <span class="text-muted-a11y sample-kind">{{ t(`scan.sampleOf.${sample.type}`) }}</span>
            </span>
            <AppIcon name="right" :size="22" class="text-teal" />
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped src="../styles/views/ScanView.css"></style>

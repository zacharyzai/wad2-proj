<!-- Owner: Asher. From the Claude Design Scan screens: choose, camera/upload, samples, processing and unclear-photo states.
     Choose first: "What would you like to scan today?" with two big picture cards (Medicine label / Medical bill),
     centred, that zoom in a little under the mouse. Picking one opens that kind's page: one camera button and one upload box named for it, the
     privacy line right under them, tips for that kind of paper, and samples behind "Try an example". The choice is in
     the address (?type=bill), so Back returns to the question. Bills have no tab of their own: they start here. -->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { scanImage, scanSample } from '../api/client'
import { redactImage, warmUp } from '../utils/redact'
import { checkPhoto } from '../utils/photoCheck'
import { isPdf, pdfToJpegs, MAX_PAGES } from '../utils/pdfToImage'
import { scanStore } from '../stores/scan'
import AppIcon from '../components/layout/AppIcon.vue'
import LoadingState from '../components/layout/LoadingState.vue'
import Spinner from '../components/layout/Spinner.vue'
import UploadDropzone from '../components/scan/UploadDropzone.vue'
import ReadAloud from '../components/explain/ReadAloud.vue'

const SAMPLES = [
  { id: 'med-1', type: 'medication', key: 'med1' },
  { id: 'med-2', type: 'medication', key: 'med2' },
  { id: 'med-3', type: 'medication', key: 'med3' },
  { id: 'bill-1', type: 'bill', key: 'bill1' },
]
// A new photo can fix these; anything else is on our side, so the same photo is kept for "Try again".
// PHOTO_*: we looked at the photo on this device and can say why it won't read (utils/photoCheck.js). "Scan it anyway" skips that.
const CHECK_ERRORS = { dark: 'PHOTO_DARK', blurry: 'PHOTO_BLURRY', glare: 'PHOTO_GLARE' }
const PHOTO_ERRORS = ['UNREADABLE_IMAGE', 'IMAGE_TOO_LARGE', 'BAD_REQUEST', 'UNSUPPORTED_FILE', ...Object.values(CHECK_ERRORS)]
const MAX_SIDE = 1600

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
// What the next photo is of. The question shows until a kind is picked; the pick goes in the address (?type=bill), so
// Back returns to the question, and links that already know (?type=, #bill from old Bill links) open that kind straight away.
const KINDS = ['medication', 'bill']
const chosen = computed(() => (KINDS.includes(route.query.type) ? route.query.type : route.hash === '#bill' ? 'bill' : null))
const type = ref(chosen.value ?? SAMPLES.find((x) => x.id === route.query.sample)?.type ?? 'medication')
watch(chosen, (k) => k && (type.value = k))
// A card: with a photo from Home waiting, read it as that kind straight away; otherwise open that kind's page.
function pick(k) {
  if (pending.value) {
    type.value = k
    return scanPending()
  }
  examplesOpen.value = false
  router.push({ name: 'scan', query: { type: k } })
}
const KIND_PAPER = { medication: 'med-1', bill: 'bill-1' } // the sample each card shows
// Samples sit behind "Try an example", a short list for the kind chosen.
const examplesOpen = ref(false)
const examples = computed(() => SAMPLES.filter((x) => x.type === type.value))
// Tips for the kind chosen: good light for both, then what matters for that paper.
const TIPS_FOR = {
  medication: [
    { key: 'tips.light', icon: 'sun' },
    { key: 'tipsFor.medication.label', icon: 'pill' },
    { key: 'tips.whole', icon: 'zoom' },
  ],
  bill: [
    { key: 'tips.light', icon: 'sun' },
    { key: 'tipsFor.bill.flat', icon: 'scan' },
    { key: 'tipsFor.bill.total', icon: 'receipt' },
  ],
}
// A photo picked on Home: it waits on the question until they say what it is (Home doesn't guess). { file, url }
const pending = ref(null)
function dropPending() {
  if (pending.value) URL.revokeObjectURL(pending.value.url)
  pending.value = null
}
function scanPending() {
  const { file } = pending.value
  dropPending()
  useFiles([file], type.value)
}
onBeforeUnmount(dropPending)

const state = ref('idle') // idle | loading | error
const covering = ref(false) // loading, step 1: blacking out personal details on this phone
// The photo shown while it is covered, so people watch their details being blacked out: { original, covered }.
const coverView = ref(null)
const REVEAL_MS = 1100 // matches the cover-wipe animation in ScanView.css
// One limit for a whole scan, tap to answer: covering gets up to 12 s of it per page, the request the rest (the server's AI
// stops at 16 s, plus 4 s a page, server/services/gemini.js). Past it, a TIMEOUT error with Try again instead of waiting on.
const SCAN_LIMIT_MS = 30_000
const PAGE_LIMIT_MS = 10_000 // each page after the first: covered on this phone, then read
const scanLimit = (pages) => SCAN_LIMIT_MS + PAGE_LIMIT_MS * (Math.max(1, pages) - 1)
const COVER_LIMIT_MS = 12_000
// The server takes 4 MB in all (server/app.js); base64 characters, with room for the rest of the request.
const MAX_UPLOAD = 3_600_000
const SLOW_MS = 15_000 // then the wait text says it is slower than usual, and when we will stop
const readingType = ref(type.value)
const errorCode = ref(null)
// The pages of this scan, in order: compressed, then covered, data URLs. Usually one photo; a long bill can be several
// photos or a PDF's pages, each its own image so the AI reads every page at full detail.
const photos = ref([])
// Which coverView page is being covered, for "Covering page 2 of 3".
const coverPage = ref(null)
const camera = ref(null)
const upload = ref(null)
let lastRequest = null
const slow = ref(false)
let slowTimer
watch(state, (s) => {
  clearTimeout(slowTimer)
  slow.value = false
  if (s === 'loading') slowTimer = setTimeout(() => (slow.value = true), SLOW_MS)
})
onBeforeUnmount(() => clearTimeout(slowTimer))
let run = 0 // bumped by Cancel so a late reply is ignored

// Keeps the upload well under the 4 MB API limit (contract asks for about 1 MB).
function toJpeg(source, width, height, quality = 0.8) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
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

let pdfPages = null // { total, read } of the PDF being read, for the note on Confirm
// A PDF is already clean and sharp (never dark, blurry or glary), so the photo check skips its pages, including on Try again.
const fromPdf = new Set()
// Each file becomes its pages: a photo is one, a PDF (a bill saved from email) one per page. Never more than the server takes:
// the upload box allows MAX_PAGES; the other upload buttons keep the first ones.
async function compress(files) {
  pdfPages = null
  fromPdf.clear()
  const pages = []
  for (const file of files) {
    if (isPdf(file)) {
      const drawn = await pdfToJpegs(file, { pages: MAX_PAGES - pages.length, onInfo: (info) => (pdfPages = info) })
      drawn.forEach((page) => fromPdf.add(page))
      pages.push(...drawn)
    } else {
      const img = await loadImage(file)
      if (!img.naturalWidth || !img.naturalHeight) throw new Error('Image has no size')
      pages.push(toJpeg(img, img.naturalWidth, img.naturalHeight))
    }
    if (pages.length >= MAX_PAGES) break
  }
  return pages.slice(0, MAX_PAGES)
}

// Covered pages are mostly black, so this rarely runs: several busy pages over the limit are saved again at lower quality
// (still sharp enough to read) instead of failing with IMAGE_TOO_LARGE.
async function fitUpload(pages) {
  for (const quality of [0.65, 0.5]) {
    if (pages.reduce((sum, page) => sum + page.length, 0) <= MAX_UPLOAD) break
    pages = await Promise.all(
      pages.map(
        (src) =>
          new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(toJpeg(img, img.naturalWidth, img.naturalHeight, quality))
            img.onerror = reject
            img.src = src
          }),
      ),
    )
  }
  return pages
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
  await nextTick() // the camera screen only exists once there is a stream
  video.value.srcObject = stream.value
}

function stopCamera() {
  stream.value?.getTracks().forEach((track) => track.stop())
  stream.value = null
  cameraReady.value = false
}

function capture() {
  pdfPages = null
  fromPdf.clear()
  photos.value = [toJpeg(video.value, video.value.videoWidth, video.value.videoHeight)]
  stopCamera()
  coverAndSend(type.value)
}

async function retake() {
  state.value = 'idle'
  await nextTick()
  startCamera()
}

onBeforeUnmount(stopCamera)

// request(ms) makes the call with that time limit. Try again gives it a fresh full limit.
async function send(docType, request, limit = scanLimit(photos.value.length)) {
  const id = ++run
  lastRequest = { docType, request }
  readingType.value = docType
  state.value = 'loading'
  const res = await request(limit)
  if (id !== run) return
  if (!res.ok) {
    errorCode.value = res.error.code
    state.value = 'error'
    return
  }
  scanStore.current = res.data
  scanStore.photos = photos.value
  scanStore.pdfPages = pdfPages
  scanStore.confirmed = false
  router.push({ name: 'confirm' })
}

function onFile(event) {
  const files = [...event.target.files]
  event.target.value = '' // lets the same file be picked again
  if (files.length) useFiles(files)
}

async function useFiles(files, k = type.value) {
  type.value = k
  // H1: shrinking a big photo takes about a second on old phones; show that we're working, so nobody taps again.
  coverView.value = null
  readingType.value = type.value
  covering.value = true
  state.value = 'loading'
  try {
    photos.value = await compress(files)
  } catch {
    // The browser couldn't open a file (e.g. HEIC on a laptop, or not an image), so the server was never asked.
    covering.value = false
    photos.value = []
    errorCode.value = 'UNSUPPORTED_FILE'
    state.value = 'error'
    return
  }
  coverAndSend(type.value)
}

// Zachary: personal details are blacked out on this phone first (src/utils/redact.js), and only the covered photos are sent.
// If covering fails, nothing is sent. The covered photos are also what Confirm shows, so the user sees exactly what was sent.
// e2e tests swap in a fake via window.__redactForTests (e2e/helpers/mockImageScan.js); real covering needs the reader download.
// Each page is checked and covered on its own, one after another (the reader reads one picture at a time).
let coverDocType = null
async function coverAndSend(docType, skipCheck = false) {
  const id = ++run
  const pages = photos.value
  const deadline = Date.now() + scanLimit(pages.length)
  coverDocType = docType
  lastRequest = null // Try again covers again until the covered photos have been sent
  readingType.value = docType
  covering.value = true
  state.value = 'loading'
  const fail = (code) => {
    covering.value = false
    coverPage.value = null
    errorCode.value = code
    state.value = 'error'
  }
  // Too dark, blurry or glary: say so now, before covering and uploading. (Tests that fake covering skip this check too.)
  const check = window.__photoCheckForTests ?? (window.__redactForTests ? async () => null : checkPhoto)
  for (const page of pages) {
    coverView.value = { original: page, covered: null }
    const problem = skipCheck || fromPdf.has(page) ? null : await check(page)
    if (id !== run) return // cancelled
    if (problem) return fail(CHECK_ERRORS[problem])
  }
  let tooSlow = false
  const timeUp = new Promise((resolve) => setTimeout(() => resolve((tooSlow = true) && null), COVER_LIMIT_MS * pages.length))
  let covered = []
  for (const [i, page] of pages.entries()) {
    coverPage.value = pages.length > 1 ? { n: i + 1, total: pages.length } : null
    coverView.value = { original: page, covered: null }
    let result = null
    try {
      result = await Promise.race([(window.__redactForTests ?? redactImage)(page), timeUp])
    } catch {
      // Reader could not load (offline, very old phone) or crashed: fail closed.
    }
    if (id !== run) return // cancelled
    if (!result) return fail(tooSlow ? 'TIMEOUT' : 'COVER_FAILED')
    // A page where nothing looks like a label or bill (a blank back page) would be all black: it is left out.
    if (!result.keep.length) continue
    covered.push(result.dataUrl)
    coverView.value = { original: page, covered: result.dataUrl }
    // Let the blacked-out version wipe in before the next step (shorter with reduced motion: there is no wipe).
    await new Promise((done) => setTimeout(done, matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : REVEAL_MS))
    if (id !== run) return
  }
  // No page had anything to read: don't send black pictures.
  if (!covered.length) return fail('UNREADABLE_IMAGE')
  covered = await fitUpload(covered).catch(() => covered)
  if (id !== run) return
  photos.value = covered
  covering.value = false
  coverPage.value = null
  send(docType, (ms) => scanImage(docType, photos.value, ms), deadline - Date.now())
}

function trySample(sample) {
  pdfPages = null
  fromPdf.clear()
  // H6: the sample's picture goes to Confirm too, so there is something to check the fields against.
  photos.value = [`/samples/${sample.id}.svg`]
  coverView.value = null
  send(sample.type, (ms) => scanSample(sample.id, ms))
}

function retry() {
  if (errorCode.value === 'COVER_FAILED' || !lastRequest) return coverAndSend(coverDocType)
  send(lastRequest.docType, lastRequest.request)
}

// "Use a sample instead" on the error screen: back to the page with the examples already open.
function showExamples() {
  examplesOpen.value = true
  state.value = 'idle'
  if (!chosen.value) router.replace({ name: 'scan', query: { type: type.value } }) // e.g. a photo from Home: its kind's page
}

function cancel() {
  run++
  covering.value = false
  state.value = 'idle'
}

const photoError = computed(() => PHOTO_ERRORS.includes(errorCode.value))
const checkFailed = computed(() => Object.values(CHECK_ERRORS).includes(errorCode.value))
// A clear photo of the wrong document: say so, keep the photo, no lighting tips. MISMATCH = they said it isn't the other kind either.
const wrongDoc = computed(() => errorCode.value === 'WRONG_DOCUMENT' || errorCode.value === 'MISMATCH')
const wrongDocKey = computed(() => (errorCode.value === 'MISMATCH' ? `scan.mismatch.${type.value}` : `scan.wrongDoc.${type.value}`))

// A bill scanned as a medicine label (or a label as a bill): ask "Was this meant to be a bill?".
// Yes reads the same covered photo as the other kind (no retaking); No says it can't be read as what they chose.
const OTHER_KIND = { LOOKS_LIKE_BILL: 'bill', LOOKS_LIKE_LABEL: 'medication' }
const otherKind = computed(() => OTHER_KIND[errorCode.value] ?? null)
function readAsOther() {
  const kind = otherKind.value
  send(kind, (ms) => scanImage(kind, photos.value, ms))
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
  return photos.value.length ? t('scan.photoKept') : ''
})
const TIPS = [
  { key: 'light', icon: 'sun' },
  { key: 'flat', icon: 'scan' },
  { key: 'whole', icon: 'zoom' },
]

// The last scan, offered back on the picker: coming back from Ask, a refresh or any other page no longer loses it.
const resume = computed(() => {
  const s = scanStore.current
  if (!s || pending.value) return null
  const bill = s.type === 'bill'
  const name = bill ? s.bill?.clinic || t('explain.tag.bill') : s.medication?.name
  if (!name) return null
  return { icon: bill ? 'receipt' : 'pill', name, checked: scanStore.confirmed, to: { name: scanStore.confirmed ? 'explain' : 'confirm' } }
})

// Home can hand over a picked photo or ask for a sample (/scan?sample=med-1).
onMounted(() => {
  const file = scanStore.pendingFile // a photo picked on Home: shown here, waiting for the choice above it
  scanStore.pendingFile = null
  if (file) {
    pending.value = { file, url: URL.createObjectURL(file) }
    if (chosen.value) router.replace({ name: 'scan' }) // a photo from Home is always asked about first
  }
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
  <input ref="upload" type="file" multiple accept="image/*,application/pdf" class="d-none" @change="onFile" />

  <div v-if="state === 'loading'" class="busy rise">
    <div v-if="coverView" class="cover-view" :class="{ done: coverView.covered }" aria-hidden="true">
      <img :src="coverView.original" alt="" />
      <img v-if="coverView.covered" :src="coverView.covered" alt="" class="cover-after" />
      <span class="cover-line"></span>
    </div>
    <!-- Reading a sample (no photo to show): the turning ring, large, inside soft pulsing rings. -->
    <div v-else class="progress-ring" aria-hidden="true">
      <span class="progress-ring__pulse" style="inset: 26px"></span>
      <span class="progress-ring__pulse" style="inset: 42px"></span>
      <span class="progress-ring__core"><Spinner :size="66" /></span>
    </div>
    <LoadingState :label="covering ? (coverPage ? t('scan.coveringPage', coverPage) : t('scan.covering')) : t(`scan.reading.${readingType}`)" :spinner="!!coverView" />
    <!-- A photo goes through two steps: covered on this phone, then read. Samples only have the second. -->
    <ol v-if="coverView" class="scan-steps" data-testid="scan-steps">
      <li :class="covering ? 'now' : 'done'" :aria-current="covering ? 'step' : null">
        <span class="step-mark" aria-hidden="true"><AppIcon v-if="!covering" name="check" :size="18" :stroke="3" /><template v-else>1</template></span>{{ t('scan.steps.cover') }}
      </li>
      <li :class="covering ? 'next' : 'now'" :aria-current="covering ? null : 'step'">
        <span class="step-mark" aria-hidden="true">2</span>{{ t(`scan.steps.read.${readingType}`) }}
      </li>
    </ol>
    <p class="lead-text" data-testid="scan-wait">{{ slow ? t('scan.slow') : t('scan.wait') }}</p>
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
      <img v-else-if="photos.length" :src="photos[0]" :alt="t('scan.yourPhoto')" class="photo scan-preview" />
      <template v-if="otherKind">
        <button type="button" class="btn btn-primary" data-testid="scan-other-yes" @click="readAsOther"><AppIcon name="check" />{{ t(`scan.other.${otherKind}.yes`) }}</button>
        <button type="button" class="btn btn-secondary" data-testid="scan-other-no" @click="notOther"><AppIcon name="x" />{{ t(`scan.other.${otherKind}.no`) }}</button>
      </template>
      <template v-else-if="photoError || wrongDoc">
        <button type="button" class="btn btn-primary" @click="retake"><AppIcon name="camera" />{{ t('scan.retake') }}</button>
        <button type="button" class="btn btn-secondary" @click="upload.click()"><AppIcon name="upload" />{{ t('scan.uploadOther') }}</button>
        <button v-if="checkFailed" type="button" class="btn btn-ghost" data-testid="scan-anyway" @click="coverAndSend(coverDocType, true)"><AppIcon name="scan" />{{ t('scan.anyway') }}</button>
        <button v-if="wrongDoc" type="button" class="btn btn-ghost" @click="showExamples"><AppIcon name="sparkles" />{{ t('scan.useSample') }}</button>
      </template>
      <template v-else>
        <button type="button" class="btn btn-primary" @click="retry"><AppIcon name="replay" />{{ t('scan.tryAgain') }}</button>
        <button type="button" class="btn btn-secondary" @click="showExamples"><AppIcon name="sparkles" />{{ t('scan.useSample') }}</button>
      </template>
    </div>
  </div>

  <!-- Live camera: its own screen, so the picture is big and Capture is the only thing to press. -->
  <div v-else-if="stream" class="page">
    <h1>{{ t(type === 'bill' ? 'home.bill.title' : 'home.med.title') }}</h1>
    <div class="frame-area">
      <video ref="video" class="live" autoplay playsinline muted @playing="cameraReady = true" :aria-label="t('scan.preview')"></video>
      <span class="frame" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span class="frame-hint"><AppIcon name="sun" :size="18" />{{ t(`scan.frame.${type}`) }}</span>
    </div>
    <button type="button" class="btn btn-primary" :disabled="!cameraReady" data-testid="scan-capture" @click="capture"><AppIcon name="camera" />{{ t('scan.capture') }}</button>
    <button type="button" class="btn btn-secondary" @click="stopCamera"><AppIcon name="x" />{{ t('scan.cancel') }}</button>
  </div>

  <!-- The question: two picture cards. Picking one opens that kind's page (below). -->
  <div v-else-if="!chosen || pending" class="page rise picker">
    <div class="page-head">
      <h1>{{ t('scan.choose.question') }}</h1>
      <p v-if="!pending" class="lead-text pick-lead">{{ t('scan.choose.lead') }}</p>
    </div>
    <section v-if="resume" class="resume card" aria-labelledby="resume-title" data-testid="scan-resume">
      <span class="tile tile-soft" aria-hidden="true"><AppIcon :name="resume.icon" :size="28" /></span>
      <div class="resume-text">
        <h2 id="resume-title" class="h3 m-0">{{ t('scan.resume.title') }}: {{ resume.name }}</h2>
        <p class="m-0 text-muted-a11y">{{ t(resume.checked ? 'scan.resume.checked' : 'scan.resume.unchecked') }}</p>
      </div>
      <RouterLink :to="resume.to" class="btn btn-primary" data-testid="scan-resume-go"><AppIcon name="right" :size="22" />{{ t(resume.checked ? 'scan.resume.seeAgain' : 'scan.resume.carryOn') }}</RouterLink>
    </section>
    <!-- A photo picked on Home waits here: picking a card reads it as that kind. -->
    <div v-if="pending" class="pending card" data-testid="scan-pending">
      <img :src="pending.url" :alt="t('scan.dz.previewAlt')" class="pending-thumb" />
      <p class="m-0">{{ t('scan.choose.pending') }}</p>
    </div>
    <div class="picks" data-guide="scan-choice">
      <button
        v-for="k in KINDS"
        :key="k"
        type="button"
        class="pick"
        :class="`pick-${k}`"
        :data-guide="`scan-choice-${k}`"
        :data-testid="`choose-${k}`"
        @click="pick(k)"
      >
        <span class="pick-art" aria-hidden="true">
          <img :src="`/samples/${KIND_PAPER[k]}.svg`" alt="" class="pick-paper" />
        </span>
        <span class="pick-badge" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
        </span>
        <span class="pick-words">
          <span class="pick-title">{{ t(`scan.choose.${k}.title`) }}</span>
          <span class="pick-text">{{ t(`scan.choose.${k}.text`) }}</span>
        </span>
        <span class="pick-go">{{ t(pending ? `scan.pendingScan.${k}` : `scan.choose.${k}.go`) }}<AppIcon name="right" :size="20" :stroke="2.5" /></span>
      </button>
    </div>
    <button v-if="pending" type="button" class="btn btn-ghost" @click="dropPending"><AppIcon name="x" />{{ t('scan.dz.change') }}</button>
  </div>

  <!-- The kind picked: one place to add the photo, tips for that paper, and examples. -->
  <div v-else :key="chosen" class="page rise">
    <div class="d-flex align-items-start gap-3">
      <RouterLink :to="{ name: 'scan' }" class="back" :aria-label="t('scan.choose.again')" :title="t('scan.choose.again')" data-testid="scan-back"></RouterLink>
      <div class="page-head">
        <h1>{{ t(type === 'bill' ? 'home.bill.title' : 'home.med.title') }}</h1>
        <p class="lead-text">{{ t(`scan.lead.${type}`) }}</p>
      </div>
    </div>

    <div class="capture">
      <section class="d-flex flex-column gap-3" aria-labelledby="add-title">
        <h2 id="add-title" class="visually-hidden">{{ t('scan.addPhoto') }}</h2>
        <!-- Camera first (most people scan with a phone), then upload. Both named for what is being scanned. -->
        <button type="button" class="btn btn-primary" data-guide="scan-take" data-testid="scan-take" @click="startCamera"><AppIcon name="camera" />{{ t(`scan.takeOf.${type}`) }}</button>
        <p v-if="cameraBlocked" class="alert alert-warning m-0" role="alert"><AppIcon name="alert" />{{ t('scan.cameraBlocked') }}</p>
        <p class="or">{{ t('scan.or') }}</p>
        <UploadDropzone class="dz-full" @select="(files) => useFiles(files, type)" />
        <p class="privacy"><AppIcon name="shield" :size="20" />{{ t('scan.privacy') }}</p>
      </section>

      <div class="d-flex flex-column gap-3">
        <section class="card tips-card" aria-labelledby="tips-title">
          <h2 id="tips-title" class="section-label m-0">{{ t('scan.tipsTitle') }}</h2>
          <ul class="tips" data-testid="scan-tips">
            <li v-for="tip in TIPS_FOR[type]" :key="tip.key">
              <span class="tile tile-soft"><AppIcon :name="tip.icon" :size="22" /></span>
              <span><strong>{{ t(`scan.${tip.key}.title`) }}.</strong> {{ t(`scan.${tip.key}.text`) }}</span>
            </li>
          </ul>
        </section>

        <!-- Samples: one quiet link that opens a short list for this kind. It slides open (the samples fade in one after
             another) and closes the same way in reverse (the samples lift away, last first, then it folds shut); the arrow
             turns. Closed, the list can't be reached by Tab or a screen reader (inert). -->
        <div class="examples" :class="{ open: examplesOpen }">
          <button type="button" class="btn btn-ghost examples-toggle" :aria-expanded="examplesOpen" aria-controls="scan-examples" data-guide="scan-examples" data-testid="scan-examples" @click="examplesOpen = !examplesOpen">
            <AppIcon name="sparkles" />{{ t('scan.examples') }}<AppIcon name="down" :size="20" class="examples-chev" />
          </button>
          <div id="scan-examples" class="examples-drawer" :inert="examplesOpen ? null : ''">
            <div class="examples-list">
            <div class="examples-inner" :style="{ '--n': examples.length }">
            <button v-for="(sample, i) in examples" :key="sample.id" type="button" class="card card-interactive sample" :style="{ '--i': i }" @click="trySample(sample)">
              <img :src="`/samples/${sample.id}.svg`" alt="" loading="lazy" decoding="async" class="sample-thumb" />
              <span class="d-flex flex-column flex-grow-1">
                <span class="sample-name">{{ t(`scan.samples.${sample.key}`) }}</span>
                <span class="text-muted-a11y sample-kind">{{ t(`scan.sampleOf.${sample.type}`) }}</span>
              </span>
              <AppIcon name="right" :size="22" class="text-teal" />
            </button>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/views/ScanView.css"></style>

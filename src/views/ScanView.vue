<!-- Owner: Asher. From the Claude Design Scan screens. One page, five screens (components/scan/):
       ScanPicker    "What would you like to scan today?" (no kind in the address yet, or a photo from Home waiting)
       ScanKindPage  that kind's page: camera, upload, tips, samples (?type=medication | bill, so Back returns to the question)
       LiveCamera    the live camera
       ScanBusy      covering personal details on this phone, then reading
       ScanProblem   an unclear photo, the wrong paper, or a service error
     This page runs the scan itself: photo → shrink (utils/images.js) → check (utils/photoCheck.js) → cover details
     (utils/redact.js) → send (/api/scan) → Confirm. Bills have no tab of their own: they start here. -->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { scanImage, scanSample } from '../api/client'
import { redactImage, warmUp } from '../utils/redact'
import { checkPhoto, CHECK_ERRORS } from '../utils/photoCheck'
import { compress, fitUpload } from '../utils/images'
import { useScanStore } from '../stores/scan'
import ScanPicker from '../components/scan/ScanPicker.vue'
import ScanKindPage from '../components/scan/ScanKindPage.vue'
import LiveCamera from '../components/scan/LiveCamera.vue'
import ScanBusy from '../components/scan/ScanBusy.vue'
import ScanProblem from '../components/scan/ScanProblem.vue'
const scanStore = useScanStore()

const SAMPLES = [
  { id: 'med-1', type: 'medication', key: 'med1' },
  { id: 'med-2', type: 'medication', key: 'med2' },
  { id: 'med-3', type: 'medication', key: 'med3' },
  { id: 'bill-1', type: 'bill', key: 'bill1' },
]

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
// Samples sit behind "Try an example", a short list for the kind chosen.
const examplesOpen = ref(false)
const examples = computed(() => SAMPLES.filter((x) => x.type === type.value))

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
const REVEAL_MS = 1100 // matches the cover-wipe animation in ScanBusy.css
// One limit for a whole scan, tap to answer: covering gets up to 12 s of it per page, the request the rest (the server's AI
// stops at 16 s, plus 4 s a page, server/services/gemini.js). Past it, a TIMEOUT error with Try again instead of waiting on.
const SCAN_LIMIT_MS = 30_000
const PAGE_LIMIT_MS = 10_000 // each page after the first: covered on this phone, then read
const scanLimit = (pages) => SCAN_LIMIT_MS + PAGE_LIMIT_MS * (Math.max(1, pages) - 1)
const COVER_LIMIT_MS = 12_000
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

let pdfPages = null // { total, read } of the PDF being read, for the note on Confirm
// A PDF is already clean and sharp (never dark, blurry or glary), so the photo check skips its pages, including on Try again.
let fromPdf = new Set()

// Live camera (LiveCamera.vue shows it). No camera API (e.g. plain http on a phone): the native camera via the file input.
const stream = ref(null)
const cameraBlocked = ref(false)
async function startCamera() {
  cameraBlocked.value = false
  if (!navigator.mediaDevices?.getUserMedia) return camera.value.click()
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false })
  } catch {
    cameraBlocked.value = true // permission denied or no camera
  }
}
function stopCamera() {
  stream.value?.getTracks().forEach((track) => track.stop())
  stream.value = null
}
function capture(frame) {
  pdfPages = null
  fromPdf = new Set()
  photos.value = [frame]
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
  Object.assign(scanStore, { current: res.data, photos: photos.value, pdfPages, confirmed: false })
  router.push({ name: 'confirm' })
}

function onFile(event) {
  const files = [...event.target.files]
  event.target.value = '' // lets the same file be picked again
  if (files.length) useFiles(files)
}

async function useFiles(files, k = type.value) {
  type.value = k
  // Shrinking a big photo takes about a second on old phones; show that we're working, so nobody taps again.
  coverView.value = null
  readingType.value = type.value
  covering.value = true
  state.value = 'loading'
  try {
    const result = await compress(files)
    photos.value = result.pages
    pdfPages = result.pdfPages
    fromPdf = result.fromPdf
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
  fromPdf = new Set()
  // The sample's picture goes to Confirm too, so there is something to check the fields against.
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

// "Was this meant to be a bill?" Yes: read the same covered photo as the other kind.
const readAs = (kind) => send(kind, (ms) => scanImage(kind, photos.value, ms))

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
  <!-- Kept outside the screens so Retake/Upload work from the error screen too. -->
  <input ref="camera" type="file" accept="image/*" capture="environment" class="d-none" data-testid="camera-input" @change="onFile" />
  <input ref="upload" type="file" multiple accept="image/*,application/pdf" class="d-none" @change="onFile" />

  <ScanBusy v-if="state === 'loading'" :cover-view="coverView" :covering="covering" :cover-page="coverPage" :reading-type="readingType" :slow="slow" @cancel="cancel" />

  <ScanProblem
    v-else-if="state === 'error'"
    :code="errorCode"
    :type="type"
    :photo="photos[0] ?? null"
    @retake="retake"
    @upload="upload.click()"
    @anyway="coverAndSend(coverDocType, true)"
    @examples="showExamples"
    @retry="retry"
    @read-as="readAs"
    @not-other="errorCode = 'MISMATCH'"
  />

  <LiveCamera v-else-if="stream" :stream="stream" :type="type" @capture="capture" @cancel="stopCamera" />

  <ScanPicker v-else-if="!chosen || pending" :pending="pending" @pick="pick" @drop="dropPending" />

  <ScanKindPage
    v-else
    :key="chosen"
    v-model:examples-open="examplesOpen"
    :type="type"
    :camera-blocked="cameraBlocked"
    :examples="examples"
    @take="startCamera"
    @files="(files) => useFiles(files, type)"
    @sample="trySample"
  />
</template>

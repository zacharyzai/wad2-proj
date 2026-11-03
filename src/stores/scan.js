// The scan currently being confirmed/explained, shared by Scan → Confirm → Explain → Schedule/Bill (a Pinia store, Week 11).
// Holds the contract's `data` object (docs/scan-contract.md). The extracted text (never the photo) is also kept for this tab,
// so a refresh, or a visit to Ask, doesn't lose it: the Scan page offers it back. Cleared on log out. Saved scans live in History.
import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

const KEY = 'lastScan'
function restore() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY))
    return saved?.current && ['medication', 'bill'].includes(saved.current.type) ? saved : null
  } catch {
    return null // storage blocked or corrupted: start with nothing
  }
}

export const useScanStore = defineStore('scan', () => {
  const saved = restore()
  // state
  const current = ref(saved?.current ?? null)
  // Covered data URLs of the user's photo, or of each page of a long bill, shown beside the fields on Confirm. [] when there
  // is none. Never sent anywhere but /api/scan.
  const photos = ref([])
  // For a PDF: { total, read } pages, so Confirm can say which pages were read. null otherwise.
  const pdfPages = ref(null)
  // Set by Confirm. Explain and Schedule only use a scan the user has checked.
  const confirmed = ref(saved?.confirmed ?? false)
  // A photo picked on Home; Scan reads it on arrival.
  const pendingFile = ref(null)
  // A scan still going, or finished, after the person left the Scan page mid-way (views/ScanView.vue keeps it running):
  // { type: 'medication' | 'bill', status: 'working' | 'ready' | 'failed' }, shown by components/scan/ScanAwayNotice.vue.
  const away = ref(null)

  // The scan still being covered or read (views/ScanView.vue runs it). It lives here, not on the page, so it carries on
  // when the person taps elsewhere mid-way, and log out (forget) stops it. Never saved: photos are never stored.
  const reading = ref('idle') // idle | loading | error
  const covering = ref(false) // loading, step 1: blacking out personal details on this phone
  const coverView = ref(null) // the photo shown while it is covered: { original, covered }
  const coverPage = ref(null) // { n, total } for "Covering page 2 of 3"
  const readingType = ref('medication')
  const errorCode = ref(null)
  // The pages of this scan, in order: compressed, then covered, data URLs. Handed to `photos` once the scan is read.
  const pages = ref([])
  const pagesPdf = ref(null) // { total, read } of the PDF being read, handed to `pdfPages`
  const fromPdf = ref(new Set()) // PDF pages are clean and sharp: the photo check skips them, including on Try again
  const checkedShots = ref(new Set()) // bill pages already checked one by one as they were taken
  const lastRequest = ref(null) // { docType, request } for Try again
  const coverDocType = ref(null)
  const run = ref(0) // bumped by Cancel and log out, so a late reply is ignored
  const handingOver = ref(false) // a finished scan is opening Confirm: the page closing now is not the person leaving
  const pageOpen = ref(false) // the person is on the Scan page
  // After 15 s of waiting the text says it is slower than usual, and when we will stop.
  const SLOW_MS = 15_000
  const slow = ref(false)
  let slowTimer
  watch(reading, (r) => {
    clearTimeout(slowTimer)
    slow.value = false
    if (r === 'loading') slowTimer = setTimeout(() => (slow.value = true), SLOW_MS)
  })

  // Keep the extracted text for this tab (sessionStorage).
  watch(
    [current, confirmed],
    () => {
      try {
        if (current.value) sessionStorage.setItem(KEY, JSON.stringify({ current: current.value, confirmed: confirmed.value }))
        else sessionStorage.removeItem(KEY)
      } catch {
        // Not critical: the scan just won't survive a refresh.
      }
    },
    { deep: true },
  )

  // action: whoever is logged out takes their last scan with them.
  function forget() {
    current.value = null
    photos.value = []
    pdfPages.value = null
    confirmed.value = false
    away.value = null
    // A scan still going is dropped too: its reply is ignored, so it never lands in the next person's account.
    run.value++
    reading.value = 'idle'
    covering.value = false
    coverView.value = null
    coverPage.value = null
    errorCode.value = null
    pages.value = []
    pagesPdf.value = null
    lastRequest.value = null
  }

  return {
    current, photos, pdfPages, confirmed, pendingFile, away,
    reading, covering, coverView, coverPage, readingType, errorCode, pages, pagesPdf, fromPdf, checkedShots, lastRequest,
    coverDocType, run, handingOver, pageOpen, slow,
    forget,
  }
})

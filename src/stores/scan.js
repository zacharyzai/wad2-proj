// The scan currently being confirmed/explained, shared by Scan → Confirm → Explain → Schedule/Bill.
// Holds the contract's `data` object (docs/scan-contract.md). The extracted text (never the photo) is also kept for this tab,
// so a refresh, or a visit to Ask, doesn't lose it: the Scan page offers it back. Cleared on log out. Saved scans live in History.
import { reactive, watch } from 'vue'

const KEY = 'lastScan'
function restore() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY))
    return saved?.current && ['medication', 'bill'].includes(saved.current.type) ? saved : null
  } catch {
    return null // storage blocked or corrupted: start with nothing
  }
}
const saved = restore()

export const scanStore = reactive({
  current: saved?.current ?? null,
  // Covered data URLs of the user's photo, or of each page of a long bill, shown beside the fields on Confirm. [] when there
  // is none. Never sent anywhere but /api/scan.
  photos: [],
  // For a PDF: { total, read } pages, so Confirm can say which pages were read. null otherwise.
  pdfPages: null,
  // Set by Confirm. Explain and Schedule only use a scan the user has checked.
  confirmed: saved?.confirmed ?? false,
  // A photo picked on Home; Scan reads it on arrival.
  pendingFile: null,
  // A scan still going, or finished, after the person left the Scan page mid-way (views/ScanView.vue keeps it running):
  // { type: 'medication' | 'bill', status: 'working' | 'ready' | 'failed' }, shown by components/scan/ScanAwayNotice.vue.
  away: null,
})

watch(
  () => [scanStore.current, scanStore.confirmed],
  () => {
    try {
      if (scanStore.current) sessionStorage.setItem(KEY, JSON.stringify({ current: scanStore.current, confirmed: scanStore.confirmed }))
      else sessionStorage.removeItem(KEY)
    } catch {
      // Not critical: the scan just won't survive a refresh.
    }
  },
  { deep: true },
)

// Whoever is logged out takes their last scan with them.
export function forgetScan() {
  scanStore.current = null
  scanStore.photos = []
  scanStore.pdfPages = null
  scanStore.confirmed = false
  scanStore.away = null
}

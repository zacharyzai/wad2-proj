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
  }

  return { current, photos, pdfPages, confirmed, pendingFile, away, forget }
})

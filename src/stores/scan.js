// The scan currently being confirmed/explained, shared by Scan → Confirm → Explain → Schedule/Bill.
// Holds the contract's `data` object (docs/scan-contract.md). Lost on page refresh; saved scans live in History.
import { reactive } from 'vue'

export const scanStore = reactive({
  current: null,
  // Compressed data URL of the user's photo, shown beside the fields on Confirm. null for samples. Never sent anywhere but /api/scan.
  photo: null,
  // Set by Confirm. Explain and Schedule only use a scan the user has checked.
  confirmed: false,
  // A photo picked on Home; Scan reads it on arrival.
  pendingFile: null,
})

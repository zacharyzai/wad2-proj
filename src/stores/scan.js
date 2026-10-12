// The scan currently being confirmed/explained, shared by Scan → Confirm → Explain → Schedule/Bill.
// Holds the contract's `data` object (docs/scan-contract.md). Lost on page refresh; saved scans live in History.
import { reactive } from 'vue'

export const scanStore = reactive({
  current: null,
})

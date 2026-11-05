// Shared state and start function for the card-launch animation.
import { reactive } from 'vue'

export const LAUNCH_MS = 1000
// kind: 'med' | 'bill' | 'ask' | 'schedule' while one plays; x, y: the centre of the card it came from.
export const cardLaunch = reactive({ kind: null, x: 0, y: 0 })
let timer = 0

// For a RouterLink with `custom` (v-slot="{ navigate }"): launch(event, 'med', navigate).
export function launch(event, kind, navigate) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return // the browser opens it
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return navigate(event)
  event.preventDefault()
  if (cardLaunch.kind) return // already on its way: a second tap does nothing
  const box = event.currentTarget.getBoundingClientRect()
  Object.assign(cardLaunch, { kind, x: box.left + box.width / 2, y: box.top + box.height / 2 })
  timer = setTimeout(() => navigate(), LAUNCH_MS)
}

// Home closing (the page has opened, or Back): the picture goes with it.
export function endLaunch() {
  clearTimeout(timer)
  cardLaunch.kind = null
}

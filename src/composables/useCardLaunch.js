// One short picture before something opens, the same everywhere (components/home/CardLaunch.vue): Home's cards and
// Scan's two cards. A capsule being scanned, a bill printing, chat bubbles, a calendar ticked. About a second, then it opens.
// Another page (Home's cards): the picture goes when the page it came from closes (endLaunch on unmount), so it never
// flickers. Same page (Scan's cards): the change happens under the picture, which then fades away (inPage).
// Reduced motion, or a click meant for a new tab or window: no picture, it opens at once.
import { nextTick, reactive } from 'vue'

export const LAUNCH_MS = 1000
export const LEAVE_MS = 320
// kind: 'med' | 'bill' | 'ask' | 'schedule' while one plays; x, y: the centre of what was tapped; leaving: fading away.
export const cardLaunch = reactive({ kind: null, x: 0, y: 0, leaving: false })
let timer = 0

// For a RouterLink with `custom` (v-slot="{ navigate }"): launch(event, 'med', navigate). Or any change on the same page:
// launch(event, 'bill', () => emit('pick', 'bill'), { inPage: true }).
export function launch(event, kind, navigate, { inPage = false } = {}) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return // the browser opens it
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return navigate(event)
  event.preventDefault()
  if (cardLaunch.kind) return // already on its way: a second tap does nothing
  const box = event.currentTarget.getBoundingClientRect()
  Object.assign(cardLaunch, { kind, x: box.left + box.width / 2, y: box.top + box.height / 2, leaving: false })
  timer = setTimeout(async () => {
    await navigate()
    if (!inPage) return
    await nextTick() // the new tab is drawn under the picture...
    cardLaunch.leaving = true // ...which then fades away
    timer = setTimeout(endLaunch, LEAVE_MS)
  }, LAUNCH_MS)
}

// The page closing (it has opened, or Back), or the picture has faded: it goes.
export function endLaunch() {
  clearTimeout(timer)
  cardLaunch.kind = null
  cardLaunch.leaving = false
}

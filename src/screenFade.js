import { nextTick } from 'vue'

const reduceMotion =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

// True when the browser supports view transitions and the user has not asked for reduced motion.
export const canFade = () =>
  Boolean(document.startViewTransition) && !reduceMotion?.matches && !document.hidden
// A screen fade is running: the router then leaves its own page transition out (src/router/index.js).
export const screenFading = () => document.documentElement.classList.contains('fade-vt')

// Runs update (it may be async, e.g. a page change) inside the fade; resolves once the new screen is in place.
export async function fadeScreen(update, kind) {
  if (!canFade()) return update()
  const root = document.documentElement
  root.classList.add('fade-vt', `fade-${kind}`)
  const transition = document.startViewTransition(async () => {
    await update()
    await nextTick()
  })
  transition.finished.finally(() => root.classList.remove('fade-vt', `fade-${kind}`))
  await transition.updateCallbackDone
}

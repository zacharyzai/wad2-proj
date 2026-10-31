// Whole-screen cross-fades for changes that touch every part of the screen at once: day/night (theme.js), the language
// (i18n), and arriving in the app after logging in or leaving it after logging out (stores/auth.js). The screen changes
// as one picture (View Transitions), so nothing jumps, reflows or recolours on its own timing. Styles: motion.css (.fade-vt).
// kind: 'theme' (half a second), 'lang' (a third of a second), 'enter' (the old screen fades out, the new one settles in).
// Reduced motion, a hidden tab or an older browser: the change happens at once.
import { nextTick } from 'vue'

const reduceMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

export const canFade = () => Boolean(document.startViewTransition) && !reduceMotion?.matches && !document.hidden
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

// A short message at the bottom of the page ("Saved", "Not saved") that hides itself after a few seconds.
import { onBeforeUnmount, ref } from 'vue'

// A short message ("Saved", "Not saved") that appears and hides itself after `ms`.
export function useToast(ms = 3000) {
  const toast = ref(null) // { text, bad } while showing
  let timer = 0

  // Shows a message; `bad` marks it as an error. A new message replaces the old one.
  function notify(text, bad = false) {
    clearTimeout(timer)
    toast.value = { text, bad }
    timer = setTimeout(() => (toast.value = null), ms)
  }

  onBeforeUnmount(() => clearTimeout(timer))
  return { toast, notify }
}

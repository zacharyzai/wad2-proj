// The Ask conversation for this visit (a Pinia store, Week 11), so leaving the Ask page and coming back keeps the answers.
// Cleared on log out (stores/auth.js), so the next person on a shared device never sees it. Not saved anywhere.
import { reactive } from 'vue'
import { defineStore } from 'pinia'

export const useAskStore = defineStore('ask', () => {
  // state: one reactive array, changed in place (push, splice), so `const { messages } = useAskStore()` stays live.
  const messages = reactive([])

  // action
  function forget() {
    messages.splice(0)
  }

  return { messages, forget }
})

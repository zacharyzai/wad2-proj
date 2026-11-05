// Ask's answers: split into words, shown word by word, and read aloud with the word being said lit up.
// The answer to the question being asked. The state below sits outside the function, so AskView and every AskReply share it:
// only one answer reveals or reads aloud at a time.
import { markRaw, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSpeechStore } from '../stores/speech'

const reduceMq = matchMedia('(prefers-reduced-motion: reduce)')
const segmenters = {}
const cache = new Map()
let revealTimer = null
const speaking = ref(null) // id of the message being read
const preparing = ref(false) // getting the audio for it
const speakFailed = ref(null) // id of the message whose audio couldn't be played
const wordAt = ref(-1) // where in the text the voice is

// Shared logic for showing and reading aloud an Ask answer: words appear one by one, and the word being read is highlighted.
export function useAnswer() {
  const { t } = useI18n()
  const { speak, stopSpeaking } = useSpeechStore()
  // The words of an answer, or the "no answer" message when there is none.
  const answerText = (m) => m.reply.answer ?? t('ask.noAnswer')

  // Words come from Intl.Segmenter, so Chinese (no spaces) splits into words too. Each word knows where it sits in the
  // text, so read-aloud can light up the one being said. Kept per answer (markRaw: plain data, not watched).
  function words(m) {
    const text = answerText(m)
    const key = `${m.id}\n${text}`
    if (cache.has(key)) return cache.get(key)
    let list
    if (typeof Intl.Segmenter === 'function') {
      segmenters[m.lang] ??= new Intl.Segmenter(m.lang, { granularity: 'word' })
      list = [...segmenters[m.lang].segment(text)].map((x) => ({ text: x.segment, start: x.index }))
    } else {
      list = [...text.matchAll(/\S+|\s+/g)].map((x) => ({ text: x[0], start: x.index }))
    }
    // The first sentence leads the card (larger); the rest follows. One sentence: it is all the lead.
    const stop = text.search(/[.!?。！？](\s|$)/)
    const leadEnd = stop >= 0 && stop + 1 < text.trim().length ? stop + 1 : text.length
    list.forEach((w, i) =>
      Object.assign(w, {
        i,
        end: w.start + w.text.length,
        lead: w.start < leadEnd,
        word: /\S/.test(w.text),
      }),
    )
    const rest = list.filter((w) => !w.lead)
    while (rest.length && !rest[0].word) rest.shift() // the space after the first sentence
    const parts = markRaw({ all: list, lead: list.filter((w) => w.lead), rest })
    cache.set(key, parts)
    return parts
  }

  // Word by word, quick (under 2 seconds for any answer) so nobody waits on it; a tap on the card shows it all at once.
  function reveal(m) {
    const total = words(m).all.length
    m.fresh = true
    setTimeout(() => (m.fresh = false), 900) // the capsule's little hop
    if (reduceMq.matches) return (m.shown = total)
    clearInterval(revealTimer)
    m.shown = 0
    const per = Math.min(45, 1700 / total) // ms a word
    const every = Math.max(16, per) // no faster than the screen redraws: several words a tick instead
    const step = Math.ceil(every / per)
    revealTimer = setInterval(() => {
      m.shown = Math.min(total, m.shown + step)
      if (m.shown >= total) clearInterval(revealTimer)
    }, every)
  }
  // True while an answer is still appearing word by word.
  const revealing = (m) => m.shown !== undefined && m.shown < words(m).all.length
  // Skips the word-by-word reveal and shows the full answer now.
  function showAll(m) {
    if (!revealing(m)) return
    clearInterval(revealTimer)
    m.shown = words(m).all.length
  }
  // Stops the word-by-word reveal timer.
  const stopRevealing = () => clearInterval(revealTimer)

  // Read-aloud on every answer, in the answer's language, at the shared speed: the device's voice, or our server's audio
  // when the device has none for that language (stores/speech.js).
  async function play(m) {
    speaking.value = m.id
    preparing.value = true
    speakFailed.value = null
    wordAt.value = -1
    showAll(m)
    const result = await speak(answerText(m), m.lang, {
      onPlaying: () => speaking.value === m.id && (preparing.value = false),
      onWord: (i) => speaking.value === m.id && (wordAt.value = i),
    })
    if (speaking.value !== m.id || result === 'stopped') return // another answer (or Stop) took over
    speaking.value = null
    preparing.value = false
    if (result === 'failed') speakFailed.value = m.id
  }
  // Stops read-aloud and clears the highlighted word.
  function stopReading() {
    wordAt.value = -1
    speaking.value = null
    preparing.value = false
    stopSpeaking()
  }
  // The word being said (by its place in the text), for the highlight.
  const isSaid = (m, w) =>
    speaking.value === m.id &&
    !preparing.value &&
    w.word &&
    wordAt.value >= w.start &&
    wordAt.value < w.end + 1

  return {
    answerText,
    words,
    reveal,
    revealing,
    showAll,
    stopRevealing,
    speaking,
    preparing,
    speakFailed,
    play,
    stopReading,
    isSaid,
  }
}

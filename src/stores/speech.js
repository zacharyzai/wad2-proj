import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { readAloudAudio } from '../api/client'

const KEY = 'speechRate'
export const SPEEDS = [0.75, 1, 1.25]

// The reading speed chosen last time.
function load() {
  try {
    const rate = Number(localStorage.getItem(KEY))
    return SPEEDS.includes(rate) ? rate : 1
  } catch {
    return 1
  }
}

const synth =
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
const clips = new Map() // lang + text → data URL, so a replay doesn't download it again

// A tenth of a second of silence. Played inside the tap, it lets iPhones play the real clip after the download.
const SILENT = (() => {
  const n = 1600
  const view = new DataView(new ArrayBuffer(44 + n * 2))
  // Writes text into the WAV header.
  const str = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  ;(str(0, 'RIFF'),
    view.setUint32(4, 36 + n * 2, true),
    str(8, 'WAVEfmt '),
    view.setUint32(16, 16, true))
  ;(view.setUint16(20, 1, true),
    view.setUint16(22, 1, true),
    view.setUint32(24, 16000, true),
    view.setUint32(28, 32000, true))
  ;(view.setUint16(32, 2, true),
    view.setUint16(34, 16, true),
    str(36, 'data'),
    view.setUint32(40, n * 2, true))
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...new Uint8Array(view.buffer)))}`
})()

export const useSpeechStore = defineStore('speech', () => {
  // This device's voices (they load a moment after the page in Chrome). Only speak with a voice that really is the language:
  // given just a lang it has no voice for, the browser reads with its English voice (Tamil comes out as "dot").
  const voices = ref(synth?.getVoices() ?? [])
  synth?.addEventListener?.('voiceschanged', () => (voices.value = synth.getVoices()))
  // The device voice for a language, if there is one.
  const voiceFor = (lang) => voices.value.find((v) => v.lang.toLowerCase().startsWith(lang))

  // state: the reading speed, shared by every player.
  const rate = ref(load())
  watch(rate, (speed) => {
    try {
      localStorage.setItem(KEY, String(speed))
    } catch {
      // Not critical: the speed just won't be remembered.
    }
  })

  // ---- speaking ----
  // One reading at a time: starting one stops the last. speak() resolves when the reading ends:
  // 'done', 'stopped' (stopSpeaking() or a newer reading), or 'failed' (no device voice and no audio from the server).
  // onPlaying runs once sound starts (straight away with a device voice; after the download, about 6 s, otherwise).
  // onWord(charIndex) follows the reading, for highlighting the word being said: the device voice reports each word;
  // server audio has no word timings, so the place is estimated from how far the clip has played.
  let audio = null
  let finish = null // ends the current reading's promise

  // Stops whatever is being read.
  function stopSpeaking() {
    synth?.cancel()
    audio?.pause()
    audio = null
    finish?.('stopped')
  }
  // Pauses/resumes the current reading, device voice or server audio.
  const pauseSpeaking = () => (audio ? audio.pause() : synth?.pause())
  const resumeSpeaking = () => (audio ? audio.play().catch(() => {}) : synth?.resume())
  // A server clip changes speed as it plays; a device voice can't, so the caller reads it again (usesDeviceVoice).
  const setSpeakingRate = (speed) => audio && (audio.playbackRate = speed)
  // True when the device has a voice for this language (otherwise the server audio is used).
  const usesDeviceVoice = (lang) => Boolean(voiceFor(lang))

  // Reads text aloud in a language at the chosen speed. Resolves when it ends or fails; `onWord` reports the position being read.
  function speak(text, lang, { rate: speed = rate.value, onPlaying, onWord } = {}) {
    stopSpeaking()
    return new Promise((resolve) => {
      let over = false
      // Finishes this reading once, whichever way it stopped.
      const end = (result) => {
        if (over) return
        over = true
        if (finish === end) finish = null
        resolve(result)
      }
      finish = end
      const voice = voiceFor(lang)
      if (voice && synth) {
        const u = new SpeechSynthesisUtterance(text)
        if (typeof SpeechSynthesisVoice !== 'undefined' && voice instanceof SpeechSynthesisVoice)
          u.voice = voice
        u.lang = voice.lang
        u.rate = speed
        u.onend = () => end('done')
        u.onerror = (e) => end(/interrupted|canceled/.test(e.error ?? '') ? 'stopped' : 'failed')
        if (onWord)
          u.onboundary = (e) => !over && (e.name ?? 'word') === 'word' && onWord(e.charIndex)
        synth.speak(u)
        onPlaying?.()
        return
      }
      // No voice here: get the audio from our server. The element starts playing (silence) inside the tap.
      const a = (audio = new Audio(SILENT))
      a.play().catch(() => {})
      const key = `${lang}\n${text}`
      const ready = clips.has(key)
        ? Promise.resolve({ ok: true, data: { audio: null } })
        : readAloudAudio(text, lang)
      ready.then((res) => {
        if (over) return
        if (!res.ok) return end('failed')
        if (res.data.audio) clips.set(key, `data:audio/wav;base64,${res.data.audio}`)
        a.src = clips.get(key)
        a.playbackRate = speed
        a.onended = () => end('done')
        a.onerror = () => end('failed')
        a.play().then(
          () => {
            if (over) return
            onPlaying?.()
            if (!onWord) return
            // Estimates the word being said from how far the server audio has played.
            const follow = () => {
              if (over || a !== audio) return
              if (a.duration > 0) onWord(Math.floor((text.length * a.currentTime) / a.duration))
              requestAnimationFrame(follow)
            }
            requestAnimationFrame(follow)
          },
          () => end('failed'),
        )
      })
    })
  }

  return {
    rate,
    voices,
    speak,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    setSpeakingRate,
    usesDeviceVoice,
  }
})

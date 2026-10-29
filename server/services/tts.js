// Owner: Sheen Hern (feature 2: cloud read-aloud). Built by Zachary's Claude. Turns text into speech with Gemini, for devices
// with no voice for the language (often Tamil and Malay). Uses the same model fallback and deadline as scans (firstReply).
import { ScanError, firstReply, geminiKeys, keyed, list } from './gemini.js'

const API = 'https://generativelanguage.googleapis.com/v1beta/interactions'
export const MAX_TTS_CHARS = 900 // about a minute of speech: an Explain reading is ~230, an Ask answer at most 800
// Asked for 16 kHz; Gemini still sends 24 kHz WAV, so shrink() halves anything above 16 kHz. 12 kHz is clear for one voice
// and keeps 90 s of speech (~900 Tamil characters, ~2.2 MB) under Vercel's 4.5 MB response limit even as base64.
const SAMPLE_RATE = 16_000

function ttsAttempt(model, text, key, i) {
  return {
    name: keyed(model, i),
    send: (signal) =>
      fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          model,
          input: text, // read word for word; the model picks the language from the text
          response_format: { type: 'audio', mime_type: 'audio/wav', sample_rate: SAMPLE_RATE },
          generation_config: { speech_config: [{ voice: process.env.GEMINI_TTS_VOICE || 'Kore' }] },
        }),
        signal,
      }),
    // The audio is the last content block with data (base64 WAV).
    text: (json) => (json.steps ?? []).flatMap((s) => s.content ?? []).filter((c) => c?.data).at(-1)?.data,
  }
}

// Recent clips, so replays and everyone hearing the same explanation don't each cost a request.
// shortcut: per server instance and lost on a cold start; fine for a demo, move to a shared cache if usage grows.
const CACHE_SIZE = 100
const cache = new Map()
const key = (text, lang) => `${lang}\n${text}`
export const cachedSpeech = (text, lang) => cache.get(key(text, lang)) ?? null
export const forgetSpeech = () => cache.clear() // tests

// Resolves to base64 WAV. Throws ScanError: AI_UNAVAILABLE (no key, every model failed, or no audio came back) or RATE_LIMITED.
export async function synthesize(text, lang) {
  if (!geminiKeys().length) return firstReply([]) // throws AI_UNAVAILABLE: no key
  const models = list(process.env.GEMINI_TTS_MODELS ?? 'gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts')
  const reply = await firstReply(geminiKeys().flatMap((key, i) => models.map((m) => ttsAttempt(m, text, key, i))))
  if (!reply) throw new ScanError(503, 'AI_UNAVAILABLE', 'The speech model returned no audio')
  const audio = shrink(reply)
  cache.delete(key(text, lang)) // re-insert as newest
  cache.set(key(text, lang), audio)
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value)
  return audio
}

// 16-bit mono PCM WAV above 16 kHz → half the sample rate (each pair of samples averaged). Anything else is left as it is.
export function shrink(base64) {
  const wav = Buffer.from(base64, 'base64')
  if (wav.length < 44) return base64 // not a WAV we know how to read
  const rate = wav.readUInt32LE(24)
  const data = wav.indexOf('data', 12)
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || rate <= SAMPLE_RATE || wav.readUInt16LE(22) !== 1 || wav.readUInt16LE(34) !== 16 || data < 0) return base64
  const pcm = wav.subarray(data + 8, data + 8 + wav.readUInt32LE(data + 4))
  const pairs = Math.floor(pcm.length / 4)
  const out = Buffer.alloc(44 + pairs * 2)
  for (let i = 0; i < pairs; i++) out.writeInt16LE((pcm.readInt16LE(i * 4) + pcm.readInt16LE(i * 4 + 2)) >> 1, 44 + i * 2)
  header(out, rate / 2, pairs)
  return out.toString('base64')
}

function header(wav, rate, samples) {
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + samples * 2, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20) // PCM
  wav.writeUInt16LE(1, 22) // mono
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples * 2, 40)
}

// A tenth of a second of silence (16 kHz, 16-bit mono WAV): the reply when USE_MOCK_AI is on, so tests and local
// development never use the speech quota.
export function silentWav(ms = 100) {
  const samples = Math.round((SAMPLE_RATE * ms) / 1000)
  const wav = Buffer.alloc(44 + samples * 2)
  header(wav, SAMPLE_RATE, samples)
  return wav.toString('base64')
}

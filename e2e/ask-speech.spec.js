// Ask page speech: voice input and read-aloud, with the browser speech APIs replaced by fakes so tests are repeatable.
import { test, expect } from './fixtures.js'

// Fake speech APIs. window.__spoken records what was read and at what speed; recognition "hears" window.__heard.
function fakeSpeech(page, { recognition = true } = {}) {
  return page.addInitScript((recognition) => {
    window.__spoken = []
    const voices = ['en-SG', 'zh-CN', 'ms-MY', 'ta-IN'].map((lang) => ({ lang, name: lang }))
    let current = null
    const synth = {
      getVoices: () => voices,
      addEventListener() {},
      removeEventListener() {},
      speak(u) {
        current = u
        window.__spoken.push({ text: u.text, rate: u.rate, lang: u.lang })
      },
      cancel() {
        const u = current
        current = null
        u?.onend?.()
      },
      pause() {},
      resume() {},
    }
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text
      }
    }
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition
    if (recognition) {
      window.SpeechRecognition = class {
        start() {
          window.__recLang = this.lang
          setTimeout(() => {
            this.onresult?.({ results: [[{ transcript: window.__heard }]] })
            this.onend?.()
          }, 50)
        }
        stop() {}
        abort() {}
      }
    }
  }, recognition)
}

const answer = (text) => ({ ok: true, data: { type: 'ANSWER', answer: text, askPharmacist: false } })

test('the mic fills the text box in the app language and does not send', async ({ page }) => {
  await fakeSpeech(page)
  let asked = 0
  await page.route('**/api/chat', (route) => (asked++, route.fulfill({ json: answer('ok') })))
  await page.goto('/ask')
  await page.getByRole('button', { name: 'BM' }).click()
  await page.evaluate(() => (window.__heard = 'Bila saya patut makan ubat ini'))
  await page.getByTestId('ask-mic').click()
  await expect(page.getByLabel('Atau taip soalan anda sendiri')).toHaveValue('Bila saya patut makan ubat ini')
  expect(await page.evaluate(() => window.__recLang)).toBe('ms-MY')
  expect(asked).toBe(0)
})

test('no mic button when the browser has no speech recognition', async ({ page }) => {
  await fakeSpeech(page, { recognition: false })
  await page.goto('/ask')
  await expect(page.getByLabel('Or type your own question')).toBeVisible()
  await expect(page.getByTestId('ask-mic')).toHaveCount(0)
})

test('every answer can be read aloud and stopped, at the saved speed', async ({ page }) => {
  await fakeSpeech(page)
  await page.addInitScript(() => localStorage.setItem('speechRate', '0.75'))
  const replies = [answer('First answer.'), answer('Second answer.')]
  await page.route('**/api/chat', (route) => route.fulfill({ json: replies.shift() }))
  await page.goto('/ask')
  await page.getByRole('button', { name: 'How do I store medicines?' }).click()
  await page.getByTestId('ask-follow').getByRole('button').first().click()
  await expect(page.getByTestId('ask-answer')).toHaveCount(2)

  const first = page.getByTestId('ask-answer').first()
  await first.getByRole('button', { name: 'Read aloud' }).click()
  await expect(first.getByRole('button', { name: 'Stop' })).toBeVisible()
  expect(await page.evaluate(() => window.__spoken)).toEqual([{ text: 'First answer.', rate: 0.75, lang: 'en-SG' }])
  await first.getByRole('button', { name: 'Stop' }).click()
  await expect(first.getByRole('button', { name: 'Read aloud' })).toBeVisible()
  await expect(page.getByTestId('ask-answer').nth(1).getByRole('button', { name: 'Read aloud' })).toBeVisible()
})

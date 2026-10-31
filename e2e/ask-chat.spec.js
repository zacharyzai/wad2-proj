// Ask page, the chat feel: what it says while waiting, the answer card appearing word by word, words lighting up as they're
// read aloud, "Say it in …", "Explain more simply", "Was this helpful?", the hello by name and "Latest answer".
// Answers are mocked in the browser (no AI quota).
import { test, expect } from './fixtures.js'

const answer = (text, extra = {}) => ({ ok: true, data: { type: 'ANSWER', answer: text, askPharmacist: false, ...extra } })

// Answers in turn; records what the page sent. `delay` holds each answer back (ms).
function mockChat(page, replies, delay = 0) {
  const sent = []
  page.route('**/api/chat', async (route) => {
    sent.push(route.request().postDataJSON())
    if (delay) await new Promise((r) => setTimeout(r, delay))
    route.fulfill({ json: replies.shift() ?? answer('ok') })
  })
  return sent
}

test('the empty page says hello by name, with the capsule waving', async ({ page }) => {
  await page.goto('/ask')
  await expect(page.getByTestId('ask-hello')).toHaveText(/^Good (morning|afternoon|evening), Tan Mei Ling!$/)
  await expect(page.locator('.intro svg.cb.cb-waving')).toBeVisible()
})

test('while waiting it says what it is doing, step by step, and the capsule thinks', async ({ page }) => {
  mockChat(page, [answer('Keep them dry.')], 2000)
  await page.goto('/ask')
  await page.getByRole('button', { name: 'How do I store medicines?' }).click()
  const wait = page.getByTestId('ask-loading')
  await expect(wait).toContainText('Thinking')
  await expect(page.locator('.reply .cb.cb-thinking')).toBeVisible()
  await expect(wait).toContainText('Looking this up…') // no medicines saved: a general look-up
  await expect(page.getByTestId('ask-answer')).toContainText('Keep them dry.')
})

test('the answer card: the first sentence leads, the rest follows, word by word; the next steps come once it has appeared', async ({ page }) => {
  mockChat(page, [answer('Take it after food. This helps your stomach, and it works best with a meal every day.')])
  await page.goto('/ask')
  await page.getByRole('button', { name: 'How do I store medicines?' }).click()
  const card = page.getByTestId('ask-answer')
  await expect(card.locator('.ans-lead')).toHaveText('Take it after food.')
  await expect(card.locator('.ans-more')).toHaveText('This helps your stomach, and it works best with a meal every day.')
  await expect(card.locator('.w.wait')).toHaveCount(0) // all the words have appeared
  await expect(page.getByTestId('ask-quick')).toBeVisible()
  await expect(page.getByTestId('ask-follow')).toBeVisible()
})

test('reading aloud lights up the word being said', async ({ page }) => {
  // A device voice that reports each word, like Chrome and Safari do.
  await page.addInitScript(() => {
    let current = null
    const synth = { getVoices: () => [{ lang: 'en-SG', name: 'en' }], addEventListener() {}, speak: (u) => (current = u), cancel: () => current?.onend?.(), pause() {}, resume() {} }
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
    window.__say = (charIndex) => current.onboundary({ name: 'word', charIndex })
  })
  mockChat(page, [answer('Take it after food.')])
  await page.goto('/ask')
  await page.getByRole('button', { name: 'How do I store medicines?' }).click()
  const card = page.getByTestId('ask-answer')
  await card.getByRole('button', { name: 'Read aloud' }).click()
  await page.evaluate(() => window.__say(8)) // "after"
  await expect(card.locator('.w.said')).toHaveText('after')
  await expect(page.locator('.reply .cb.cb-speaking')).toBeVisible()
  await page.evaluate(() => window.__say(14)) // "food"
  await expect(card.locator('.w.said')).toHaveText('food')
  await card.getByRole('button', { name: 'Stop' }).click()
  await expect(card.locator('.w.said')).toHaveCount(0)
})

test('"Say it in 中文" asks the same question again, answered in Chinese', async ({ page }) => {
  const sent = mockChat(page, [answer('Keep them dry.'), answer('放在干燥的地方。')])
  await page.goto('/ask')
  await page.getByRole('button', { name: 'How do I store medicines?' }).click()
  await expect(page.getByTestId('ask-say-en')).toBeHidden() // not the language it is already in
  await page.getByTestId('ask-say-zh').click()
  await expect(page.getByTestId('ask-answer').nth(1)).toContainText('放在干燥的地方。')
  expect(sent[1]).toMatchObject({ question: 'How do I store medicines?', lang: 'zh' })
})

test('"Explain more simply" asks again with the last answer as context', async ({ page }) => {
  const sent = mockChat(page, [answer('Store below 25 degrees, away from light and moisture.'), answer('Keep them somewhere cool and dry.')])
  await page.goto('/ask')
  await page.getByRole('button', { name: 'How do I store medicines?' }).click()
  await page.getByTestId('ask-simpler').click()
  await expect(page.getByTestId('ask-answer').nth(1)).toContainText('Keep them somewhere cool and dry.')
  expect(sent[1].question).toBe('Please explain your last answer again in simpler words.')
  expect(sent[1].history).toEqual([{ q: 'How do I store medicines?', a: 'Store below 25 degrees, away from light and moisture.' }])
})

test('"Was this helpful?" marks the choice and answers kindly', async ({ page }) => {
  mockChat(page, [answer('Keep them dry.')])
  await page.goto('/ask')
  await page.getByRole('button', { name: 'How do I store medicines?' }).click()
  const no = page.getByTestId('ask-helpful-no')
  await no.click()
  await expect(no).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('ask-answer')).toContainText('Sorry about that. Try “Explain more simply”, or ask your pharmacist.')
  await page.getByTestId('ask-helpful-yes').click()
  await expect(no).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('ask-answer')).toContainText('Thank you!')
})

test('scrolled up in a long conversation, "Latest answer" brings the newest one back', async ({ page }) => {
  const long = 'Take one tablet in the morning after breakfast. '.repeat(8)
  mockChat(page, [answer(long), answer(long), answer('The newest answer.')])
  await page.goto('/ask')
  await page.getByRole('button', { name: 'How do I store medicines?' }).click()
  for (const n of [2, 3]) {
    await page.getByTestId('ask-follow').getByRole('button').first().click()
    await expect(page.getByTestId('ask-answer')).toHaveCount(n)
  }
  await expect(page.getByTestId('ask-answer').nth(2)).toContainText('The newest answer.')
  await page.evaluate(() => scrollTo(0, 0))
  const jump = page.getByTestId('ask-jump')
  await expect(jump).toBeVisible()
  await jump.click()
  await expect(page.locator('[data-reply="2"]')).toBeInViewport()
  await expect(jump).toBeHidden()
})

// Explain page: the quick check and the read-aloud player (replay, speed, other languages, no audio at all).
import { test, expect } from './fixtures.js'
import { switchLanguage } from './helpers/auth.js'
import { expectNoAxeViolations, expectSeniorFriendly, expectVisibleFocus, tabTo } from './helpers/checks.js'

// Fake device voices (en, zh, ms, ta unless `voices` says otherwise). window.__spoken records each reading.
function fakeSpeech(page, voices = ['en-SG', 'zh-CN', 'ms-MY', 'ta-IN']) {
  return page.addInitScript((voices) => {
    window.__spoken = []
    let current = null
    const synth = {
      getVoices: () => voices.map((lang) => ({ lang, name: lang })),
      addEventListener() {},
      removeEventListener() {},
      speak: (u) => window.__spoken.push({ text: u.text, rate: u.rate, lang: u.lang }) && (current = u),
      cancel: () => current?.onend?.(),
      pause() {},
      resume() {},
    }
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text
      }
    }
  }, voices)
}

async function explainSample(page, sample = 'med-1') {
  await page.goto(`/scan?sample=${sample}`)
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page).toHaveURL(/\/scan\/explain$/)
}

const spoken = (page) => page.evaluate(() => window.__spoken)

test('quick check: a wrong answer is corrected with the right dose, in digits', async ({ page }) => {
  await explainSample(page)
  await expect(page.getByRole('heading', { name: 'How many tablets each time?' })).toBeVisible()
  await page.getByRole('button', { name: '2 tablets', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Not quite' })).toHaveText('Not quite. It is 1 tablet each time.')
  await expect(page.getByRole('button', { name: '2 tablets', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('quick check: "Not sure" also gives the right answer, and a bill asks how much to pay', async ({ page }) => {
  await explainSample(page, 'bill-1')
  await expect(page.getByRole('heading', { name: 'How much do you need to pay?' })).toBeVisible()
  await page.getByRole('button', { name: 'Not sure' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'You pay' })).toHaveText('Not quite. You pay $14.00.')
  await page.getByRole('button', { name: '$14.00' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'You pay' })).toHaveText('Yes, that’s right. You pay $14.00.')
})

test('read-aloud: plays the explanation, replays it, and remembers the chosen speed after a reload @smoke', async ({ page }) => {
  await fakeSpeech(page)
  await explainSample(page)
  const player = page.getByRole('region', { name: 'Reading in English' })
  await player.getByRole('button', { name: '1.25×' }).click()
  await player.getByRole('button', { name: 'Read aloud' }).click()
  await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible()
  await player.getByRole('button', { name: 'Replay' }).click()
  const readings = await spoken(page)
  expect(readings).toHaveLength(2)
  expect(readings[0]).toMatchObject({ rate: 1.25, lang: 'en-SG' })
  expect(readings[0].text).toContain('Take 1 tablet, 2 times a day.')
  expect(readings[1].text).toBe(readings[0].text)

  await page.reload()
  await expect(page.getByRole('region', { name: 'Reading in English' }).getByRole('button', { name: '1.25×' })).toHaveAttribute('aria-pressed', 'true')
})

test('read-aloud in 中文: Chinese voice and words, dose numbers stay as digits @i18n', async ({ page }) => {
  await fakeSpeech(page)
  await explainSample(page)
  await switchLanguage(page, '中文')
  const player = page.getByRole('region', { name: '正在用中文朗读' })
  await player.getByRole('button', { name: '朗读' }).click()
  const [reading] = await spoken(page)
  expect(reading.lang).toBe('zh-CN')
  expect(reading.text).toMatch(/\p{Script=Han}/u)
  expect(reading.text).toMatch(/1.*2/) // 1 tablet, 2 times: digits, never 一 / 二
})

test('no voice on the device and no audio from the server: says so in plain words', async ({ page }) => {
  await fakeSpeech(page, []) // no device voice at all, so the server is asked for audio
  await page.route('**/api/tts', (route) => route.fulfill({ status: 503, json: { ok: false, error: { code: 'AI_UNAVAILABLE' } } }))
  await explainSample(page)
  await page.getByRole('button', { name: 'Read aloud' }).click()
  await expect(page.getByText('We couldn\'t play this aloud right now. Please try again in a moment.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Read aloud' })).toBeEnabled() // can try again
})

test('usable: big targets and text, no axe problems, quick check works by keyboard @a11y', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await explainSample(page)
  await expectSeniorFriendly(page)
  await expectNoAxeViolations(page)
  test.skip(isMobile, 'keyboard: desktop')
  const answer = page.getByRole('button', { name: '1 tablet', exact: true })
  await answer.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expectVisibleFocus(answer)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'that’s right' })).toHaveText('Yes, that’s right. 1 tablet each time.')
})

test('read-aloud works by keyboard: speed, play and replay all show focus and open with Enter @a11y', async ({ page }) => {
  await fakeSpeech(page)
  await explainSample(page)
  const player = page.getByRole('region', { name: 'Reading in English' })
  const speed = player.getByRole('button', { name: '1.25×' })
  await tabTo(page, speed)
  await expectVisibleFocus(speed)
  await page.keyboard.press('Enter')
  await expect(speed).toHaveAttribute('aria-pressed', 'true')
  const play = player.getByRole('button', { name: 'Read aloud' })
  await tabTo(page, play)
  await expectVisibleFocus(play)
  await page.keyboard.press('Enter')
  await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible()
  const replay = player.getByRole('button', { name: 'Replay' })
  await tabTo(page, replay)
  await expectVisibleFocus(replay)
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await spoken(page)).length).toBe(2)
  expect((await spoken(page))[0].rate).toBe(1.25)
})

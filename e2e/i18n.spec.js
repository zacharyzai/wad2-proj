// Every main page in all four languages: no missing or fallen-back translations, no sideways scroll (long Tamil words).
import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures.js'

const LANGS = ['en', 'zh', 'ms', 'ta']
const PAGES = [
  '/',
  '/scan',
  '/scan?sample=med-1',
  '/schedule',
  '/bill',
  '/history',
  '/ask',
  '/account',
  '/no-such-page',
]
// The first heading must be in the language's own script (Malay shares English letters, so it is not checked this way).
const SCRIPT = { zh: /\p{Script=Han}/u, ta: /\p{Script=Tamil}/u }

const keys = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`],
  )
const keysOf = (lang) =>
  keys(
    JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url))),
  ).sort()

test('all four language files have the same keys, none left empty @i18n @smoke', async ({
  isMobile,
}) => {
  test.skip(isMobile, 'reads files, no browser needed')
  const en = keysOf('en')
  for (const lang of ['zh', 'ms', 'ta']) expect(keysOf(lang), lang).toEqual(en)
  for (const lang of LANGS) {
    const empty = []
    const walk = (o, p = '') =>
      Object.entries(o).forEach(([k, v]) =>
        typeof v === 'object' ? walk(v, `${p}${k}.`) : !String(v).trim() && empty.push(p + k),
      )
    walk(JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url))))
    expect(empty, lang).toEqual([])
  }
})

for (const lang of LANGS) {
  test(`${lang}: every main page is fully translated and fits the screen @i18n`, async ({
    page,
  }) => {
    const warnings = []
    page.on(
      'console',
      (m) => /\[intlify\] (Not found '|Fall back)/.test(m.text()) && warnings.push(m.text()),
    )
    await page.addInitScript((lang) => localStorage.setItem('locale', lang), lang)
    for (const path of PAGES) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('lang', lang)
      const heading = page.getByRole('heading', { level: 1 }).first()
      await expect(heading).toBeVisible()
      if (SCRIPT[lang]) await expect(heading, path).toHaveText(SCRIPT[lang])
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        `${path} scrolls sideways`,
      ).toBeLessThanOrEqual(0)
    }
    expect(warnings).toEqual([])
  })
}

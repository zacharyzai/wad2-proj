// Shared checks for the newer specs: axe (WCAG A/AA) and the senior-friendly layout rules.
import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'

export async function expectNoAxeViolations(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([])
}

// The same page in day and night colours, keeping whatever is open. The device's dark setting is not enough (theme.js):
// night mode is an account choice, so this sets the theme the app itself would set.
export async function expectNoAxeViolationsDayAndNight(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' }) // no colours part-way through a fade
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    await nextFrames(page, 5)
    await expectNoAxeViolations(page)
  }
}

// No sideways scroll, every tap target at least 44x44px, every piece of text at least 16px (inside `root`).
// `skip` leaves out elements these rules don't fit (a CSS selector); say why at the call.
export async function expectSeniorFriendly(page, root = 'main', skip = null) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  const problems = await page.locator(root).evaluate((el, skip) => {
    const shown = (e) => e.offsetWidth > 1 && e.offsetHeight > 1 && !(skip && e.matches(skip))
    const targets = [...el.querySelectorAll('button, a, select, input:not([type=radio]):not([type=checkbox])')].filter(shown)
    // 43.5: layout lands on fractions of a pixel
    const tooSmall = targets.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5 }).map((e) => e.outerHTML.slice(0, 80))
    const texts = [...el.querySelectorAll('*')].filter((e) => shown(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    const tinyText = texts.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.outerHTML.slice(0, 80))
    return { tooSmall, tinyText }
  }, skip)
  expect(problems).toEqual({ tooSmall: [], tinyText: [] })
}

// For "nothing happens" checks, which have no condition to wait on: lets the page draw this many frames first.
export async function nextFrames(page, count = 20) {
  await page.evaluate((n) => new Promise((done) => { const step = () => (n-- > 0 ? requestAnimationFrame(step) : done()); step() }), count)
}

// Arrives on `locator` with the Tab key: browsers only draw the focus ring for keyboard users, so .focus() after a click won't.
export async function tabTo(page, locator) {
  await locator.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
}

// The focused element shows a focus ring (outline or box-shadow).
export async function expectVisibleFocus(locator) {
  await expect(locator).toBeFocused()
  const ring = await locator.evaluate((e) => {
    const s = getComputedStyle(e)
    return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'
  })
  expect(ring).toBe(true)
}

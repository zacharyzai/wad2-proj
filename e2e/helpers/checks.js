// Shared checks for the newer specs: axe (WCAG A/AA) and the senior-friendly layout rules.
import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'

export async function expectNoAxeViolations(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([])
}

// No sideways scroll, every tap target at least 44px tall, every piece of text at least 16px (inside `root`).
export async function expectSeniorFriendly(page, root = 'main') {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  const problems = await page.locator(root).evaluate((el) => {
    const shown = (e) => e.offsetWidth > 1 && e.offsetHeight > 1
    const targets = [...el.querySelectorAll('button, a, select, input:not([type=radio]):not([type=checkbox])')].filter(shown)
    // 43.5: layout lands on fractions of a pixel
    const tooSmall = targets.filter((e) => e.getBoundingClientRect().height < 43.5).map((e) => e.outerHTML.slice(0, 80))
    const texts = [...el.querySelectorAll('*')].filter((e) => shown(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    const tinyText = texts.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.outerHTML.slice(0, 80))
    return { tooSmall, tinyText }
  })
  expect(problems).toEqual({ tooSmall: [], tinyText: [] })
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

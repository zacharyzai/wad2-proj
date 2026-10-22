// Feature 4: bill breakdown + subsidy questionnaire. Samples only (bill-1, bill-2, bill-3), never real AI.
// Runs on desktop Chrome and iPhone 6 (playwright.config.js). Rules: src/rules/subsidies.js.
import { test, expect } from './fixtures.js'
import AxeBuilder from '@axe-core/playwright'
import { DEMO_USER, signIn } from './helpers/auth.js'

const BEDOK = 'Bedok: doctor visit and medicine' // bill-1
const TAMPINES = 'Tampines: blood tests and MediSave' // bill-2
const MARINE_PARADE = 'Marine Parade: wound dressing, Merdeka Generation' // bill-3

async function openSample(page, name) {
  await page.goto('/bill')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { name: 'Check other subsidies' })).toBeVisible()
}

// A bill line's button is named "<description> <category> <amount>".
const line = (page, name) => page.getByRole('button', { name: new RegExp(name) })
// Substring match: the big amount is its own block, so the heading reads "You pay $14.00 ." with a space.
const youPay = (page, text) => page.getByRole('heading', { level: 2, name: text })
const rule = (page, id) => page.locator(`[data-rule="${id}"]`)
const upToDate = (page) => page.getByRole('status').filter({ hasText: 'Up to date' })

async function answer(page, { born, status, citizenYear }) {
  if (born !== undefined) await page.getByLabel('Year you were born').fill(born)
  if (status) await page.getByText(status, { exact: true }).click()
  if (citizenYear !== undefined) await page.getByLabel('Year you became a citizen').fill(citizenYear)
  // Results follow a moment after the last change.
  await expect(upToDate(page)).toBeVisible()
}

async function expectNoAxeViolations(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([])
}

test.describe('getting to a bill', () => {
  test('with no bill, offers the samples, a scan button and the scope note', async ({ page }) => {
    await page.goto('/bill')
    await expect(page.getByText('Works best for bills from Singapore polyclinics and GP clinics.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No bill to show yet' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Scan a bill' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Sample bill$/ })).toHaveCount(3)
  })

  test('a checked bill goes from Explain to the full breakdown', async ({ page }) => {
    await page.goto('/bill/scan')
    await page.getByRole('button', { name: 'Medical bill' }).click()
    await page.getByRole('button', { name: 'Looks correct' }).click()
    await page.getByRole('link', { name: 'See full breakdown' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bill breakdown')
    await expect(youPay(page, 'You pay $14.00')).toBeVisible()
  })

  test('an unchecked bill asks to be checked first (sidebar link)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The Bill link is in the desktop sidebar only; the phone tab bar keeps 4 tabs')
    await page.goto('/bill/scan')
    await page.getByRole('button', { name: 'Medical bill' }).click()
    // Wait for Confirm, or Scan would still move there after the sample arrives.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your bill items')
    await page.getByRole('link', { name: 'Bill', exact: true }).click()
    await expect(page.getByText('Please check the details of your bill first.')).toBeVisible()
    await page.getByRole('link', { name: 'Check my bill' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your bill items')
  })
})

test.describe('breakdown', () => {
  test('bill-1: doctor visit, medicine, government subsidy, no MediSave', async ({ page }) => {
    await openSample(page, BEDOK)
    await expect(youPay(page, 'You pay $14.00')).toBeVisible()
    await expect(page.getByText('SingHealth Polyclinics - Bedok')).toBeVisible()
    await expect(line(page, 'Consultation Doctor visit \\$14\\.50')).toBeVisible()
    await expect(line(page, 'Metformin 500mg x 60 Medicine \\$8\\.20')).toBeVisible()
    await expect(line(page, 'Government subsidy Subsidy −\\$8\\.70')).toBeVisible()
    await expect(line(page, 'MediSave From CPF MediSave −\\$0\\.00')).toBeVisible()
    await expect(page.getByTestId('bill-total')).toContainText('$14.00')
  })

  test('bill-2: two tests and a MediSave deduction', async ({ page }) => {
    await openSample(page, TAMPINES)
    await expect(youPay(page, 'You pay $16.70')).toBeVisible()
    await expect(line(page, 'Consultation Doctor visit \\$14\\.50')).toBeVisible()
    await expect(line(page, 'HbA1c blood test Tests \\$22\\.00')).toBeVisible()
    await expect(line(page, 'Lipid panel blood test Tests \\$18\\.00')).toBeVisible()
    await expect(line(page, 'Metformin 500mg x 60 Medicine \\$8\\.20')).toBeVisible()
    await expect(line(page, 'Government subsidy Subsidy −\\$21\\.00')).toBeVisible()
    await expect(line(page, 'MediSave From CPF MediSave −\\$25\\.00')).toBeVisible()
    await expect(page.getByTestId('bill-total')).toContainText('$16.70')
  })

  test('bill-3: treatment, other, and a Merdeka Generation subsidy', async ({ page }) => {
    await openSample(page, MARINE_PARADE)
    await expect(youPay(page, 'You pay $17.00')).toBeVisible()
    await expect(line(page, 'Amlodipine 5mg x 30 Medicine \\$4\\.50')).toBeVisible()
    await expect(line(page, 'Wound dressing Treatment \\$12\\.00')).toBeVisible()
    await expect(line(page, 'Dressing materials Other \\$3\\.00')).toBeVisible()
    await expect(line(page, 'Government subsidy Subsidy −\\$11\\.00')).toBeVisible()
    await expect(line(page, 'Merdeka Generation Subsidy −\\$6\\.00')).toBeVisible()
    await expect(page.getByTestId('bill-total')).toContainText('$17.00')
  })

  test('tapping a line opens its explanation with read-aloud, one at a time', async ({ page }) => {
    await openSample(page, TAMPINES)
    const tests = line(page, 'HbA1c blood test')
    const medisave = line(page, 'MediSave From CPF')
    await expect(tests).toHaveAttribute('aria-expanded', 'false')

    await tests.click()
    await expect(tests).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('These are tests that help the doctor check your health')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Reading in English' })).toHaveCount(1)

    await medisave.click()
    await expect(tests).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText('MediSave is your CPF savings for healthcare.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Reading in English' })).toHaveCount(1)

    await medisave.click()
    await expect(medisave).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('region', { name: 'Reading in English' })).toHaveCount(0)
  })

  test('lines open with the keyboard', async ({ page }) => {
    await openSample(page, MARINE_PARADE)
    const merdeka = line(page, 'Merdeka Generation Subsidy')
    await merdeka.focus()
    await page.keyboard.press('Enter')
    await expect(merdeka).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('The Merdeka Generation gets extra help with healthcare costs.')).toBeVisible()
  })

  test('labels follow the chosen language', async ({ page }) => {
    await openSample(page, BEDOK)
    await page.getByRole('button', { name: '中文' }).click()
    await expect(youPay(page, '您需要支付 $14.00')).toBeVisible()
    await expect(line(page, 'Consultation 看医生')).toBeVisible()
  })
})

test.describe('subsidy questionnaire', () => {
  // These test the questions themselves, so start from an account with no birth date or citizenship (nothing filled in).
  // Filling in from the account is tested in auth.spec.js.
  test.beforeEach(({ page }) => signIn(page, { ...DEMO_USER, dob: null, citizenship: null }))

  test('Pioneer Generation senior: estimate from the official 50%, live as you type', async ({ page }) => {
    await openSample(page, BEDOK)
    await expect(page.getByText('Answer the questions to see other schemes')).toBeVisible()

    await page.getByLabel('Year you were born').fill('1945')
    await expect(page.getByRole('status').filter({ hasText: 'Updating…' })).toBeVisible()
    await answer(page, { status: 'Yes, since I was born' })

    const pioneer = rule(page, 'pioneer')
    await expect(pioneer).toContainText('You may qualify')
    await expect(pioneer).toContainText('−$7.00') // 50% of ($22.70 − $8.70)
    await expect(pioneer.getByRole('link', { name: /Official page for Pioneer Generation/ })).toHaveAttribute('href', /moh\.gov\.sg/)
    // Date order follows the browser's English (21 October 2026 or October 21, 2026).
    await expect(pioneer).toContainText(/Last checked (21 October|October 21,) 2026/)
    await expect(page.getByTestId('estimate')).toContainText('$7.00')
    await expect(page.getByTestId('estimate')).toContainText('instead of $14.00.')
    // CHAS is shown, but it can't be used at a polyclinic, and has no amount.
    await expect(rule(page, 'chas')).toContainText('Not used at polyclinics')
    await expect(rule(page, 'merdeka')).toHaveCount(0)
  })

  test('Pioneer Generation senior with MediSave on the bill: compared with the bill after subsidies', async ({ page }) => {
    await openSample(page, TAMPINES)
    await answer(page, { born: '1945', status: 'Yes, since I was born' })
    await expect(rule(page, 'pioneer')).toContainText('−$20.85') // 50% of ($62.70 − $21.00)
    const estimate = page.getByTestId('estimate')
    await expect(estimate).toContainText('the bill after subsidies might be about')
    await expect(estimate.locator('strong')).toHaveText('$20.85')
    await expect(estimate).toContainText('instead of $41.70.')
    await expect(estimate).toContainText('MediSave may pay part of this')
    await expect(estimate).not.toContainText('$0.00')
  })

  test('Merdeka Generation senior: already on the bill, so it is matched, not offered again', async ({ page }) => {
    await openSample(page, MARINE_PARADE)
    await answer(page, { born: '1955', status: 'Yes, I became a citizen later', citizenYear: '1990' })

    const onBill = page.locator('.result').filter({ hasText: 'Merdeka Generation' }).first()
    await expect(onBill).toContainText('−$6.00')
    await expect(onBill).toContainText('Matches your answers')
    await expect(onBill).toContainText('Last checked')
    await expect(rule(page, 'merdeka')).toHaveCount(0)
    await expect(rule(page, 'pioneer')).toHaveCount(0)
    await expect(page.getByTestId('estimate')).toHaveCount(0)
  })

  test('not eligible: born 1985 gets no PG or MG and no estimate', async ({ page }) => {
    await openSample(page, BEDOK)
    await answer(page, { born: '1985', status: 'Yes, since I was born' })
    await expect(rule(page, 'pioneer')).toHaveCount(0)
    await expect(rule(page, 'merdeka')).toHaveCount(0)
    await expect(page.getByTestId('estimate')).toHaveCount(0)
  })

  test('without a confirmed figure: no amount, just the official link', async ({ page }) => {
    await openSample(page, BEDOK)
    await answer(page, { status: 'Yes, since I was born' })
    // No birth year yet: PG/MG can't be decided, so no number is shown.
    await expect(rule(page, 'pioneer')).toContainText('Answer more questions to check')
    await expect(rule(page, 'pioneer')).not.toContainText('−$')
    await expect(rule(page, 'pioneer').getByRole('link', { name: /Official page/ })).toBeVisible()
    await expect(page.getByTestId('estimate')).toHaveCount(0)
  })

  test('invalid years show plain errors next to the field', async ({ page }) => {
    await openSample(page, BEDOK)
    const born = page.getByLabel('Year you were born')

    await born.fill('1899')
    await expect(page.getByText('Please type a 4-digit year from 1901 to')).toBeVisible()
    await expect(born).toHaveAttribute('aria-invalid', 'true')
    await born.fill(String(new Date().getFullYear() + 1))
    await expect(page.getByText('Please type a 4-digit year from 1901 to')).toBeVisible()
    await born.fill('1955')
    await expect(page.getByText('Please type a 4-digit year from 1901 to')).toHaveCount(0)
    await expect(born).toHaveAttribute('aria-invalid', 'false')

    await page.getByText('Yes, I became a citizen later', { exact: true }).click()
    await page.getByLabel('Year you became a citizen').fill('1940')
    await expect(page.getByText('This year is before the year you were born.')).toBeVisible()
  })

  test('"Estimate only" notice links every official page', async ({ page }) => {
    await openSample(page, BEDOK)
    const notice = page.getByTestId('estimate-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('Estimate only — not an official calculation.')
    await expect(notice.getByRole('link')).toHaveCount(4)
    for (const link of await notice.getByRole('link').all()) {
      await expect(link).toHaveAttribute('href', /^https:\/\/(www\.)?(moh\.gov\.sg|chas\.sg)\//)
      await expect(link).toHaveAttribute('target', '_blank')
    }
  })

  test('answers stay in the browser: no request sent, nothing stored', async ({ page }) => {
    await openSample(page, BEDOK)
    const requests = []
    page.on('request', (request) => request.url().includes('/api/') && requests.push(request.url()))
    await answer(page, { born: '1945', status: 'Yes, I became a citizen later', citizenYear: '1970' })
    expect(requests).toEqual([])
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
    expect(stored).not.toContain('1945')
    expect(stored).not.toContain('1970')
  })
})

test.describe('layout and accessibility', () => {
  test('fits the screen: no sideways scroll, tap targets ≥ 48px, text ≥ 16px', async ({ page }) => {
    await openSample(page, TAMPINES)
    await line(page, 'HbA1c blood test').click()
    await answer(page, { born: '1945', status: 'Yes, since I was born' })

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

    const main = page.locator('main')
    const small = await main.evaluate((root) => {
      const shown = (el) => el.offsetWidth > 1 && el.offsetHeight > 1
      const targets = [...root.querySelectorAll('button, a, label.choice, input:not([type=radio])')].filter(shown)
      const tooSmall = targets.filter((el) => el.getBoundingClientRect().height < 48).map((el) => el.outerHTML.slice(0, 80))
      const texts = [...root.querySelectorAll('*')].filter((el) => shown(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      const tinyText = texts.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 80))
      return { tooSmall, tinyText }
    })
    expect(small).toEqual({ tooSmall: [], tinyText: [] })
  })

  for (const theme of ['light', 'dark']) {
    test(`no WCAG A/AA violations, line open and questionnaire filled (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await openSample(page, MARINE_PARADE)
      await line(page, 'Wound dressing').click()
      await answer(page, { born: '1945', status: 'Yes, since I was born' })
      await page.getByText('$1,500 or less', { exact: true }).click()
      await page.getByLabel('Year you were born').fill('1899') // include the error state
      await expect(page.getByText('Please type a 4-digit year')).toBeVisible()
      await expect(upToDate(page)).toBeVisible()
      await expectNoAxeViolations(page)
    })
  }
})

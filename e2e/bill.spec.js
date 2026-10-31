// Feature 4: bill breakdown + subsidies from the account (date of birth, citizenship). Samples only (bill-1 to bill-4), never real AI.
// Runs on desktop Chrome and iPhone 6 (playwright.config.js). Rules: src/rules/subsidies.js.
import { test, expect } from './fixtures.js'
import AxeBuilder from '@axe-core/playwright'
import { DEMO_USER, signIn, switchLanguage } from './helpers/auth.js'

const BEDOK = 'Bedok: doctor visit and medicine' // bill-1
const TAMPINES = 'Tampines: blood tests and MediSave' // bill-2
const MARINE_PARADE = 'Marine Parade: wound dressing, Merdeka Generation' // bill-3
const HOSPITAL = 'Hospital stay: ward, GST and MediShield Life' // bill-4

async function openSample(page, name) {
  await page.goto('/bill')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { name: 'What this means for you' })).toBeVisible()
}
// The subsidies are in a closed "Press here to see more" section.
async function openSubsidies(page) {
  await page.getByText('Press here to see more').click()
  await expect(page.getByTestId('subsidy-details')).toHaveAttribute('open', '')
}

// A bill line's button is named "<description> <category> <amount>".
const line = (page, name) => page.getByRole('button', { name: new RegExp(name) })
// Substring match: the big amount is its own block, so the heading reads "You pay $14.00 ." with a space.
const youPay = (page, text) => page.getByRole('heading', { level: 2, name: text })
const rule = (page, id) => page.locator(`[data-rule="${id}"]`)
// Log in as someone with this date of birth and citizenship (the Bill page checks subsidies from the account).
const as = (page, dob, citizenship, citizenSince = null) => signIn(page, { ...DEMO_USER, dob, citizenship, citizenSince })

async function expectNoAxeViolations(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([])
}

test.describe('getting to a bill', () => {
  test('with no bill, offers the samples, a scan button and the scope note', async ({ page }) => {
    await page.goto('/bill')
    await expect(page.getByText('Works with medical bills from Singapore clinics, hospitals, dental clinics and pharmacies.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No bill to show yet' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Scan a bill' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Sample bill$/ })).toHaveCount(4)
  })

  test('a checked bill goes from Explain to the full breakdown', async ({ page }) => {
    await page.goto('/bill/scan')
    await page.getByTestId('scan-examples').click() // samples sit behind "Try an example"
    await page.getByRole('button', { name: 'Medical bill' }).click()
    await page.getByRole('button', { name: 'Looks correct' }).click()
    await page.getByRole('link', { name: 'See full breakdown' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bill breakdown')
    await expect(youPay(page, 'You pay $14.00')).toBeVisible()
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
    await expect(line(page, 'MediSave From CPF MediSave \\$0\\.00')).toBeVisible() // nothing taken off: "$0.00", never "−$0.00"
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

  test('bill-4, a hospital stay: ward, GST and a MediShield Life claim; schemes shown as "may not apply here", never estimated', async ({ page }) => {
    await signIn(page, { ...DEMO_USER, dob: '1945-03-07' }) // a Pioneer
    await openSample(page, HOSPITAL)
    await expect(youPay(page, 'You pay $106.53')).toBeVisible()
    await expect(line(page, 'Daily Ward Charges .* Ward / room \\$140\\.00')).toBeVisible()
    await expect(line(page, 'GST 9% GST \\$87\\.12')).toBeVisible()
    await expect(line(page, 'Insurance \\(MediShield Life or other\\) Insurance −\\$150\\.00')).toBeVisible()
    await expect(page.getByText('Subsidies & insurance')).toBeVisible()
    await line(page, 'Daily Ward Charges').click()
    await expect(page.getByText('This is the charge for your hospital bed and room')).toBeVisible()
    await openSubsidies(page)
    await expect(page.getByTestId('estimate')).toHaveCount(0) // no official figure for a hospital stay
    await expect(rule(page, 'chas')).toContainText('May not apply at this kind of place.')
  })

  test('a bill with net lines: the subsidy inside them is shown, not taken off again', async ({ page }) => {
    // A checked scan of a Gross / Subsidy / Net hospital bill (as the server returns it).
    const bill = {
      clinic: 'Eastwater General Hospital', place: 'hospital', visitDate: '2026-10-15',
      items: [{ description: 'Surgery — Hemiarthroplasty', category: 'procedure', amountCents: 148750 }, { description: 'GST 9%', category: 'tax', amountCents: 13388 }],
      subsidies: [{ scheme: 'government', amountCents: 276250, includedInItems: true }, { scheme: 'merdeka', amountCents: 2138 }],
      medisaveCents: 60000,
      totalPayableCents: 100000,
    }
    await page.addInitScript(() => (window.__redactForTests = async (dataUrl) => ({ dataUrl, keep: [{ text: 'TOTAL' }], hits: [] })))
    await page.route('**/api/scan', (route) => route.fulfill({ json: { ok: true, data: { type: 'bill', source: 'ai', unclear: [], bill } } }))
    await page.goto('/bill/scan')
    await page.getByTestId('upload-input').setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') })
    await page.getByRole('button', { name: 'Scan', exact: true }).click()
    await expect(page.getByText('Already taken off the charges above')).toBeVisible() // on Confirm, next to the subsidy
    await page.getByRole('button', { name: 'Looks correct' }).click() // 1487.50 + 133.88 − 21.38 − 600.00 = 1000.00
    await page.getByRole('link', { name: /See full breakdown/ }).click()
    await expect(line(page, 'Government subsidy Already taken off the charges above \\$2,?762\\.50')).toBeVisible() // no minus
    await expect(page.getByText('Charges after subsidy')).toBeVisible()
    await expect(page.getByTestId('bill-total')).toContainText('$1000.00')
  })

  test('after the breakdown, Home is one tap away', async ({ page }) => {
    await openSample(page, BEDOK)
    await page.getByTestId('bill-home').click()
    await expect(page).toHaveURL(/\/$/)
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
    await switchLanguage(page, '中文')
    await expect(youPay(page, '您需要支付 $14.00')).toBeVisible()
    await expect(line(page, 'Consultation 看医生')).toBeVisible()
  })
})

test.describe('subsidies from the account', () => {
  test('Pioneer Generation senior: estimate from the official 50%, and the line saying which details were used', async ({ page }) => {
    await as(page, '1945-08-12', 'birth')
    await openSample(page, BEDOK)
    await openSubsidies(page)
    await expect(page.getByTestId('bill-basis')).toContainText('born 1945, Singapore citizen (by birth)')
    await expect(page.getByTestId('bill-basis').getByRole('link', { name: 'Change my details' })).toHaveAttribute('href', '/account')
    await expect(page.getByRole('heading', { name: 'Check other subsidies' })).toHaveCount(0) // no questions on this page

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
    await as(page, '1945-08-12', 'birth')
    await openSample(page, TAMPINES)
    await openSubsidies(page)
    await expect(rule(page, 'pioneer')).toContainText('−$20.85') // 50% of ($62.70 − $21.00)
    const estimate = page.getByTestId('estimate')
    await expect(estimate).toContainText('the bill after subsidies might be about')
    await expect(estimate.locator('strong')).toHaveText('$20.85')
    await expect(estimate).toContainText('instead of $41.70.')
    await expect(estimate).toContainText('MediSave may pay part of this')
    await expect(estimate).not.toContainText('$0.00')
  })

  test('Merdeka Generation senior (citizen since 1990): already on the bill, so it is matched, not offered again', async ({ page }) => {
    await as(page, '1955-03-21', 'became', 1990)
    await openSample(page, MARINE_PARADE)
    await openSubsidies(page)
    const onBill = page.locator('.result').filter({ hasText: 'Merdeka Generation' }).first()
    await expect(onBill).toContainText('−$6.00')
    await expect(onBill).toContainText('Matches your details')
    await expect(onBill).toContainText('Last checked')
    await expect(rule(page, 'merdeka')).toHaveCount(0)
    await expect(rule(page, 'pioneer')).toHaveCount(0)
    await expect(page.getByTestId('estimate')).toHaveCount(0)
  })

  test('born 1946, citizen only in 1990: missed Pioneer, so Merdeka instead', async ({ page }) => {
    await as(page, '1946-11-02', 'became', 1990)
    await openSample(page, BEDOK)
    await openSubsidies(page)
    await expect(rule(page, 'pioneer')).toHaveCount(0)
    await expect(rule(page, 'merdeka')).toContainText('You may qualify')
  })

  test('not eligible: a citizen born 1985 gets no PG or MG and no estimate; a PR gets no CHAS either', async ({ page }) => {
    await as(page, '1985-01-01', 'birth')
    await openSample(page, BEDOK)
    await openSubsidies(page)
    await expect(rule(page, 'pioneer')).toHaveCount(0)
    await expect(rule(page, 'merdeka')).toHaveCount(0)
    await expect(page.getByTestId('estimate')).toHaveCount(0)

    await as(page, '1958-01-30', 'pr')
    await openSample(page, BEDOK)
    await openSubsidies(page)
    await expect(page.getByTestId('bill-basis')).toContainText('Singapore permanent resident (PR)')
    for (const id of ['pioneer', 'merdeka', 'chas']) await expect(rule(page, id)).toHaveCount(0)
  })

  test('"Estimate only" notice links every official page', async ({ page }) => {
    await openSample(page, BEDOK)
    await openSubsidies(page)
    const notice = page.getByTestId('estimate-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('Estimate only — not an official calculation.')
    await expect(notice.getByRole('link')).toHaveCount(4)
    for (const link of await notice.getByRole('link').all()) {
      await expect(link).toHaveAttribute('href', /^https:\/\/(www\.)?(moh\.gov\.sg|chas\.sg)\//)
      await expect(link).toHaveAttribute('target', '_blank')
    }
  })
})

test('the subsidies start closed and open with one tap on "Press here to see more"', async ({ page }) => {
  await openSample(page, BEDOK)
  const details = page.getByTestId('subsidy-details')
  await expect(details).not.toHaveAttribute('open')
  await expect(page.getByTestId('estimate-notice')).toBeHidden()
  await openSubsidies(page)
  await expect(page.getByTestId('estimate-notice')).toBeVisible()
  await page.getByText('Press here to hide').click()
  await expect(page.getByTestId('estimate-notice')).toBeHidden()
})

test.describe('getting back', () => {
  test('a sample opened here: Back and "Close this bill" return to the list of bills', async ({ page }) => {
    await openSample(page, BEDOK)
    await page.getByTestId('bill-back').click()
    await expect(page.getByRole('heading', { name: 'No bill to show yet' })).toBeVisible()
    await openSample(page, TAMPINES)
    await page.getByTestId('bill-done').click()
    await expect(page.getByRole('heading', { name: 'No bill to show yet' })).toBeVisible()
    await expect(page).toHaveURL(/\/bill$/)
  })

  test('from Explain (See full breakdown): Back returns to the explanation', async ({ page }) => {
    await page.goto('/bill/scan')
    await page.getByTestId('scan-examples').click() // samples sit behind "Try an example"
    await page.getByRole('button', { name: 'Medical bill' }).click()
    await page.getByRole('button', { name: 'Looks correct' }).click()
    await page.getByRole('link', { name: 'See full breakdown' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bill breakdown')
    await page.getByTestId('bill-back').click()
    await expect(page).toHaveURL(/\/scan\/explain$/)
  })

  test('Back to top, and Back from Account', async ({ page }) => {
    await openSample(page, TAMPINES)
    await page.getByTestId('bill-top').click()
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()

    await page.goto('/account')
    await page.getByRole('link', { name: 'Back' }).click()
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe('layout and accessibility', () => {
  test('fits the screen: no sideways scroll, tap targets ≥ 48px, text ≥ 16px', async ({ page }) => {
    await openSample(page, TAMPINES)
    await openSubsidies(page)
    await line(page, 'HbA1c blood test').click()

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

    const main = page.locator('main')
    const small = await main.evaluate((root) => {
      const shown = (el) => el.offsetWidth > 1 && el.offsetHeight > 1
      const targets = [...root.querySelectorAll('button, a, label.choice, input:not([type=radio])')].filter(shown)
      // 47.5: layout lands on fractions of a pixel, so a 48px button can measure 47.99
      const tooSmall = targets.filter((el) => el.getBoundingClientRect().height < 47.5).map((el) => el.outerHTML.slice(0, 80))
      const texts = [...root.querySelectorAll('*')].filter((el) => shown(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      const tinyText = texts.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 80))
      return { tooSmall, tinyText }
    })
    expect(small).toEqual({ tooSmall: [], tinyText: [] })
  })

  for (const theme of ['light', 'dark']) {
    test(`no WCAG A/AA violations, line open and a Pioneer senior's subsidies showing (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await as(page, '1945-08-12', 'birth')
      await openSample(page, MARINE_PARADE)
      await openSubsidies(page)
      await line(page, 'Wound dressing').click()
      await page.waitForLoadState('networkidle')
      await expectNoAxeViolations(page)
    })
  }
})

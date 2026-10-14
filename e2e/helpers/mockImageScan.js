// Photo scans never reach the API in e2e: they'd use rate-limit budget (and Gemini quota if USE_MOCK_AI=false).
// Checks the client sent a compressed JPEG, then answers with the Metformin sample.
import { expect } from '@playwright/test'

export async function mockImageScan(page) {
  await page.route('**/api/scan', async (route) => {
    const body = route.request().postDataJSON()
    if (body.sampleId) return route.continue()
    expect(body.type).toBe('medication')
    expect(body.image).toMatch(/^data:image\/jpeg;base64,/)
    const sample = await route.fetch({ postData: JSON.stringify({ sampleId: 'med-1' }) })
    const json = await sample.json()
    await route.fulfill({ json: { ok: true, data: { ...json.data, source: 'mock' } } })
  })
}

// @vitest-environment jsdom
// Component test (Week 10, @vue/test-utils): ScanPages only shows the pages and emits; ScanView does the work.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../i18n/locales/en.json'
import ScanPages from './ScanPages.vue'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const shot = (id, problem = null) => ({
  id,
  src: 'data:image/jpeg;base64,AAA',
  problem,
  anyway: false,
})
const mountWith = (shots) =>
  mount(ScanPages, { props: { shots, max: 5 }, global: { plugins: [i18n] } })

describe('ScanPages', () => {
  it('emits retake with the page index', async () => {
    const wrapper = mountWith([shot(1), shot(2)])
    await wrapper.findAll('[data-testid="scan-page-retake"]')[1].trigger('click')
    expect(wrapper.emitted('retake')).toEqual([[1]])
  })

  it('keeps Done disabled while a page is blurry, and says which page', () => {
    const wrapper = mountWith([shot(1), shot(2, 'blurry')])
    expect(wrapper.get('[data-testid="scan-pages-done"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('#fix-first').text()).toContain('2')
  })
})

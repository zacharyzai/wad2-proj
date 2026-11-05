import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // Dev only: forward API calls to Express so client code always uses relative /api URLs.
    proxy: { '/api': 'http://localhost:3000' },
  },
  // Vitest (Week 10): unit, component (*.test.js with `// @vitest-environment jsdom`) and API integration tests. Playwright runs e2e/*.spec.js.
  test: {
    include: ['tests/**/*.test.js', 'server/test/**/*.test.js'],
    restoreMocks: true, // vi.spyOn(...) is undone after each test
  },
})

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // Dev only: forward API calls to Express so client code always uses relative /api URLs.
    proxy: { '/api': 'http://localhost:3000' },
  },
  // Vitest (Week 10): unit tests only. Playwright runs the e2e/*.spec.js files.
  test: {
    include: ['src/**/*.test.js', 'server/test/**/*.test.js'],
    restoreMocks: true, // vi.spyOn(...) is undone after each test
  },
})

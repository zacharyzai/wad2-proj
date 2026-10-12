import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // Dev only: forward API calls to Express so client code always uses relative /api URLs.
    proxy: { '/api': 'http://localhost:3000' },
  },
})

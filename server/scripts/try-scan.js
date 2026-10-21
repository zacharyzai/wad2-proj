// Try the real Gemini extraction on a photo, no frontend needed. Uses your daily quota.
// Usage: pnpm try:scan medication path/to/label.jpg
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { extractScan } from '../services/gemini.js'

const [type, file] = process.argv.slice(2)
const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extname(file ?? '').toLowerCase()]
if (!['medication', 'bill'].includes(type) || !mime) {
  console.error('Usage: pnpm try:scan <medication|bill> <photo.jpg|png|webp>')
  process.exit(1)
}

const image = `data:${mime};base64,${(await readFile(file)).toString('base64')}`
try {
  console.log(JSON.stringify(await extractScan(type, image), null, 2))
} catch (err) {
  console.error(err.code ?? 'ERROR', err.message)
  process.exit(1)
}

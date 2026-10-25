// Vercel entry: every /api/* request runs the same Express app as `pnpm server` (vercel.json sends them here).
// Locally, server/index.js starts it with app.listen instead.
import app from '../server/app.js'

export default app

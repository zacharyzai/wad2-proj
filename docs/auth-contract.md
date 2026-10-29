# Auth contract

Owner: **Sheen Hern** (first version built by Claude, declared in README.txt). Every feature needs an account; only the welcome, login, signup, share-link and 404 pages are open.

Code: `server/routes/auth.js`, `server/models/User.js`, `server/services/auth.js` (hashing + tokens), `server/middleware/requireAuth.js`. Client: `src/stores/auth.js`.

## Setup

`.env` needs `MONGODB_URI` and `JWT_SECRET` (a long random string: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`). Without `JWT_SECRET` the server refuses to sign or check tokens. Without `MONGODB_URI`, signup and login answer `503`.

## Endpoints

All answers use the usual envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

| Method | Path | Body | Answer |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ name, email, password, dob, citizenship, citizenSince, income, remember, language, theme, role? }` | `{ token, user }` · `400 BAD_REQUEST` · `409 EMAIL_TAKEN` |
| POST | `/api/auth/login` | `{ email, password, remember }` | `{ token, user }` · `401 WRONG_LOGIN` (same for unknown email and wrong password) |
| GET | `/api/auth/me` | (token) | `{ user }`, plus a fresh `token` when the login is remembered · `401 NOT_LOGGED_IN` |
| POST | `/api/auth/forgot` | `{ email, language? }` | `{ minutes: 30 }`, the same whether or not an account uses the email · `400` · `429 RATE_LIMITED` · `503 MAIL_UNAVAILABLE` |
| POST | `/api/auth/reset` | `{ token, password, remember }` | `{ token, user }`, like login · `400 BAD_REQUEST` (password) · `400 RESET_LINK_INVALID` (expired, used or forged) |
| PATCH | `/api/auth/me` | `{ name, dob, citizenship, citizenSince, income, language?, theme? }`, or `{ language }` / `{ theme }` alone | `{ user }` · `400` · `401` |

- `user` = `{ name, email, role, dob, citizenship, citizenSince, income, language, theme }`. The password hash never leaves the server.
- `role` is `senior` or `caregiver`, chosen at signup, defaulting to `senior` when omitted. Existing accounts with no stored role also read as `senior`. Role is returned at signup/login/me and cannot be changed through profile PATCH. Caregiver permissions are checked against the database role, not browser state or JWT role claims. See [care-contract.md](care-contract.md).
- `dob`: `'YYYY-MM-DD'`, a real date from 1900 to today.
- `citizenship`: `birth` (citizen by birth), `became` (citizen later; `citizenSince` = the year, from the birth year to this year), `pr`, `other`. These are the subsidy questionnaire's values, so the Bill page uses them directly.
- Passwords: 8 to 200 characters, stored as a salted Argon2id hash. Existing scrypt hashes remain accepted.
- Failed logins and signups are rate limited per IP (`AUTH_RATE_LIMIT`, default 10 per 15 minutes).

## Tokens

Send `Authorization: Bearer <token>` (`src/api/client.js` does this). `/api/scan` and `/api/chat` refuse requests without a valid token (`401 NOT_LOGGED_IN`).

- **Remember me** (default): token valid 30 days, kept in `localStorage`. Every visit (`GET /me`) returns a new 30-day token, so people who use the app at least once a month never log in again.
- **Not remembered**: valid 12 hours, kept in `sessionStorage`, so closing the browser logs out.
- New tokens are standard HS256 JWTs signed with `JWT_SECRET`, including issuer and audience validation. The secret must be at least 32 bytes. Unexpired seven-day JWTs and two-part signed tokens from previous implementations remain accepted. Changing the secret logs everyone out.

Changing the password (a reset) ends every login made before it: `User.passwordChangedAt` (to the whole second) is checked by `requireAuth` on every protected route, so other devices get `401 NOT_LOGGED_IN`. Only checked for real accounts while the database is reachable (sample scans and the e2e tests run without one; during an outage the app keeps working). shortcut: logging out still only deletes the token on that device.

## Forgot your password?

Code: `server/routes/auth.js` (`/forgot`, `/reset`), `server/services/auth.js` (reset links), `server/services/mail.js` (sending), `server/services/resetEmail.js` (the email, 4 languages), `server/models/PasswordResetQuota.js`. Client: `src/views/ForgotView.vue`, `src/views/ResetView.vue`.

1. **Log in → Forgot your password?** (`/forgot`, the typed email carried over in the history state, never the address). `POST /forgot` answers the same whether or not an account uses the email, so the form can't reveal who has an account. A real account gets an email in its language (or the one in use, if it hasn't chosen), sent before answering (Vercel may stop the function once it answers).
2. **The email** links to `APP_URL/reset#token=…`. The token is after `#`, so browsers never send it to a server; the reset page reads it and removes it from the address.
3. **`/reset`**: one new password (8 to 200 characters, show/hide). `POST /reset` saves it, sets `passwordChangedAt` (every other device logged out) and logs this device in.

- **Reset links** are signed like logins but for their own audience (`ah-ma-ah-gong-can:password-reset`), so neither is accepted as the other. Nothing is stored: a link carries a fingerprint of the password hash it was made for (HMAC with `JWT_SECRET`), so it stops working once the password changes. Each link works once, for 30 minutes; using one also ends any older unused link. The save only happens if the password is still the one the link was made for, so a link pressed twice changes it once.
- **Limits:** 3 emails per address per hour (MongoDB, shared by all instances; stored as a SHA-256 of the address, never the address; rows delete themselves), 10 forgot requests per IP per hour (`FORGOT_RATE_LIMIT`) and 20 reset tries per IP per 15 minutes (`RESET_RATE_LIMIT`).
- **Settings:** `APP_URL` (the site's address; required on the live site, defaults to `http://localhost:5173` locally; links never use the request's Host header) and `MAIL_PROVIDER`. `console` (default) prints the email in the server terminal; on Vercel or in production it never prints the link or the address, and sends nothing. `brevo` or `resend` send it through that service's web API (no extra packages), with `MAIL_API_KEY` and `MAIL_FROM` (`Name <address>`, verified with the service). Brevo can send from one verified address without owning a domain; Resend needs a verified domain to email anyone but yourself. Failures are logged without the address or link, and the page says to try again later (`503 MAIL_UNAVAILABLE`).
- shortcut: a real account answers slightly later than an unknown one (the email is sent first). Translations of the email to be checked by native speakers.

## Tests

`server/test/auth.test.js` (no database) and `server/test/auth.integration.test.js` (disposable MongoDB). E2E tests sign a token with the test secret in `playwright.config.js` and mock `/api/auth/*` (`e2e/helpers/auth.js`); start each test logged out with `test.use({ loggedIn: false })`. `e2e/auth-api.spec.js` exercises the real profile signup, Account editing, Remember me and protected scan flow, and a full password reset (reading the console mailer), against a disposable MongoDB. `server/test/mail.test.js` covers the email and links; `e2e/forgot.spec.js` the Forgot and Reset pages. See [auth.md](auth.md) for Atlas/local setup and migration details.

## App language

`user.language` is `en`, `zh`, `ms`, `ta`, or `null` (accounts from before this field). Signup saves the language in use (picked on the welcome page or above the form). On login and every visit the app switches to the account's language; a `null` account gets the device's current language saved. Changing the language anywhere while logged in (sidebar, phone header, Account page) sends `PATCH /api/auth/me { language }`. The Account page shows "Settings saved" after each save.

## Day / night mode

`user.theme` is `light` (day), `dark` (night), `system` (follow the phone or computer's own setting), or `null` (not chosen yet). New visitors start in day mode, whatever the device is set to. Sign up doesn't ask: an account whose theme is `null` is asked once on Home (or Scan), before the Beginner's guide (`ThemePrompt.vue`), and the Account page changes it any time; both send `PATCH /api/auth/me { theme }`. On login and every visit the app uses the account's theme. Signup still accepts an optional `theme`. The device also remembers it (`localStorage.theme`), so the login page and the first paint use it before the account is known.

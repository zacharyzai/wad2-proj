# Auth contract

Owner: **Sheen Hern** (first version built by Claude, declared in README.txt). Every feature needs an account; only the welcome, login, signup, share-link and 404 pages are open.

Code: `server/routes/auth.js`, `server/models/User.js`, `server/services/auth.js` (hashing + tokens), `server/middleware/requireAuth.js`. Client: `src/stores/auth.js`.

## Setup

`.env` needs `MONGODB_URI` and `JWT_SECRET` (a long random string: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`). Without `JWT_SECRET` the server refuses to sign or check tokens. Without `MONGODB_URI`, signup and login answer `503`.

## Endpoints

All answers use the usual envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

| Method | Path | Body | Answer |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ name, email, password, dob, citizenship, citizenSince, income, remember }` | `{ token, user }` · `400 BAD_REQUEST` · `409 EMAIL_TAKEN` |
| POST | `/api/auth/login` | `{ email, password, remember }` | `{ token, user }` · `401 WRONG_LOGIN` (same for unknown email and wrong password) |
| GET | `/api/auth/me` | (token) | `{ user }`, plus a fresh `token` when the login is remembered · `401 NOT_LOGGED_IN` |
| PATCH | `/api/auth/me` | `{ name, dob, citizenship, citizenSince, income }` | `{ user }` · `400` · `401` |

- `user` = `{ name, email, dob, citizenship, citizenSince, income }`. The password hash never leaves the server.
- `dob`: `'YYYY-MM-DD'`, a real date from 1900 to today.
- `citizenship`: `birth` (citizen by birth), `became` (citizen later; `citizenSince` = the year, from the birth year to this year), `pr`, `other`. These are the subsidy questionnaire's values, so the Bill page uses them directly.
- Passwords: 8 to 200 characters, stored as a salted Argon2id hash. Existing scrypt hashes remain accepted.
- Failed logins and signups are rate limited per IP (`AUTH_RATE_LIMIT`, default 10 per 15 minutes).

## Tokens

Send `Authorization: Bearer <token>` (`src/api/client.js` does this). `/api/scan` and `/api/chat` refuse requests without a valid token (`401 NOT_LOGGED_IN`).

- **Remember me** (default): token valid 30 days, kept in `localStorage`. Every visit (`GET /me`) returns a new 30-day token, so people who use the app at least once a month never log in again.
- **Not remembered**: valid 12 hours, kept in `sessionStorage`, so closing the browser logs out.
- New tokens are standard HS256 JWTs signed with `JWT_SECRET`, including issuer and audience validation. The secret must be at least 32 bytes. Unexpired seven-day JWTs and two-part signed tokens from previous implementations remain accepted. Changing the secret logs everyone out.

shortcut: logging out only deletes the token on that device; a copied token stays valid until it expires. Add a server-side token list if "log out everywhere" is ever needed.

## Tests

`server/test/auth.test.js` (no database) and `server/test/auth.integration.test.js` (disposable MongoDB). E2E tests sign a token with the test secret in `playwright.config.js` and mock `/api/auth/*` (`e2e/helpers/auth.js`); start each test logged out with `test.use({ loggedIn: false })`. `e2e/auth-api.spec.js` exercises the real profile signup, Account editing, Remember me and protected scan flow against a disposable MongoDB. See [auth.md](auth.md) for Atlas/local setup and migration details.

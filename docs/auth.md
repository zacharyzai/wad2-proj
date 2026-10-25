# MongoDB and authentication setup

The current API and UI contract is [auth-contract.md](auth-contract.md): profile signup, Account editing, 30-day remembered sessions and 12-hour non-remembered sessions. This replaces the initial email/password-only signup contract. The eight-character password minimum remains enforced on the server.

## Shared Atlas

Follow [atlas.md](atlas.md). Use pnpm 12.3.4, the version pinned in `package.json`:

```sh
pnpm install
pnpm atlas:configure
pnpm db:check
pnpm server
# In a second terminal:
pnpm dev
```

Open http://localhost:5173/signup to create a sample account. `atlas:configure` securely prompts for the database password and preserves other settings in your ignored `.env`. `db:check` checks the signing secret, connects, pings MongoDB and initializes the unique email index without creating sample accounts.

## Local MongoDB

Run `pnpm server:local` instead of `pnpm server` for isolated manual testing. It downloads and starts a real MongoDB binary on `127.0.0.1:27017`, then starts the API on port 3000. The first download needs internet access. Accounts persist in `.local/mongodb`; a generated signing secret persists in `.local/jwt-secret`. Both paths are ignored by Git.

The launcher overrides the Atlas URI and JWT secret only for its own process. It does not edit `.env`. Stop it with Ctrl+C before starting another API on port 3000. Deleting `.local` deletes local accounts and invalidates their tokens. This launcher is for development, not deployment.

## Existing accounts and sessions

- Existing Argon2id password hashes in Atlas remain usable; existing main-branch scrypt hashes also remain usable. New passwords use Argon2id.
- Old email-only accounts can log in. Missing profile fields are returned empty rather than invented; complete them through Account > Edit before relying on account-based subsidy estimates.
- Unexpired seven-day JWTs from the first auth implementation remain usable until expiry. They are not converted into remembered sessions.
- Unexpired two-part signed tokens issued by the earlier main implementation also remain usable. New tokens are standard HS256 JWTs, with issuer, audience, user ID, expiry and Remember me claims.
- New remembered logins last 30 days and renew on `/me`; other logins last 12 hours, matching the current main UI. Changing `JWT_SECRET` invalidates all tokens signed with the old secret.

The database connection is lazy and retryable. A valid auth request connects and waits for the unique email index before accepting signups. Database errors return a JSON 503 without connection strings or driver error details. Every auth response is marked `Cache-Control: no-store`.

## Verification

```sh
pnpm test:api
pnpm test:e2e
pnpm build
```

Stop the normal API before browser tests: Playwright starts its own API with a test-only signing secret. `server/test/auth.integration.test.js` and `e2e/auth-api.spec.js` use disposable real MongoDB instances and never use Atlas or local development accounts. They verify account profiles, editing, Remember me, session restoration, protected scan/chat access, duplicate emails and compatibility with existing hashes and tokens.

If your globally installed pnpm is older, use `npx --yes pnpm@12.3.4 <command>` to run the pinned version without changing your global installation. Keep only `pnpm-lock.yaml`; do not run `npm install` in this repository.

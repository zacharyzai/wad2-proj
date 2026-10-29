# Caregiver invitations and account linking

Owner: Sheen Hern (backend); Isaac (signup, Account and caregiver pages). This PR implements invitations and account linking only. The later data-access PR supplies schedule/dose/scan read endpoints after agreeing the exact access scope and consent wording.

## Rules

- **One senior has at most one caregiver. One caregiver may link to multiple seniors.**
- A senior creates a private invitation link and sends it to the intended caregiver. No email/message is sent by this backend. The public app route is `/shared/<token>` (already built by Isaac), not `/api/share`.
- The recipient opens the link, signs up with `role: caregiver` or logs into an existing caregiver account, returns to the link and explicitly accepts. Creating an account alone does not accept an invitation. Login/signup use `next=/shared/<token>` to preserve the destination.
- A senior account cannot accept an invite, and a caregiver account cannot issue one. Accounts have one role for now, consistent with the existing signup UI. Existing accounts without a stored role count as seniors; prior caregiver choices that the old backend ignored cannot be recovered automatically. Create a caregiver account for that case; no silent promotion is performed.
- Only the senior or their linked caregiver can remove the relationship. A replacement requires removing the active link and issuing a new invitation. Removed caregivers have no link for future data access checks.
- If the caregiver account has been deleted, it is omitted from relationship responses and creating a new invite releases that stale slot. A deleted account cannot keep a senior permanently blocked.
- Anyone with the invite secret and a caregiver account can claim it; invitations are not bound to an email address. Share only with the intended person. Public preview discloses just the senior's display name and expiry, never profile/contact/health data.

## Endpoints

Responses use `{ ok: true, data }` or `{ ok: false, error: { code, message } }`; route responses use `Cache-Control: no-store`. All endpoints except preview require a signed bearer token and an account that still exists. Roles are loaded from MongoDB on each request.

| Method | Path | Role | Success `data` |
| --- | --- | --- | --- |
| POST | `/api/care/invites` | senior | 201, `{ token, expiresAt }` |
| GET | `/api/care/invites/:token` | public | 200, `{ senior: { name }, expiresAt }` |
| POST | `/api/care/invites/:token/accept` | caregiver | 200, `{ seniorId }` |
| DELETE | `/api/care/invites` | senior | 200, `{ revoked: boolean }` (cancel pending invitation only) |
| GET | `/api/care/caregivers` | senior | 200, `{ caregivers: [{ id, name, since }] }` (zero or one) |
| GET | `/api/care/links` | either | 200, `{ links: [{ id, since, senior: { id, name }, caregiver: { id, name } }] }` |
| DELETE | `/api/care/links/:id` | either participant | 200, `{ id }` |

Creation and acceptance take no body (or `{}`). Extra fields, including user IDs, roles, email or access permissions, are rejected. The senior ID comes from the authenticated creator; the caregiver ID comes from the accepting account. The token is returned **only on creation**; the API cannot retrieve the raw secret later.

`id` in `/care/caregivers` is the **link ID**, which the existing Account card passes to removal. In `/care/links`, the nested senior/caregiver IDs identify accounts; the outer ID identifies the link. No email, DOB, income, passwords, Google tokens, scan text or dose data are returned.

### Example

```js
// src/api/client.js already supplies createInvite/getInvite/acceptInvite/myCaregivers/removeCareLink.
// api() includes the current bearer token and returns the standard envelope.
const invite = await api('/care/invites', { method: 'POST' })
const url = `${location.origin}/shared/${invite.data.token}`
// After the recipient logs in as a caregiver:
await api(`/care/invites/${token}/accept`, { method: 'POST' })
const relationships = await api('/care/links')
await api(`/care/links/${relationships.data.links[0].id}`, { method: 'DELETE' })
```

The backend returns token/expiry rather than building URLs from an untrusted Host header. The frontend constructs the link with its own `location.origin`. Tokens are 32 random bytes encoded as 64 lowercase hex characters. They are separate from login JWTs and cannot be used as bearer authentication.

## Expiry, replacement, revocation and concurrency

- Invites expire **7 days** after generation, checked in the query. No cleanup timer is relied upon.
- A newly generated invitation invalidates the senior's previous unused invitation. Keep the newest link. Concurrent generations can return multiple successful responses, but only the last stored secret works.
- Acceptance is a single conditional MongoDB update on the current hash, an unexpired invite and an empty caregiver slot. Only one concurrent acceptance succeeds; others get 404. The token hash and expiry are removed on success. It is never reusable, including after link removal.
- A unique index on `seniorId` enforces one slot (pending or active) per senior. `caregiverId` is indexed but not unique, allowing many seniors per caregiver. Generation cannot overwrite an accepted link, including when acceptance races replacement.
- Cancelling an unused invitation deletes only the pending slot. It never removes an active relationship. Removing an active link deletes it permanently; the next invite creates a new link ID so stale removal requests cannot delete a replacement relationship.
- Each senior can issue at most **5 invitations per fixed UTC hour**. The atomic quota is stored in MongoDB so Vercel instances share it. Cancellation/removal does not reset the quota. An attempted creation that loses a race may still consume an issuance slot.
- Public preview/accept and authenticated generation also have a 60-request/minute IP limiter. That secondary IP limiter is per process; the issuance quota is shared. Expired quota records have a TTL cleanup index, but expiration of invites does not depend on TTL.

## Errors

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Unexpected create/accept fields or invalid signup role |
| 401 | `NOT_LOGGED_IN` | Missing/invalid token or deleted/missing account |
| 403 | `WRONG_ROLE` | Wrong account role for this operation |
| 404 | `NOT_FOUND` | Unknown, malformed, expired, consumed, replaced or revoked invite; missing inviter; unknown/other person's link |
| 409 | `CAREGIVER_ALREADY_LINKED` | The senior already has a caregiver |
| 429 | `RATE_LIMITED` | Persistent hourly issuance quota or secondary IP limit reached |
| 503 | `SERVER_ERROR` | Database unavailable; no database URI/driver error exposed |

Failed requests do not reveal whether a particular account email exists; the flow never accepts or looks up an email target. Wrong-role/unauthenticated acceptance does not consume an invite. Duplicate acceptance, including the same caregiver retrying after a successful response was lost, returns 404; use `/care/links` to check whether the relationship exists before requesting a new invitation.

## Frontend integration status and next PR

The existing senior Account card can create a link, show the linked caregiver and remove the link. The Shared page supports signup/login return and acceptance. The backend now persists the signup role so these real flows work instead of only mocked tests.

Two frontend follow-ups: hide/disable Create invite when the senior already has a caregiver (backend returns 409 today), and expose Cancel invitation via `DELETE /care/invites`. Creation already replaces an old pending invite.

**No fake health data:** `/care/seniors` returns `501 NOT_IMPLEMENTED` for a caregiver; `/care/seniors/:seniorId/today` returns 404 unless linked, then 501 until the data-access PR. The current frontend navigates to that detail page on acceptance, so it displays “This feature is coming soon” after a successful link. Use `/care/links` for the real relationship list in this PR. Do not present missing server-side schedule data as zero doses or calculate missed doses from ticks alone.

Before adding scan access, align the frontend's consent: its invitation currently promises caregivers do **not** see scans/bills/account details. A link alone must not be treated as permission to expose extra data contrary to that promise. Future read endpoints must check an active link on every request; the existing `/api/history` and `/api/doses` ownership rules are not relaxed by this PR.

## Setup and tests

No new environment variables or manual migration. Use existing `MONGODB_URI`/`JWT_SECRET`; collection/index initialization is lazy. New collections are `carelinks` and `careinvitequotas`, alongside `users`. Pending expired links occupy one row per senior and are replaced on the next issuance. No shared Atlas records are created by tests.

- `node --test server/test/care.test.js`: real disposable MongoDB; roles, privacy, acceptance races, multi-senior caregivers, rotation/expiry, participant-only removal, replacement races, persistent quota, reconnect and DB failure.
- `pnpm exec playwright test e2e/care-api.spec.js`: existing Account → invite → caregiver signup → accept → senior removes, with real backend/MongoDB on desktop and iPhone 6 projects. Transport is redirected to the disposable server; auth/link endpoints are not mocked.
- `pnpm test:api`, `pnpm test:e2e`, `pnpm build`: regression checks. Stop the normal API before browser tests.

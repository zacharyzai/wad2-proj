# Dose ticks contract

Owner: **Lokesh** (built by Claude, declared in README.txt). Model in Sheen Hern's `server/models` folder; please review. Schedule page: Lokesh.

On the Schedule page, the user ticks each dose as they take it. Ticks are saved to their account, so they show on every device they log in on. We store only the dose id and the day, never the medicine's name, dose or instructions.

Code: `server/routes/doses.js`, `server/models/Dose.js`. Tests: `server/test/doses.test.js` (in-memory MongoDB, never Atlas).

## Setup

No new keys needed: it uses `MONGODB_URI` and `JWT_SECRET` like the auth routes. Optional: `DOSE_RATE_LIMIT` (changes per minute per IP, default 60).

## Endpoints (all need the login token)

| Method | Path | Body | Answer |
|---|---|---|---|
| GET | `/api/doses?date=2026-10-28` | | `{ date, taken: ["m1-morning", ...] }` (sorted; only this user's ticks for that day) |
| POST | `/api/doses` | `{ doseId, date }` | `{ doseId, date, takenAt }` |
| DELETE | `/api/doses` | `{ doseId, date }` | `{ doseId, date, taken: false }` |

Every answer is `{ ok: true, data }`, or the usual `{ ok: false, error: { code, message } }`, and is sent with `Cache-Control: no-store`.

- **Ticking is idempotent.** Ticking a dose that is already ticked answers 200 with the **first** `takenAt`. Double taps, retries and two devices never make duplicates (unique index, see Storage).
- **Unticking is idempotent.** Unticking a dose that isn't ticked answers 200. The client can always just send the state it wants.
- `doseId`: the id from `buildSchedule()` in `src/rules/schedule.js`, `${medicineId}-${slot}` (e.g. `m1-morning`). 1 to 80 letters, digits or hyphens. The server doesn't check that the medicine exists: medicines are still kept in the browser (`src/stores/medicines.js`).
- `date`: the day in **Singapore** (`todayInSingapore()` in `src/rules/schedule.js`), `YYYY-MM-DD`, a real calendar date. Allowed range: up to 1 day after today (a device clock slightly ahead) and up to 365 days back.
- At most **120** different doses ticked per user per day (20 medicines × 6 doses, the Google sync limits). Re-ticking one already ticked still works at the limit.

### Errors

| Status | `code` | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Bad or missing `doseId` or `date`, date out of range, more than 120 doses on one day, malformed JSON |
| 401 | `NOT_LOGGED_IN` | No token, bad or expired token |
| 429 | `RATE_LIMITED` | More than `DOSE_RATE_LIMIT` changes in a minute |
| 503 | `SERVER_ERROR` | Database unavailable (same answer as the auth routes, via `withDb`) |

All of these already have text in all 4 locales (`errors.<code>`).

## Client flow (Lokesh)

1. On load: `GET /api/doses?date=<today in Singapore>` and show those doses as ticked.
2. Tap: update the tick on screen straight away, then `POST` (tick) or `DELETE` (untick). If it fails, put the tick back and show the error message.
3. A tick is for one day only: a new day starts with everything unticked.

## Privacy and access

- Every query includes the user id from the login token, so a user can never read, tick or untick someone else's doses. Using another user's dose id only touches your own (missing) tick.
- Nothing is logged: no dose ids, dates or user ids.

## Storage

`Dose { userId, doseId, date, takenAt }`, unique index on `{ userId, date, doseId }` (it also serves `GET` by day). The index is built when the database connects (`server/db.js`, next to the User email index), so concurrent ticks can't slip in before it exists.

Not yet done: when a medicine is removed, its old ticks stay (they are only ids and dates, and they no longer show). Deleting an account should also delete its ticks; add `Dose.deleteMany({ userId })` wherever account deletion is built.

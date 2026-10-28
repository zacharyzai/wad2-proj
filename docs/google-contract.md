# Google Calendar contract

Owner: **Zachary** (backend built by Claude, declared in README.txt). Connect button states: Isaac. Schedule: Lokesh.

Connecting once puts every dose in the user's own Google Calendar as a repeating event with an alert at dose time, so the phone rings even when our app is closed. We ask for the `calendar.events` scope only: we can add and change our own events, never read the rest of the calendar. We never see the Google password.

Code: `server/routes/google.js`, `server/services/google.js`, `server/models/GoogleLink.js`. Tests: `server/test/google.test.js` (Google mocked).

## Setup

`.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_KEY` (32 random bytes, base64; encrypts refresh tokens). Without them every route answers `503 GOOGLE_UNAVAILABLE`.

- `GOOGLE_REDIRECT_URI` is `http://localhost:5173/api/google/callback` in development (through the Vite proxy, so the callback can send the user back to an app page) and `https://<live site>/api/google/callback` on Vercel. Each must be listed under **Authorised redirect URIs** in Google Cloud, exactly.
- The consent screen is **In production** (unverified): Testing mode expires every connection after 7 days. Users see "Google hasn't verified this app"; they press Advanced, then Go to Ah Ma Ah Gong Can. Say this in README.txt for the markers.

## Endpoints (all need the login token except the callback)

| Method | Path | Body | Answer |
|---|---|---|---|
| POST | `/api/google/connect` | `{ next: "/schedule" }` (optional, default `/account`) | `{ url }`: set `location.href = url` |
| GET | `/api/google/callback` | (Google sends the browser here) | Redirects to `next` with `?google=connected`, `cancelled` (they said no) or `failed` |
| GET | `/api/google/status` | | `{ connected, events }` (`events` = how many doses are in their calendar) |
| POST | `/api/google/sync` | `{ entries: [ScheduleEntry], lang }` | `{ created, updated, removed, skipped: [{ medicineId, reason: "flagged" \| "noEndDate" }] }` · `409 GOOGLE_NOT_CONNECTED` · `401 GOOGLE_DISCONNECTED` |
| POST | `/api/google/disconnect` | `{ removeEvents: true }` (optional) | `{ connected: false }` |

- **Sync** makes Google match the **whole** schedule sent: new doses are created, changed ones updated, doses no longer in `entries` deleted. Unchanged doses are not touched, so it is safe to call after every save. Send the full schedule each time, never just the changed medicine.
- `401 GOOGLE_DISCONNECTED`: the user removed our access in their Google account. The server has already forgotten the dead token, so show **Reconnect**, not an error page.
- Flagged medicines (when necessary, weekly, tapering) and entries without `endDate` are never synced: ask for the number of days first, never create an endless series.
- Event text is in `lang` (en, zh, ms, ta), unit words and punctuation included ("1 粒，饭后。"); dose numbers stay digits and the medicine name stays as printed. The zh, ms and ta wording is to be checked by Asher.
- Tested live on 25 Oct 2026 with a real Google account: create, no duplicates on re-sync, time change moves the same event, removed dose deletes its event, flagged medicine skipped, Chinese text, disconnect removes the events and revokes access.

### ScheduleEntry (as in the build guide)

```jsonc
{ "medicineId": "m1", "label": "Metformin 500mg",
  "instruction": { "count": 1, "unit": "tablet", "food": "after" },     // unit: DOSE_UNITS, food: WITH_FOOD (docs/scan-contract.md)
  "doses": [{ "id": "m1-morning", "time": "08:00" }, { "id": "m1-night", "time": "21:00" }],  // id must stay the same across edits
  "startDate": "2026-10-23", "endDate": "2026-11-21", "flagged": false }
```

At most 20 entries, 6 doses each, 366 days. Times are Singapore local `HH:MM`; the server sends them with `timeZone: Asia/Singapore` and never converts by hand.

## Client flow (Isaac)

Built on the Schedule page by Lokesh: `src/components/schedule/CalendarSync.vue` (steps 1–6; tests in `e2e/schedule.spec.js`). The payload comes from `syncEntries()` in `src/rules/schedule.js`, tested against `checkEntries`. Reuse the component if Account needs the button too. Step 7 is not built yet.

1. Show the state from `GET /api/google/status`: **Connect Google Calendar** / **Connected · Disconnect**.
2. Connect: `POST /api/google/connect` with `{ next: route.path }`, then `location.href = data.url`.
3. Back on the page, read `?google=` and show a short message (`connected`, `cancelled`, `failed`), then remove it from the address.
4. After the schedule is saved (Lokesh): if connected, `POST /api/google/sync` with the whole schedule and the current language.
5. Under Connected, the line "Check that your calendar alerts are on".
6. Disconnect asks "Also remove the events from my calendar?" and sends `removeEvents`.
7. iPhone users without Google: the `.ics` download stays as the fallback.

Error codes for `t('errors.' + code)`: `GOOGLE_NOT_CONNECTED`, `GOOGLE_DISCONNECTED`, `GOOGLE_UNAVAILABLE` (all 4 locales).

## Storage

`GoogleLink { userId (unique), refreshToken, events: Map<doseId, { eventId, hash }> }`. `refreshToken` is AES-256-GCM encrypted (`iv.tag.ciphertext`); it is never logged and never sent to the browser. `hash` is a fingerprint of the event we sent, so a sync only touches doses that changed. Disconnecting revokes the token at Google and deletes the document.

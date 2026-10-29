# Confirmed scan history

Owner: Sheen Hern (backend); Isaac (History pages); Asher (Confirm save action). Confirm saves each checked scan here when logged in (`ConfirmView.confirm()`, not awaited).

Canonical route: **`/api/history`**, using the already mounted route. The build guide's proposed `/api/scans` is not a second API. All responses use `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. All endpoints require `Authorization: Bearer <token>` and an existing account. Route responses have `Cache-Control: no-store`.

## Endpoints

| Method | Path | Success |
| --- | --- | --- |
| POST | `/api/history` | 201, `{ id, createdAt, scan }` |
| GET | `/api/history?page=1` | 200, `{ items, page, pageSize: 10, pages, total, hasMore }`; each item `{ id, type, source, title, createdAt, totalPayableCents (bills, else null), shareToken, shareExpiresAt (null unless a link is live) }` |
| GET | `/api/history/:id` | 200, `{ id, createdAt, scan }` |
| DELETE | `/api/history/:id` | 200, `{ id }` |

### Save

Send `{ scan }`, where `scan` is the **corrected, confirmed** medication or bill shape from [scan-contract.md](scan-contract.md). `unclear` must be `[]`. Only `type`, `source`, `unclear`, and the matching `medication` or `bill` object are accepted. Do not send a photo, `savedId`, account details, `userId`, timestamps or any other properties. Ownership and time come from the server. Saving is explicit; calling `/api/scan` alone does not save an unconfirmed extraction.

The server validates the supplied data; it cannot prove that a human actually checked the source label. The UI must only send the request after the user completes Confirm. Clear resolved `unclear` paths in the payload: the current Confirm draft can retain old flags even after the corresponding values are corrected.

- Sources: `sample`, `mock`, `ai`. Manually typed medicines from Ask/Schedule are not scan history in this PR.
- Medication: name, positive dose up to 100, known frequency; daily frequency requires an integer 1–6 times/day. Nonempty timing selections must match the daily count. Optional contract fields can be null; warnings is an array. PRN/weekly/tapering data can be saved without creating a schedule.
- Bill: integer nonnegative cents, at least one complete item, known categories/schemes, valid calendar date or null. Items minus subsidies not already included in the items minus MediSave must equal the total. No dollars-to-cents normalization is applied to confirmed data.
- Limits: 64 KiB per scan, 2,000 characters per text field, 100 items, 100 subsidies, 50 warnings; each money value at most 1,000,000,000,000 cents. Reject unknown fields at every level and image data URLs in text fields.
- No deduplication: each successful POST creates a new history entry. Submit once and retain the returned ID; do not automatically retry an uncertain POST. PUT/PATCH and idempotent save keys are not supplied in this PR.

Example medication detail:

```json
{
  "ok": true,
  "data": {
    "id": "0123456789abcdef01234567",
    "createdAt": "2026-10-28T00:00:00.000Z",
    "scan": {
      "type": "medication",
      "source": "sample",
      "unclear": [],
      "medication": {
        "name": "Metformin", "strength": "500 mg", "doseAmount": 1,
        "doseUnit": "tablet", "timesPerDay": 2,
        "timing": ["morning", "evening"], "withFood": "after",
        "frequencyType": "daily",
        "rawInstruction": "Take 1 tablet twice a day after food",
        "warnings": ["Do not skip meals while taking this medicine"]
      }
    }
  }
}
```

### List and detail

Each list item is `{ id, type, source, title, createdAt }`. Medication titles join name and strength; bill titles use clinic or null. Render a translated bill fallback when title is null. Lists never include full extracted text, account fields or internal ownership IDs. Full details are fetched separately.

Newest first by server `createdAt`, then `_id` descending to break timestamp ties, backed by index `{ userId: 1, createdAt: -1, _id: -1 }`. Page size is fixed at 10. Page must be a decimal integer 1–100000; no other query parameters are supported. An empty/out-of-range page succeeds with an empty `items` array. `total` counts only this user's records. As with normal offset pagination, concurrent inserts/deletes can shift later pages; reload page 1 after a change.

Deleting a scan permanently removes that history record. It does not remove the medicine from the current browser's medicine store, delete schedules/dose logs, or change Google events. Repeated deletion returns 404.

## Frontend handoff (not wired by this backend PR)

Call only through `src/api/client.js`'s existing `api()` wrapper; it adds the token and returns the standard envelope:

```js
// After Confirm's validation succeeds, create a payload without photo/savedId/old flags.
const confirmed = {
  type: draft.type, source: draft.source, unclear: [],
  [draft.type]: structuredClone(toRaw(draft[draft.type])),
}
const result = await api('/history', { method: 'POST', body: { scan: confirmed } })
// Keep result.data.id on success; show translated failure and an explicit retry on error.
const page = await api('/history?page=1')
const detail = await api(`/history/${id}`)
await api(`/history/${id}`, { method: 'DELETE' })
```

Isaac: replace Coming soon with loading/empty/error states, paginated summaries, detail replay/read-aloud and confirmed deletion. Asher: save the corrected payload from Confirm once, keeping the return ID. Retrieval returns `data.scan`, suitable for replay through the existing explanation templates. Do not reuse the save path while simply viewing an old record. All user-facing messages belong in all four locales; render API errors using `t('errors.' + result.error.code)`.

## Errors and privacy

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Invalid/unconfirmed data, private/unknown fields, invalid pagination or malformed JSON |
| 401 | `NOT_LOGGED_IN` | Missing/invalid token or account no longer exists |
| 404 | `NOT_FOUND` | Invalid ID, missing record or another user's record; same response |
| 503 | `SERVER_ERROR` | Database unavailable; no connection details exposed |

Every read/delete query filters by the authenticated `userId`; client owner filters are rejected. Only confirmed extracted contract fields are saved in `scans`. No photos or dedicated patient-name/NRIC/address/phone fields are stored. Free-text fields remain user-supplied: users must not enter identifying information into medicine instructions or bill descriptions. The backend does not automatically detect all personal text in otherwise valid fields.

Scope: scan history covers confirmed medication labels and bills. It is separate from saved schedules/dose logs and chat history. Read-only share links (`POST /api/share { scanId }` → `{ token, expiresAt }`, 30 days; `DELETE /api/share/:token`; public `GET /api/share/:token` → `{ scan }` with contract fields only, rate limited) replace the earlier "no anonymous links" decision, per the proposal's WhatsApp sharing. The later caregiver work will invite someone to sign up or log in and use backend-managed access; it is not implemented by this API.

## Verification

`pnpm test:api` includes `server/test/history.test.js` with disposable MongoDB: samples/cents, corrections, reconnect persistence, pagination/ties/index, input rejection, ownership/deleted accounts and safe DB failures. `pnpm exec playwright test e2e/history-api.spec.js` runs real signup → scan sample → save → fresh login → retrieve/delete plus cross-account checks with Playwright's HTTP client; it does not test a History UI. No shared Atlas accounts or records are read/changed by these tests. No new environment variables or manual database migration are needed; the model initializes its collection/index when first used.

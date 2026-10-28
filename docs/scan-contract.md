# Scan data contract

Owner: **Zachary**. Every feature reads scans in this shape. Changing it (or the fixtures in `server/fixtures/`) needs Zachary's review, because the enum values below are also i18n and template keys.

## Request

`POST /api/scan` with a JSON body, in one of two forms:

```jsonc
{ "type": "medication" | "bill", "image": "data:image/jpeg;base64,..." } // real photo
{ "sampleId": "med-1" }                                                  // built-in sample
```

- `image` must be a base64 **JPEG, PNG or WebP** data URL. Compress it on the client to about **1 MB or less**. The server rejects bodies over 4 MB.
- The image is only sent to the AI for extraction and is **never stored**.
- Samples available now: `med-1` (Metformin), `med-2` (Amlodipine), `med-3` (cough syrup, when needed), `bill-1`, `bill-2` (blood tests + MediSave), `bill-3` (Merdeka Generation, procedure + other). Lokesh adds more in `server/fixtures/` and registers them in `server/routes/scan.js`.
- Sample scans are never rate limited. **E2E tests must use samples.**

From the client, call `scanImage(type, image)` / `scanSample(id)` from `src/api/client.js`.

## Response

```jsonc
{ "ok": true, "data": Scan }
{ "ok": false, "error": { "code": "RATE_LIMITED", "message": "..." } }
```

| code | HTTP | when |
|---|---|---|
| `BAD_REQUEST` | 400 | missing or invalid `type`/`image`, malformed JSON |
| `NOT_FOUND` | 404 | unknown `sampleId` or API route |
| `IMAGE_TOO_LARGE` | 413 | body over 4 MB |
| `UNREADABLE_IMAGE` | 422 | the AI could not read the photo |
| `WRONG_DOCUMENT` | 422 | the photo is clear but not the requested document: not a medical bill at all, or a bill sent as a medication label. The client says so instead of "retake in good light" |
| `LOOKS_LIKE_BILL` / `LOOKS_LIKE_LABEL` | 422 | the photo is clearly the other kind (a bill sent as a label, or a label sent as a bill). The client asks "Was this meant to be a bill?": Yes sends the same covered photo again with the other `type`; No shows that it doesn't match |
| `RATE_LIMITED` | 429 | too many scans per IP, or the daily AI cap was reached |
| `NOT_IMPLEMENTED` | 501 | stub endpoint |
| `AI_UNAVAILABLE` | 503 | Gemini is down or not configured |
| `SERVER_ERROR` | 500 | unexpected server error |
| `NETWORK_ERROR` | none | set by the client only: server unreachable or non-JSON response |
| `TIMEOUT` | none | set by the client only: the scan passed its 30 s limit (covering on the phone, or the request) |

Show errors with `t('errors.' + error.code)`.

## Scan

Shared fields:

| field | type | notes |
|---|---|---|
| `type` | `"medication"` \| `"bill"` | |
| `source` | `"sample"` \| `"mock"` \| `"ai"` | `mock` = `USE_MOCK_AI=true` |
| `unclear` | string[] | paths of fields the AI could not read, e.g. `"medication.timesPerDay"`, `"bill.items.2.amountCents"`. Those fields are `null`. **Never guess.** The Confirm screen highlights them. |

### `medication`

```json
{
  "name": "Metformin",
  "strength": "500 mg",
  "doseAmount": 1,
  "doseUnit": "tablet",
  "timesPerDay": 2,
  "timing": ["morning", "evening"],
  "withFood": "after",
  "frequencyType": "daily",
  "rawInstruction": "Take 1 tablet twice a day after food",
  "warnings": ["Do not skip meals while taking this medicine"]
}
```

| field | type / values |
|---|---|
| `name`, `strength`, `rawInstruction` | string \| null |
| `doseAmount` | number \| null (**always digits**, never translated) |
| `doseUnit` | `tablet` `capsule` `ml` `puff` `drop` `other` \| null |
| `timesPerDay` | number \| null |
| `timing` | array of `morning` `afternoon` `evening` `bedtime`, or null when the label doesn't say |
| `withFood` | `before` `after` `with` `any` \| null |
| `frequencyType` | `daily` `as_needed` `weekly` `tapering` `other` \| null. Anything other than `daily` (including null) is **flagged for a pharmacist and not scheduled** |
| `warnings` | string[] |

### `bill`

All money is in **integer cents** (SGD). Never use float dollars.

```json
{
  "clinic": "SingHealth Polyclinics - Bedok",
  "place": "polyclinic",
  "visitDate": "2026-09-01",
  "items": [{ "description": "Consultation", "category": "consultation", "amountCents": 1450 }],
  "subsidies": [{ "scheme": "government", "amountCents": 870, "includedInItems": false }],
  "medisaveCents": 0,
  "totalPayableCents": 1400
}
```

| field | type / values |
|---|---|
| `clinic`, `description` | string \| null |
| `visitDate` | `YYYY-MM-DD` \| null |
| `place` | `polyclinic` `gp` `dental` `specialist` `hospital` `tcm` `pharmacy` `lab` `other`, or `null` (older scans and samples: the Bill page then goes by the clinic name). Any medical bill is read; subsidy estimates are only for polyclinic, GP and dental bills |
| `category` | `consultation` `medication` `investigation` `procedure` `ward` (ward, bed or room) `tax` (GST) `other` |
| `scheme` | `government` `chas` `pioneer` `merdeka` `insurance` (MediShield Life, Integrated Shield, private or employer insurance) `other` |
| `includedInItems` | `true` when the bill gives each line a gross and a **net** amount: items then hold the net amounts and this subsidy is already inside them, so it is shown ("Already taken off the charges above") but never subtracted again. The check is items − subsidies not included − MediSave = total |
| `amountCents`, `medisaveCents`, `totalPayableCents` | integer \| null |

Invariant (checked in tests for the fixtures): `sum(items) − sum(subsidies) − medisaveCents = totalPayableCents`.

## Which fields get flagged as `unclear` (AI scans)
AI output goes through `server/services/normalizeScan.js`: invalid values become `null`, unknown fields are dropped, and dollars are converted to cents.
- Medication: `name`, `doseAmount` and `frequencyType` are required. `timesPerDay` is also required when `frequencyType` is `daily`. Optional fields (`strength`, `doseUnit`, `timing`, `withFood`) can be null just because the label doesn't say, so they are not flagged.
- Bill: any item with no description or amount, any subsidy with no amount, a missing `medisaveCents` or `totalPayableCents`, no items at all, or totals that don't add up (then `bill.totalPayableCents` is flagged).

## Privacy

The contract has **no** patient name, NRIC, address or phone fields. The AI prompt must not extract them.

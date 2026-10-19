# Heuristic audit: Nielsen's 10 usability heuristics

Branch `feat/ui-revamp`, 2026-10-19. The audit was done by reading the code of every screen, with seniors (60+, low vision, limited English) as the main users.

Severity: 0 = not a problem, 1 = cosmetic, 2 = minor, 3 = major, 4 = catastrophe.

## Scope: which flows exist

| Flow | State in the code | Audited? |
|---|---|---|
| 1. Login / first-time use | `LoginView`/`SignupView` are "Coming soon" placeholders. First-time use = Home. | Home only |
| 2. Scan → extraction → review/correct | Built (`ScanView`, `ConfirmView`, `ConfirmField`) | Yes |
| 2b. Explain + read-aloud | Built (`ExplainView`, `ReadAloud`) | Yes |
| 3. Bill breakdown + subsidy checker | `BillView` is a placeholder. The bill summary on Explain is built. | Explain part only |
| 4. Schedule → reminder → Google Calendar | `ScheduleView` is a placeholder. Reminders and Calendar links are **not in the proposal** (CLAUDE.md features 1–5). | No |
| 5. History + share link | `HistoryView`/`SharedView` are placeholders | No |
| 6. Chatbot | Built (`AskView`) | Yes |

The unbuilt flows can't be audited yet. Their owners get a checklist at the end.

## Findings

| # | Heuristic | Flow / screen | File | Sev | Proposed fix |
|---|---|---|---|---|---|
| 1 | H3 Control, H5 Prevention | Confirm | `src/views/ConfirmView.vue:89,198` | **3** | Back and "Retake photo" go to Scan and silently throw away every correction the user typed. If the draft has changed, ask "Discard your changes?" first. |
| 2 | H5 Prevention | Confirm (medicine) | `src/views/ConfirmView.vue:29-54` | **3** | Impossible values pass the check: dose `0` or `-1`, times a day `0` or `20`. "3 times a day" with only *Morning* ticked also passes. Explain then reads out a wrong dose in big digits. Flag these fields: dose must be > 0, times a day 1–6, and the number of ticked times must equal times a day when any are ticked. |
| 3 | H1 Status, H10 Help | Explain, Ask (read-aloud) | `src/components/explain/ReadAloud.vue:2` | **3** | Many devices have no Tamil or Malay voice, so read-aloud just says "not available". The proposal's cloud TTS fallback (`/api/tts`) isn't built. **Needs the backend (Sheen Hern), so not fixed here.** |
| 4 | H3 Control (dead end) | Explain (medicine) | `src/views/ExplainView.vue:199` | 2 | The main button, "Add to schedule", opens a "Coming soon" page. This goes away when Lokesh ships Schedule. Until then the button stays, and the placeholder links back to Scan. |
| 5 | H1 Status | Home → Upload photo, Scan → Upload | `src/views/ScanView.vue:127-139` | 2 | While a large photo is shrunk (about 1 s on old phones) the screen doesn't change, so seniors tap again. Show the "Reading your label…" state before the shrinking starts, not after. |
| 6 | H6 Recognition | Confirm (samples) | `src/views/ScanView.vue:141-144` | 2 | A sample scan reaches Confirm with no picture, so there's nothing to compare the fields against. Pass the sample's image (`/samples/<id>.svg`) as the photo. |
| 7 | H4 Consistency | Explain vs Ask read-aloud | `ReadAloud.vue:71`, `AskView.vue:287-289` | 2 | The same action has different words: Explain says "Play / Pause", Ask says "Read aloud / Stop". Use "Read aloud" with a speaker icon on both pages, and keep Pause on Explain. |
| 8 | H8 Minimalist / legibility | Phone tab bar (Tamil) | `src/styles/App.css:26` | 2 | Tamil tab labels are 15px, below the 16px floor. Allow 2 lines at 16px instead. |
| 9 | H9 Recover | Scan / Ask errors | `src/i18n/locales/*.json` (`errors.BAD_REQUEST`, `errors.RATE_LIMITED`) | 2 | "Something was wrong with that request" uses jargon and gives no next step. "Wait a while" is vague. Reword as "We couldn't use that photo. Please take it again." and "Too many tries. Please wait 1 minute and try again." In zh/ms/ta these are marked TODO for a native speaker. |
| 10 | H10 Help | Home / first use | `src/views/HomeView.vue` | 2 | Nothing tells a first-time user that there are 3 steps. Add a static "How it works: 1 Photo → 2 Check → 3 Explain" strip under the hero. It is skippable by nature (not a modal tour), and screen readers and read-aloud can reach it. |
| 11 | H10 Help | Scan error, Confirm | `ScanView.vue:198-225`, `ConfirmView.vue` | 2 | Only the Explain text can be read aloud. The error message and the "Please check" guidance can't be heard by users with low vision. Add a small read-aloud button on the Scan error screen. Confirm is left for Asher (see #20). |
| 12 | H2 Real world | Explain (bill) | `src/views/ExplainView.vue:17` | 1 | Amounts show as `$4.20`. Singapore bills use `$`, so this is fine for locals. "S$" isn't needed. Not fixed. |
| 13 | H2 Real world | Confirm (bill) | `ConfirmView.vue:182` | 1 | CHAS, Pioneer and Merdeka are shown with no explanation. Bill breakdown (feature 4) is where they get explained. Not fixed. |
| 14 | H2 Real world, H9 | Scan error | `en.json scan.errorTag` | 1 | The badge says "Error", which sounds alarming next to a friendly message. Could say "Photo problem". Not fixed. |
| 15 | H3 Control | Ask | `AskView.vue:7` | 1 | There's no way to start a fresh conversation. It clears on reload. Not fixed. |
| 16 | H4 Consistency | Whole app | `src/components/layout/{BigButton,Card,ErrorBanner,LoadingState,PageHeader}.vue` | 1 | Isaac's components are no longer used by any view, because views use the design-system classes directly. Isaac decides whether to keep or delete them. Not fixed. |
| 17 | H4 Consistency | Home / sidebar / tabs | `HomeView.vue:50`, `App.vue:53` | 1 | One action has three labels: "Scan a label or bill", "Scan a document" and "Scan". Not fixed. |
| 18 | H5 Prevention | Ask composer | `AskView.vue:326` | 1 | The 300-character limit cuts typing off silently. Could show a counter near the limit. Not fixed. |
| 19 | H7 Flexibility | Explain | — | 1 | Caregiver shortcuts (re-share, repeat last scan) need History/Share (feature 5). Not fixed. |
| 20 | H6 Recognition | Confirm (phone) | `ConfirmView.vue:98-107` | 1 | On phones the photo is folded behind "Show photo", so checking means scrolling back and forth. It could open by default when fields are flagged. Left for Asher. Not fixed. |

What already works, and needs no change:
- **Scan:** the progress ring plus "Reading your label…" message, and a working Cancel.
- **Confirm:**
  - Fields that couldn't be read are flagged, with an amber "Please check" and the text "We couldn't read this".
  - "Looks correct" stays disabled, with the reason given, until those fields are filled.
  - The bill total is checked against the items.
- **Explain:** the medicine's Back keeps the user's corrections.
- **Ask:**
  - Removing a medicine has Undo instead of a confirm dialog. This is better for seniors (fewer taps) and meets H3/H5.
  - There are starter and follow-up chips.
  - An unknown medicine gets a "Take a photo / Type it" path rather than a dead end.
  - The 995 card shows for emergencies.
- **Whole app:**
  - Errors always go through `t('errors.CODE')`, and no raw codes or stack traces reach the UI.
  - The chosen language is saved and kept across pages and visits.
  - Tap targets are ≥ 48px, and buttons are 64px tall.
  - Reduced motion is respected.

## Checklist for the unbuilt flows (owners)

- **Schedule (Lokesh):**
  - Confirm before removing a dose, or give Undo like Ask.
  - Show "Saved" after an edit.
  - Write times as "Morning, 8 am", not 08:00.
  - If reminders or Calendar are added, confirm before creating the event.
- **Bill breakdown + subsidy (Lokesh):**
  - Explain CHAS, PG, MG and MediSave on each line.
  - Show live "Updating…" while the questionnaire changes the estimate.
  - Validate the years (must be in the past and after 1900).
- **Login / History / Share (Isaac, Sheen Hern):**
  - Allow a password to be shown.
  - Keep the user's language after login.
  - Confirm before deleting a saved scan, or give Undo.
  - Before a share link is created, say what will be shared.
  - Re-share should be a one-tap button on each history item (H7).

## Step 3 test plan

- Playwright tests:
  - the loading state appears, for a scan and for a chat reply
  - the discard-changes confirm appears on Confirm → Back
  - the friendly error shows when an upload fails
  - Back works on Confirm and Explain
- `@axe-core/playwright` on Home, Scan, Confirm, Explain, Ask and 404, in light and dark.

## Step 2–3 outcome (2026-10-19)

Zachary asked to fix only his own area (Ask, feature 6). Every other finding stays open for its owner.

These were found while auditing Ask and fixed in `src/views/AskView.vue`:

| # | Heuristic | Sev | Problem → fix |
|---|---|---|---|
| A1 | H5 Prevention, H9 Recover | 2 | **Problem:** in "Type a medicine", pressing Add with no name only moved focus, with no message. **Fix:** an inline "Type the medicine name first." with `role=alert`, plus `aria-invalid` and `aria-describedby`. The message clears as the user types. |
| A2 | H9 Recover | 2 | **Problem:** a rejected question showed "Something was wrong with that request". **Fix:** it now shows "We couldn't send that question. Please type it again." (`ask.errors.BAD_REQUEST`). |
| A3 | Accessibility (axe `listitem`) | 2 | **Problem:** `role="log"` on the conversation `<ol>` removed its list role, so screen readers met orphaned items. **Fix:** the log role moved to a wrapper `<div>`. |

New strings are in all four languages. The zh/ms/ta wording is **TODO: native-speaker review**. Neither string is a medical term.

Tests (`e2e/ask-ux.spec.js`, run in Chromium and on iPhone):
- "Thinking…" appears and Ask is disabled while a reply loads.
- A failed question shows the plain message with Try again and never the technical text.
- When offline, the connection message shows.
- The empty-name error appears and then clears.
- axe finds no WCAG 2.1 A/AA violations on Ask, light and dark, both empty and mid-conversation.

Ask has no Back to test, because it is a top-level tab.

Open (not Zachary's files): findings 1, 2, 4–11, 14, 16, 17, 20 (Asher, Isaac, Lokesh), and finding 3 (needs Sheen Hern's `/api/tts`). Ask's own severity 1 items (15 fresh conversation, 18 character counter) are not fixed, as Step 2 says.

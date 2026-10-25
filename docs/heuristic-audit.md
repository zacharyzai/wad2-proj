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

---

# Round 2: features built since 19 Oct (audit 25 Oct 2026)

Done by walking each flow in the browser (phone and desktop, English and Chinese) and reading its code. Each fix has a Playwright test. Severity as above.

## Scope

| Flow | Audited |
|---|---|
| Login, Sign up, logged-out start-up | Yes |
| Account: details, language, "Settings saved", Log out | Yes |
| Start-up routing (new visitor → Welcome, account → Login, signed in → Home) | Yes |
| Bill: any medical bill (hospital, dental, pharmacy...), insurance, Home after the breakdown | Yes |
| Scan: wrong document, "Was this meant for a bill?" | Yes |
| Welcome page, Beginner's guide | Yes |
| Ask: remembers earlier turns, suggested questions | Yes |
| Google Calendar | Backend only: there is no button yet (#R9) |

## Findings

| # | Heuristic | Where | Sev | Problem | Status |
|---|---|---|---|---|---|
| R1 | H9 Recover, H10 Help | Login | **3** | No "Forgot password?": a senior who forgets is stuck with no hint. | **Fixed (partly):** "Forgot your password?" explains what to do. A real reset needs an email service; future work. |
| R2 | H1 Status | Start-up | 2 | When a saved login expires, the app moves to Login silently. | **Fixed:** "You were logged out. Please log in again." |
| R3 | H5 Prevention | Account | 2 | Log out is one tap; logging back in needs the password, and there is no reset (R1). | **Fixed:** asks "Log out of this phone or computer?" first. |
| R4 | H3 Control | Ask | 2 | No way to start over (old #15). Matters more now: earlier turns are sent with each question, so an old topic can steer new answers. | **Fixed:** "New conversation", with Undo for 8 seconds. |
| R5 | H2 Real world, H6 | Scan question screen | 2 | "No" alone doesn't say what it means. | **Fixed:** "No, it's a medicine label" / "No, it's a bill". |
| R6 | H5 Prevention | Ask composer | 1 | The 300-letter limit stops typing silently (old #18). | **Fixed:** "30 letters left" appears near the limit. |
| R7 | H9 Recover | Scan, Bill | 3 | Before this week, a clear photo of the wrong document said "retake it in good light", and only polyclinic bills were read. | **Fixed this week:** wrong-document message; any medical bill; "Was this meant for a bill?" with Yes/No. |
| R8 | H1 Status, H10 | Scan | 2 | When Gemini is overloaded a scan could wait 25 s, then fail. | **Fixed this week:** the backup always gets a turn; overloaded models rest for 2 minutes. |
| R9 | H1 Status, H3 | Google Calendar | 3 | No Connect / Connected / Disconnect button, so users can't use it at all. | **Open (Isaac):** steps in `docs/google-contract.md`. |
| R10 | H3 Control, H5 | Confirm | 3 | Old #1: Back / Retake throws away the user's corrections without asking. | **Fixed (round 3).** |
| R11 | H5 Prevention | Confirm | 3 | Old #2: impossible doses pass (0 tablets, 20 times a day). | **Fixed (round 3).** |
| R12 | H2 Real world | Bill (hospital) | 1 | Hospital bills get no subsidy estimate, only "may not apply here" with official links. Correct, since there are no official figures, but users may expect a number. | By design (never invent a figure). |
| R13 | H3 Control | Account → Edit | 1 | Cancel drops the edits without asking. The form is short, so retyping is cheap. | Not fixed. |

## Already good in the new features (no change)

- **H1 Status:**
  - Home opens instantly for returning users.
  - "Settings saved" appears after every Account change, in the chosen language, and screen readers hear it.
  - Scans show "covering your details", then "reading".
- **H2 Real world:**
  - Bills use the words printed on them.
  - Lines are labelled Ward / room, GST, Insurance.
  - The summary says "Subsidies & insurance" when there is a claim.
- **H3 Control:**
  - Home, Close and Back are all on the bill breakdown.
  - The welcome page's moving parts can be stopped (tap a language or Bill / Medicine label).
  - The Beginner's guide can be skipped any time.
- **H4 Consistency:**
  - The language follows the account on every device.
  - The language switcher looks the same in the sidebar, Account and Login.
- **H5 Prevention:**
  - Sign-up shows every problem at once.
  - Bill totals are checked against the lines, and anything that doesn't add up is marked "please check" (as with Groq's misread hospital bill).
- **H6 Recognition:** samples on every page; suggested next questions in Ask.
- **H8 Minimalist:** day mode by default; "What this means for you" stays closed until tapped.
- **H9 Recover:** Undo for removing a medicine and for New conversation.

---

# Round 3: every feature, including round 1's open findings (25 Oct 2026)

Each round 1 finding was checked again against today's code. Fixes are by Claude, in the owners' files (listed for their AI declarations). Each has a Playwright test.

| Round 1 # | Heuristic | Where (owner) | Status today |
|---|---|---|---|
| 1 | H3, H5 | Confirm (Asher) | **Fixed.** Leaving with corrections by any route (Back, Retake, a tab, the browser's Back) asks "Throw away your changes?": Keep checking (focused) / Throw away and leave. No question if nothing changed or after Looks correct. |
| 2 | H5 | Confirm (Asher) | **Fixed.** A dose of 0 or less, times a day outside 1–6, and ticked times that don't match times a day are flagged with what to fix ("You ticked 1 time of day, but it says 2 times a day"), and block Looks correct. |
| 3 | H1, H10 | Read-aloud (Sheen Hern) | **Open.** Cloud TTS for Tamil and Malay needs `/api/tts`. |
| 4 | H3 | Explain "Add to schedule" (Lokesh) | **Open** until the Schedule ships. |
| 5 | H1 | Scan upload (Asher) | **Fixed.** The working state shows while a big photo is shrunk, so nobody taps twice. |
| 6 | H6 | Samples on Confirm (Asher) | **Fixed.** The sample's picture goes to Confirm. |
| 7 | H4 | Explain vs Ask (Asher, Zachary) | **Fixed.** Both say "Read aloud" (Explain keeps Pause while playing). |
| 8 | H8 | Tamil tab labels (Isaac, Asher) | **Open, worse than in round 1:** 14px, so 5 Tamil tabs fit a 360px phone. Needs shorter Tamil labels from a native speaker. The icons carry the meaning meanwhile. |
| 9 | H9 | Error wording (Asher) | **Fixed.** "We couldn't use that. Please try again." / "Too many tries right now. Please wait a few minutes, or try a sample." (no "1 minute": the daily cap uses the same code). |
| 10 | H10 | First use (Isaac) | **Fixed** by the Beginner's guide. |
| 11 | H10 | Scan errors (Asher) | **Fixed.** Every Scan error screen has Read aloud, saying the same title and text as the screen. |
| 13 | H2 | Bill schemes (Lokesh) | **Fixed** by the Bill page explanations. |
| 14 | H2, H9 | "Error" badge (Asher) | Partly: the "Was this meant for a bill?" question has no Error badge now; real errors keep it. |
| 15, 18 | H3, H5 | Ask (Zachary) | **Fixed** in round 2. |
| 16 | H4 | Unused layout components (Isaac) | Mostly resolved: BigButton, Card, ErrorBanner are used again (Account, Login). |
| 17 | H4 | Scan labels | Resolved: Home "Scan a medication label", tab "Scan", Bill "Scan a bill". |
| 19 | H7 | Caregiver shortcuts | **Open** until History/Share (Sheen Hern, Isaac). |
| 20 | H6 | Confirm photo on phones (Asher) | **Fixed.** The photo opens by itself when a field needs checking. |

Also fixed: after a stopped page change (Confirm's question), focus stays where it is instead of jumping to the page heading (`App.vue`, Isaac).

**Not auditable yet (not built):** Schedule (Lokesh), History and Share (Sheen Hern, Isaac), caregiver tracking, the Google Calendar button (Isaac). Audit them once built, with the round 1 checklist above.

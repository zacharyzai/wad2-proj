AH MA AH GONG CAN - IS216 G7 T8
================================

A web app that turns a photo of a medicine label or medical bill into a plain-language
explanation in English, Chinese, Malay or Tamil, read aloud.

1. LIVE URL
-----------
https://ahma-ahgong-can.vercel.app     (TODO: confirm it is the final deployment)

2. DUMMY LOGINS (password for all: Demo1234!)
---------------------------------------------
Created by the seed script in section 3 (node --env-file=.env server/scripts/seed-demo-accounts.js).

Email                            Role       Born        Citizenship          Income       Shows
pioneer.demo@example.com         senior     1945-08-12  born citizen         up to $1,500  Pioneer Generation, CHAS Blue
merdeka.demo@example.com         senior     1955-03-21  born citizen         $1,501-2,300  Merdeka Generation, CHAS Orange
late.citizen.demo@example.com    senior     1946-11-02  citizen since 1990   above $2,300  Missed Pioneer (citizen after 1986); Merdeka instead
chas.demo@example.com            senior     1975-06-15  born citizen         up to $1,500  CHAS Blue only
pr.demo@example.com              senior     1958-01-30  permanent resident   not set       Polyclinic PR rates only
chas.orange.demo@example.com     senior     1968-09-04  born citizen         $1,501-2,300  CHAS Orange only
chas.green.demo@example.com      senior     1972-04-18  born citizen         above $2,300  CHAS Green only
unsure.demo@example.com          senior     1952-12-01  born citizen         unsure        Merdeka; CHAS card colour not known
foreigner.demo@example.com       senior     1960-07-07  neither citizen/PR   not set       No estimates, schemes with official links only
caregiver.demo@example.com       caregiver  1978-05-10  born citizen         above $2,300  Linked to pioneer.demo and merdeka.demo

The seed script also fills each senior with fake medicines (on Schedule), saved scans and bills
(in History) and a week of dose ticks. pioneer.demo and merdeka.demo have the fullest schedules;
caregiver.demo sees both seniors' doses today. Re-run the script to refresh the ticks to today.
Scanning the built-in samples needs no login:
Home > Scan a medicine label > Try an example > Metformin label.

3. SETUP (local)
----------------
Requires Node 22.9+ and pnpm.

    pnpm install
    cp .env.example .env     (USE_MOCK_AI=true works without any AI key;
                              accounts need MONGODB_URI and a JWT_SECRET of 32+ bytes)
    node --env-file=.env server/scripts/seed-demo-accounts.js
    pnpm server              (API, http://localhost:3000)
    pnpm dev                 (app, http://localhost:5173, in a second terminal)

No Atlas account: use "pnpm server:local" instead of "pnpm server" (throwaway database).
Tests: pnpm test, pnpm test:e2e (port 3000 must be free), pnpm build.
Full details: README.md.

4. AI / LLM USE DECLARATION
---------------------------
Tool used: Claude Code (Anthropic).

4A. Lower-order tasks Claude helped with (allowed by the course)
- Information search: library and API documentation, free-tier limits of the AI
  services, error-message meanings.
- Explaining coding errors and giving debugging hints.
- Boilerplate: starter code and code snippets.
- Unit tests, sample inputs and mock data: Vitest unit and API tests, the k6 load
  test (load/), mock AI responses (server/fixtures/), sample label and bill images
  (public/samples/).
- End-to-end tests (Playwright). There are two sets:
  * "E2E complex" (e2e/, run with pnpm test:e2e): created by Claude. Large set of
    specs with the AI mocked, including accessibility (axe) and senior-friendly checks.
  * "E2E simple" (e2e-simple/, run with pnpm test:e2e:simple): made by our team, not
    by Claude. Short specs, 5 per feature, against the real server and a throwaway
    database.
- Layout, theme and UI/UX ideas, and accessibility checks (axe) with small fixes
  such as font sizes and focus rings.
- Documentation: README.md, the docs/ data contracts, E2E_REPORT.md.
- Formatting the codebase with Prettier.
- Demo data: the seeded medicines, saved scans and dose ticks for the demo accounts
  (server/scripts/demo-data.js, seed-demo-accounts.js).
- Code comment cleanup (Nov 2026): removed irrelevant comments (lecture-week tags,
  file owner tags), and added short comments saying what each function and each
  source file is for. Comments only, no logic changed.

4B. Frontend: where Claude went beyond the lower-order tasks
The frontend was not built entirely by Claude. The features, user flows and task
split were defined by the team in our proposal. Each member used Claude to guide
them through implementing their own area, and Claude provided the skeleton
structure of the code (file layout, views, components). We then built on it,
reviewed, integrated, tested and debugged the result. Per member:

Asher (Scan/upload, Confirm, Explain, language switcher, read-aloud)
- Asked Claude for: TODO (e.g. how to structure the Scan > Confirm > Explain flow)
- Claude provided the skeleton structure of the code (views, components, file layout)
  for the Scan, Confirm and Explain views, the read-aloud component and the
  confirm-field component, and guided us on how to implement them.
- Our part: TODO (e.g. filled in and adapted the skeleton, translations, wiring to
  the API)

Isaac (design system, app shell, routing, login/signup, history, shared views)
- Asked Claude for: TODO (e.g. layout and styling approach for senior-friendly UI)
- Claude provided the skeleton structure for the app shell and Home styling, and
  guided us on layout and styling.
- Our part: TODO (e.g. built out routing, login/signup and history pages from that
  structure)

Lokesh (medication schedule, bill breakdown, subsidy questionnaire)
- Asked Claude for: TODO (e.g. how to build the weekly schedule view)
- Claude provided the skeleton structure for the Schedule redesign (ScheduleView,
  WeekView) and the bill "doesn't add up" notes (Confirm, Bill), and guided us
  through implementing them.
- Our part: TODO (e.g. adjusted the code, subsidy questionnaire, bill breakdown UI)

Zachary (team lead, integration and fixes)
- Asked Claude for: day/night mode (Account, theme prompt), and the frontend
  restructuring from 2 Nov 2026 (Pinia stores, Axios through src/api/client.js,
  Vitest, splitting large views into components). The restructuring touched files
  owned by every member.
- Claude gave: the first implementation of the above, which we then reviewed,
  tested and adjusted.
- Bug fixes found in review: dose-card and History delete dialog focus handling,
  caregiver invite link, "Not ticked yet" calendar alert.

Complex logic beyond what we have been taught in class: the Schedule redesign,
day/night mode, bill "doesn't add up" notes, and the Pinia/Axios restructuring.
Claude wrote the first implementation of these and we reviewed and adjusted it.

Backend (not frontend): Gemini model fallback and thinking settings
(server/services/gemini.js) were written by Claude on Zachary's request.

TODO: each member to replace the TODO lines with what they actually asked Claude
and what they did themselves, and to remove anything that is not accurate.

4C. Not AI-generated
The rule-based schedule, subsidy and bill-check logic, and the explanation
templates are our own rules, not AI output. At runtime the app calls Gemini
(and Groq as backup) only to read text from photos and to answer Ask-chatbot
questions; explanations shown to users come from human-checked templates.
TODO: team to confirm which members wrote which of these.

5. TEAM
-------
Zachary (lead), Sheen Hern, Asher, Lokesh, Isaac.
See README.md for who owned what.

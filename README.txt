AH MA AH GONG CAN - IS216 G7 T8
================================

A web app that turns a photo of a medicine label or medical bill into a plain-language
explanation in English, Chinese, Malay or Tamil, read aloud.

1. LIVE URL
-----------
https://ahma-ahgong-can.vercel.app     (TODO: confirm it is the final deployment)

2. DUMMY LOGINS (password for all: Demo1234!)
---------------------------------------------
pioneer.demo@example.com       senior (Pioneer Generation, CHAS Blue)
merdeka.demo@example.com       senior (Merdeka Generation, CHAS Orange)
caregiver.demo@example.com     caregiver, linked to the two seniors above
(7 more demo seniors are created by the seed script below.)
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
- Unit tests, sample inputs and mock data: Vitest unit and API tests, Playwright
  end-to-end specs (e2e/, e2e-simple/), the k6 load test (load/), mock AI responses
  (server/fixtures/), sample label and bill images (public/samples/).
- Layout, theme and UI/UX ideas, and accessibility checks (axe) with small fixes
  such as font sizes and focus rings.
- Documentation: README.md, the docs/ data contracts, E2E_REPORT.md.
- Formatting the codebase with Prettier.

4B. Parts where Claude wrote implementation code (higher-order; declared in full)
TODO: each owner to confirm, correct or remove the lines below before submission.
- Early versions of the Scan, Confirm and Explain views, the read-aloud component and
  the confirm-field component (owner: Asher), and shell/Home styling (owner: Isaac).
- Backend (server/): Gemini model fallback and thinking settings in
  server/services/gemini.js, and other backend code written on Zachary's request.
- Day/night mode (Account, theme prompt), the bill "doesn't add up" notes
  (Confirm, Bill) and the Schedule redesign (ScheduleView, WeekView), written on
  Zachary's request.
- From 2 Nov 2026: refactoring the frontend to the lecture tools (Pinia stores,
  Axios through src/api/client.js, Vitest), splitting large views into components,
  removing dead code. This touched files owned by every member.
- Bug fixes made with Claude after review (e.g. dose-card and History delete
  dialog focus handling, caregiver invite link, "Not ticked yet" calendar alert).
  TODO: list any further feature Claude wrote that is not named above.

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

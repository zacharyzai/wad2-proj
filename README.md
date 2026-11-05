# Ah Ma Ah Gong Can

A web app that explains medicine labels and medical bills in plain language, in four languages, read aloud.

IS216 Web Application Development II, G7 T8.

## Overview

Many elderly Singaporeans struggle with English-only medicine labels and with bills full of subsidy jargon (CHAS, Pioneer/Merdeka Generation, MediSave). The app is for seniors and the caregivers who help them. The user photographs a label or bill, checks the text the app read, and gets an explanation in English, Chinese, Malay or Tamil that can be read aloud. It supports doctors and pharmacists and does not replace them.

## Key Features

- Scan, Confirm, Explain: extracted fields are shown beside the photo and must be confirmed; unclear fields are flagged, never guessed. Built-in sample scans need no login.
- Explanations come from pre-written, human-checked templates, with a one-question understanding check.
- Whole UI in English, 中文, Bahasa Melayu and தமிழ்; read-aloud with replay and speed control (browser voice first, server voice fallback).
- Daily medicine schedule built by rule-based logic; doses can be ticked, edited and removed; non-standard instructions are flagged for a pharmacist.
- Bill breakdown with a subsidy checker (estimates only where official figures exist; otherwise schemes are listed with links).
- Accounts and scan history; a senior can invite a caregiver by link for a read-only view of today's doses.
- Personal details (name, NRIC, address, phone) are covered on the device before upload; photos are never stored.
- Optional: Ask chatbot about confirmed medicines, and Google Calendar dose reminders.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3, Vue Router, Pinia, vue-i18n, Bootstrap 5, Vite |
| Backend | Node.js 22.9+, Express 5, express-rate-limit, JSON Web Tokens, Argon2 password hashing |
| Database | MongoDB Atlas via Mongoose |
| APIs / Libraries | Google Gemini (photo reading, chatbot, speech), Groq (backup), Google Calendar, Brevo or Resend (reset emails), Tesseract.js and pdf.js (on-device covering and PDFs), Axios |
| Testing | Vitest, Vue Test Utils, Playwright, axe-core |
| Deployment | Vercel (Express runs as one function in `api/index.js`) |

## Getting Started

### Prerequisites

- Node.js 22.9 or later
- pnpm (`npm install -g pnpm` or `corepack enable`). Use pnpm only.
- A MongoDB database (Atlas) for accounts. Scanning the built-in samples works without one.

### Install and run

```bash
pnpm install
cp .env.example .env     # then edit .env (see below)
pnpm server              # API on http://localhost:3000
pnpm dev                 # app on http://localhost:5173 (second terminal)
```

No Atlas account? `pnpm server:local` runs the API with a throwaway local database (see `docs/auth.md`).

### Environment variables

Set in `.env` (never committed). Full list with comments in `.env.example`.

```
USE_MOCK_AI=true                 # true = fixed sample answers, no AI key needed
GEMINI_API_KEY=your-gemini-key   # needed only when USE_MOCK_AI is not true
GROQ_API_KEY=your-groq-key       # optional backup
MONGODB_URI=mongodb+srv://user:password@cluster.example.mongodb.net/wad2_dev
JWT_SECRET=replace-with-random-string-of-32-or-more-bytes
APP_URL=http://localhost:5173
MAIL_PROVIDER=console            # console prints reset emails in the server terminal
GOOGLE_CLIENT_ID=your-client-id            # optional, Calendar reminders
GOOGLE_CLIENT_SECRET=your-client-secret    # optional
GOOGLE_REDIRECT_URI=http://localhost:5173/api/google/callback
GOOGLE_TOKEN_KEY=base64-32-byte-key        # optional
```

### Demo login

Create the demo accounts once (safe to re-run):

```bash
node --env-file=.env server/scripts/seed-demo-accounts.js
```

| Email | Role | Password |
|---|---|---|
| `pioneer.demo@example.com` | Senior (Pioneer Generation, CHAS Blue) | `Demo1234!` |
| `merdeka.demo@example.com` | Senior (Merdeka Generation, CHAS Orange) | `Demo1234!` |
| `caregiver.demo@example.com` | Caregiver, linked to the two seniors above | `Demo1234!` |
| `late.citizen.demo@example.com` | Senior (citizen since 1990, missed Pioneer, Merdeka instead) | `Demo1234!` |
| `chas.demo@example.com` | Senior (CHAS Blue only) | `Demo1234!` |
| `chas.orange.demo@example.com` | Senior (CHAS Orange only) | `Demo1234!` |
| `chas.green.demo@example.com` | Senior (CHAS Green only) | `Demo1234!` |
| `pr.demo@example.com` | Senior (permanent resident, polyclinic PR rates only) | `Demo1234!` |
| `unsure.demo@example.com` | Senior (Merdeka, CHAS card colour not known) | `Demo1234!` |
| `foreigner.demo@example.com` | Senior (neither citizen nor PR, schemes with official links only) | `Demo1234!` |

It also fills every senior with fake data (`server/scripts/demo-data.js`): medicines on their Schedule, saved scans in History (the sample labels and bills), and a week of dose ticks. Pioneer and Merdeka, the two seniors the caregiver follows, have the fullest schedules, so `caregiver.demo@example.com` shows their doses today. Pioneer has one dose left unticked after about midday, to show the "Not ticked yet" flag. Re-running the script resets those accounts' data and refreshes the ticks to today.
Quick try (no login needed): Home, Scan a medicine label, Try an example, Metformin label.

### Tests

```bash
pnpm test                # Vitest unit and API tests
pnpm test:e2e            # Playwright, AI mocked (port 3000 must be free)
pnpm test:e2e:simple     # Playwright against a real server and throwaway database
pnpm build               # production build
pnpm format              # Prettier
```

## Project Structure

```
api/index.js        Vercel entry: runs the Express app as one function
docs/               Data contracts (scan, auth, care, chat, doses, history, Google)
e2e/, e2e-simple/   Playwright specs
load/               k6 load test
public/samples/     Sample label and bill images
server/             Express API
  routes/           Scan, auth, history, care, doses, schedule, chat, tts, Google
  services/         Gemini/Groq calls, chat, tts, mail, Google Calendar, scan normalising
  models/           Mongoose models
  middleware/       Auth and rate limiting
  fixtures/         Mock AI responses
src/                Vue app
  views/            One view per page
  components/       Components grouped by feature
  stores/           Pinia stores
  rules/            Schedule, subsidy and password rules
  i18n/locales/     en, zh, ms, ta strings
  api/client.js     The only place the frontend calls the backend
  styles/           Design tokens and component styles
vercel.json         Routing for the deployed app
CONTRIBUTING.md     Branching, pull requests, file ownership
```

## Where AI was used

The team defined the application's features, user flows and division of work. Claude Code was used as a development assistant to help plan the initial skeleton structure and file hierarchy for the application and for individual features. It provided starting structures for views, components and supporting files, explained implementation approaches, and helped troubleshoot issues. Each member then adapted the starting points for their assigned feature, implemented and integrated the required behaviour, and reviewed and tested the resulting code.

| Feature / Area | How Claude Code was used | AI Used | Member |
| --- | --- | --- | --- |
| Scan, Confirm and Explain | Guided the initial structure of the three-step scanning flow, including the Scan, Confirm and Explain views and supporting components such as the photo picker, confirm-field component and read-aloud component. It helped plan how scan results move between these views and how users can review and correct extracted fields before proceeding to an explanation. | Claude Code | Asher |
| Language support and read-aloud interface | Helped establish the component structure and implementation approach for the language switcher and read-aloud experience across the scan and explanation flow. Asher adapted the structure and worked on the translations and user-facing behaviour. | Claude Code | Asher |
| App shell, Home and shared design | Provided the initial skeleton and file/component hierarchy for the application shell and Home page. It guided the layout of shared navigation, page structure and Home entry points, which Isaac then developed into the application's shared interface and design system. | Claude Code | Isaac |
| Login, Signup and frontend account/history pages | Helped plan the page and component structure and how these pages fit into the app shell and navigation. Isaac adapted the generated starting structures for the frontend pages and their interactions. Backend account, database and history services are attributed separately to Sheen Hern. | Claude Code | Isaac |
| Backend foundations: database, accounts, history and caregivers | For the backend areas owned by Sheen Hern, Claude Code was used to guide the initial organisation of the server-side structure and file hierarchy, and to explain implementation approaches for the database models and the account, history and caregiver-related services. Sheen then developed and integrated these backend features. | Claude Code | Sheen Hern |
| Cloud read-aloud and deployment | Helped with the initial structure and implementation guidance for the server-side read-aloud and deployment-related work. Sheen integrated these with the backend and application deployment setup. | Claude Code | Sheen Hern |
| Medication Schedule | Guided the Schedule redesign by generating initial structures for `ScheduleView` and `WeekView`, and advising on how to organise the Today view, weekly timetable and medicine list. It also helped with the structure of the supporting schedule components and their interactions. | Claude Code | Lokesh |
| Bill breakdown and subsidy questionnaire | Assisted with the initial structure of the Bill page and supporting components, including the bill breakdown and subsidy questionnaire. It also helped design the “doesn't add up” notes in Confirm and Bill, which flag differences between bill line items, subtotals and totals. | Claude Code | Lokesh |
| Scan API, photo reading and on-device covering | Helped guide the backend scan flow and the structure of the scan-related services. It was also used to investigate implementation approaches for AI-based photo reading and the on-device covering/redaction workflow. Zachary implemented and integrated these with the frontend scan process. | Claude Code | Zachary |
| Ask chatbot | Helped plan the chatbot component structure and the flow for submitting medicine-related questions and displaying responses. It was also used to research and compare suitable AI APIs for the chatbot implementation. | Claude Code | Zachary |
| Google Calendar reminders | Provided implementation guidance and starter structures for connecting medicine schedules with Google Calendar reminders. Zachary adapted and integrated the feature with the application's schedule and backend. | Claude Code | Zachary |
| Day/night mode | Generated the first implementation of the theme functionality, including the Account page controls and theme prompt. Zachary reviewed and adjusted the implementation to fit the existing interface. | Claude Code | Zachary |
| Frontend restructuring (2 November 2026) | Guided the restructuring and helped with the first implementation of Pinia stores for shared state, centralising frontend HTTP requests through Axios in `src/api/client.js`, introducing Vitest, and splitting large views into smaller components. This work touched files owned by multiple members and was subsequently reviewed and integrated. | Claude Code | Zachary |
| Gemini fallback | Helped implement model fallback and thinking settings in `server/services/gemini.js`. Zachary reviewed and adjusted the implementation for the backend's Gemini integration. | Claude Code | Zachary |
| Bug fixes and integration | Assisted with investigating and fixing issues found during integration and testing, including dose-card and History delete-dialog focus handling, caregiver invitation links, and the “Not ticked yet” calendar alert. | Claude Code | Zachary |
| Unit, API and supporting test materials | Helped generate Vitest unit and API test scaffolding, mock AI responses in `server/fixtures/`, the k6 load-test starting point in `load/`, and sample label and bill images in `public/samples/`. The team reviewed and adapted these materials. | Claude Code | Zachary |
| Complex E2E tests | Generated the Playwright E2E suite in `e2e/`, including its test structure and scenarios that run with mocked AI responses. The suite also includes accessibility checks using axe-core and checks for senior-friendly interactions. | Claude Code | Zachary |
| Simple E2E tests (50 test cases) | Claude Code was used to generate and guide the Playwright setup and overall test-file structure in `e2e-simple/`. The 50 simple test cases themselves were written by the team, not generated by Claude Code. Each member wrote tests for the features under their respective responsibilities: Asher for Scan/Confirm/Explain and language/read-aloud; Isaac for the app shell and frontend pages; Sheen Hern for backend account, history and caregiver-related flows; Lokesh for Schedule and Bill; and Zachary for scan API, Ask chatbot and integration-related flows. | Claude Code (setup and scaffolding only); test cases written by team | All members |

### How the team used Claude Code

Claude Code was used as a guide and a starting point rather than as a replacement for each member's development work. For an assigned feature, the member described the intended functionality and user flow, asked Claude Code to suggest a suitable file hierarchy and view/component structure, and used its generated skeleton as a starting point. Members then filled in and adapted the feature-specific implementation, connected it to the relevant stores and API calls, incorporated the required UI behaviour, and tested and debugged the result as part of the integrated application.

Other development assistance included looking up library and API documentation, checking AI service free-tier limits, interpreting error messages, explaining code and debugging approaches, suggesting UI/UX and accessibility improvements, and helping with project documentation and formatting.

### Work not generated by AI

The application's core rule-based behaviour was designed and implemented by the team rather than generated as AI output. This includes the medicine scheduling rules, subsidy and bill-check calculations, and the human-checked explanation templates. At runtime, Gemini (with Groq as a backup where configured) is used for photo text extraction and to answer questions in the Ask chatbot; the explanations presented to users are based on the team's pre-written templates.

## Team

| Member | Contribution |
|---|---|
| Zachary | Scan API and AI reading, on-device covering, Ask chatbot, Google Calendar |
| Sheen Hern | Database, accounts, history, caregivers, cloud read-aloud, deployment |
| Asher | Scan, Confirm and Explain pages, translations, read-aloud |
| Lokesh | Schedule and Bill pages, subsidy rules, samples |
| Isaac | Design system, app shell, Home, Login, Account and History pages |


TODO: confirm names and contributions above.

## Links

- Live demo: https://ahma-ahgong-can.vercel.app
- Demo video: TODO add link

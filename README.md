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

## How AI was used

The team defined the features and user flows. **Claude Code** helped generate the initial project skeleton, file hierarchy, view/component structures and implementation guidance. Members adapted, integrated, reviewed and tested the work for their respective features.

| Feature / Area | How AI was used | AI Used | Member |
| --- | --- | --- | --- |
| Scan, Confirm, Explain and translations | Suggested the structure for the scan-to-explanation flow, field confirmation, language switching and read-aloud components. | Claude Code | Asher |
| App design and frontend pages | Provided skeletons and styling guidance for the app shell, Home, Login, Signup, Account and History pages. | Claude Code | Isaac |
| Database, accounts and caregiver features | Guided the server file hierarchy and implementation of database models, authentication, history, caregiver services, cloud read-aloud and deployment. | Claude Code | Sheen Hern |
| Schedule and Bill | Generated starting structures for the daily/weekly medicine schedule, bill breakdown and subsidy questionnaire, including bill-total discrepancy notes. | Claude Code | Lokesh |
| Scan API, chatbot and reminders | Guided the scan API and photo-redaction flow, Ask chatbot structure, AI API selection and Google Calendar integration. | Claude Code | Zachary |
| Theme and frontend restructuring | Helped implement day/night mode and restructure shared state with Pinia, API requests with Axios and large views into components. | Claude Code | Zachary |
| Backend fixes, testing and documentation | Assisted with Gemini fallback, integration bugs, Vitest/API tests, load-test scaffolding, mock data, accessibility checks and documentation. | Claude Code | Zachary |
| Complex E2E tests | Generated the Playwright tests in `e2e/`, including mocked AI and accessibility checks. | Claude Code | Zachary |
| **50 simple E2E test cases** | Claude Code helped set up the Playwright framework and test-file structure in `e2e-simple/`. **Each team member wrote their own simple test cases for their assigned features; Claude Code did not generate those 50 cases.** | Claude Code (setup only) | All members |

The **rule-based scheduling, subsidy and bill-check logic, and human-checked explanation templates** were developed by the team, not generated by AI. At runtime, Gemini (with Groq as backup) supports photo reading and the Ask chatbot; the standard explanations use the team's templates.

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

# Final phase checklist

**Submission: Fri 6 Nov 2026, 9:00am, on eLearn** (Assignments → Final Project Deliverables (G7)). One submission for the team.
Late by under 1 hour = −10% of the whole project. Later than that = 0. **Aim to submit Thu 5 Nov, 11pm.**

**Presentation: Week 13, G7 slot 14:30–14:50 (team 8).** 12 min slides + demo, then 3 min Q&A. Everyone presents. Arrive 10 min early. Smart casual (no bermudas or slippers).

---

## 1. Code freeze (Thu 5 Nov, 6pm)

After 6pm, only fixes for bugs that break the demo. No new features, no restyling.

- [ ] Merge every open branch into `main` (PR + 1 approval, squash merge)
- [ ] Vercel deploy of the final `main` is green; open the live site on a phone and a laptop
- [ ] Live site: all 10 demo accounts log in (`Demo1234!`). If not, rerun `node --env-file=.env server/scripts/seed-demo-accounts.js` against Atlas
- [ ] Live site: one **real** photo scan works (Gemini key and quota set in Vercel), Ask answers, Calendar connects
- [ ] `pnpm test` and `pnpm test:e2e` pass on one laptop (stop your own `pnpm server` first)
- [ ] Update the Results line in `e2e/E2E_REPORT.md` with the new numbers

## 2. Submission zip (Sheen Hern, checked by Zachary)

The zip needs exactly 3 things:

| Item | Notes |
|---|---|
| Source code | `index.html` at the root of the zip. Leave out `node_modules/`, `.env`, `dist/`, `playwright-report/`, `test-results/`. Use `git archive -o src.zip HEAD` so only committed files go in |
| `README.txt` | Setup and run steps, **live URL**, demo login(s) and password, how to run tests, AI-use declaration. Short; point to README.md for detail |
| Slides (.pptx or .pdf) | **Page 1: YouTube link + live app link** |

Before uploading: unzip it into a fresh folder, follow README.txt from scratch (`pnpm install`, `.env`, `pnpm server` + `pnpm dev`) and check the app opens.

## 3. Slides (everyone, Zachary assigns)

Must cover (from the briefing):

1. **Problem, with facts**: seniors and caregivers can't read medicine labels and bills; cite a source for each statistic
2. **Solution and design**: Scan → Check → Explain; senior-first design (big text, 4 languages, read aloud)
3. **JavaScript / Vue**: Vue 3, Pinia stores, Vue Router, components, Axios client
4. **Styling and responsiveness**: Bootstrap 5 + our design tokens; phone vs desktop sizing; reduce motion
5. **Data store**: MongoDB Atlas (accounts, scans, doses, caregiver links)
6. **External APIs**: Gemini (reading photos, Ask), Google Calendar (reminders), text-to-speech; how each is called
7. **Testing**: Vitest + Playwright, number of tests, phone and desktop, axe accessibility checks
8. **Beyond the minimum**: on-phone covering of personal details, Argon2id passwords, Groq fallback, i18n, caregiver role
9. **GitHub collaboration**: branches, PRs with review, protected `main`

No full code on slides. Short snippets only.

## 4. Video (Thu 5 Nov)

- [ ] Max **12 minutes**, 1080p (at least 720p)
- [ ] Every member speaks
- [ ] Demo in **Chrome**; resize the window (or DevTools device mode) to show it is responsive
- [ ] Upload to YouTube as **Unlisted**; paste the link on slide 1
- [ ] Watch it once through before submitting (sound, nothing private on screen, no real `.env` values)

## 5. Demo script (rehearse twice)

Use mocked or example data where possible, so a slow AI quota can't break it. Keep one recorded backup clip of each step.

| # | Who | What | Time |
|---|---|---|---|
| 1 | Zachary | Problem and landing page | 1:30 |
| 2 | Asher | Scan → Check → Explain (Metformin example), read aloud, switch to 中文 | 2:00 |
| 3 | Lokesh | Schedule (tick a dose), bill example, subsidies change between `pioneer.demo` and `pr.demo` | 2:00 |
| 4 | Zachary | Ask chatbot (incl. "chest pain" → Call 995), Google Calendar reminders | 1:30 |
| 5 | Sheen Hern | Caregiver view, invite link, data store and deploy | 1:30 |
| 6 | Isaac | Design system, responsive resize, accessibility, testing | 1:30 |
| 7 | Zachary | Wrap-up, what's next | 0:30 |
|  |  | **Buffer** | 1:30 |

## 6. Q&A prep

Likely questions. Each owner prepares a 30-second answer.

- Why trust AI with medicine? (You check every field; explanations are templates; schedule and subsidy rules are our own code)
- What happens to the photos? (Covered on the phone, never stored)
- What if the AI quota runs out? (Groq fallback, daily caps, examples)
- How do you know the subsidy figures are right? (Official MOH/CHAS pages, date last checked)
- What would you build next? (Caregiver missed-dose alert, clinics map, RAG over official drug info)
- How did you split the work and handle merges?

## 7. Also due

- [ ] Peer evaluation form (week 11), if anyone hasn't submitted

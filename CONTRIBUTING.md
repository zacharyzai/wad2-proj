# Contributing

## Workflow
1. Pull the latest `main`: `git checkout main && git pull`
2. Create a branch: `feat/<area>-<thing>` or `fix/<area>-<thing>` (e.g. `feat/schedule-tickoff`, `fix/scan-compression`)
3. Commit small and often. Push and open a **Pull Request** into `main`.
4. At least **1 approval** is needed. `main` is protected: no direct pushes and no force-pushes.
5. **Squash merge**, then delete the branch.

Keep PRs to one feature. Every PR for a core feature includes its Playwright spec (see the PR template).

## Who owns what
Edit your own files freely. Ask the owner before changing someone else's.

| Area | Owner | Files |
|---|---|---|
| Repo, scan contract, `/api/scan`, Gemini | Zachary | `docs/scan-contract.md`, `server/routes/scan.js`, `server/services/`, `server/fixtures/`, `server/middleware/rateLimit.js` |
| DB, auth, history, share links, cloud TTS, deploy, README.txt | Sheen Hern | `server/models/`, `server/routes/{auth,history,share,tts}.js`, deploy config |
| Upload/camera, confirm screen, explanations, i18n, read-aloud | Asher | `src/views/{Scan,Confirm,Explain}View.vue`, `src/components/{scan,explain}/`, `src/i18n/` |
| Schedule, bill breakdown, subsidy questionnaire, samples | Lokesh | `src/views/{Schedule,Bill}View.vue`, `src/components/{schedule,bill}/`, `public/samples/` |
| Design system, app shell, auth/history/shared pages, Playwright helpers | Isaac | `src/App.vue`, `src/assets/`, `src/components/{layout,history}/`, `src/views/{Home,Login,Signup,History,Shared,NotFound}View.vue`, `playwright.config.js` |

Shared files, where you add to them but don't restructure: `src/router/index.js` (all routes are already registered), `src/i18n/locales/*.json` (add your keys under your own section), `package.json`.

## Rules
- Call the backend only through `src/api/client.js`. It always resolves to `{ ok, data }` or `{ ok: false, error }`.
- Every piece of user-facing text goes through `t('...')`, with keys in **en, zh, ms and ta**.
- Use Bootstrap utilities and components first. Isaac's tokens are in `src/assets/main.css`.
- Use only sample data, never real patient data. Never commit `.env`.

# Local validation results

## Deployment follow-up — September 11, 2026

The user completed the Render/Atlas deployment. An independent HTTP request to `https://xperience-event-assistant.onrender.com/api/health` returned HTTP 200 and `{"status":"ok"}` on September 11. No full suite, production build, or browser QA was repeated for the submission documentation changes. The results and limitations below describe the earlier local validation, not a new hosted end-to-end test. The walkthrough video is still unrecorded.

## Earlier local checks

Verified on September 9, 2026, using Node.js 26.0.0, npm 11.12.1, MongoDB 8.2.7, Next.js 16.3.4, and Vitest 4.1.11.

| Check | Result |
| --- | --- |
| Automated tests | 29 passed across domain, API integration, Gemini adapter, and workspace-tool contract tests |
| TypeScript | Shared package, API, and frontend checks passed |
| Production compilation | `npm run build` passed; Next.js generated the application and not-found routes |
| Lockfile installation validation | `npm ci --dry-run --ignore-scripts` passed |
| Dependency audit | No known vulnerabilities reported after updating the test tooling; production-only audit also passed |
| Development preview | Page returned HTTP 200; API proxy and authentication workflow passed |
| Production startup | `npm start` launched Next.js and Express successfully |
| Production smoke test | Page, API proxy, registration cookies, event creation, proposal approval, saved-state reload, 50-person transport risk, deletion, and logout passed |

Tests used an isolated temporary MongoDB process. Proxy smoke tests created uniquely identified temporary accounts and removed those accounts and their events afterward. The application database was preserved.

The development launcher now uses polling after native file watching exceeded this host’s watcher limit. The working launcher was verified before the final production run.

## Rejected proposal regression

The reported event contained no saved tasks and a correctly rejected proposal. The misleading duplicate-task response came from sending earlier assistant claims to Gemini without proposal outcomes. The fix makes the saved plan authoritative, includes explicit proposal statuses, retains structured clarification questions, and excludes old assistant prose from state context. Live proposal receipts now explicitly state that nothing has been applied yet.

Regression tests cover rejected and stale proposal context, preservation of actual saved tasks, truthful pending receipts, and rejecting then resubmitting the same task before approving exactly one task. An isolated real Gemini request with the original misleading conversation returned a fresh proposal while leaving the saved task list empty. The full live API regression also passed, including a fresh proposal, no task before approval, exactly one task after approval, and preservation of the original rejection. Temporary test data was removed. The user's existing events and conversations were preserved.

## Verification boundaries

- Google accepted the supplied API key. The live production proxy-to-Gemini regression passed: a rejected task request produced a fresh pending proposal, approval created exactly one task, and the original rejection was preserved. Earlier checks encountered provider 503 high-demand responses; service availability is external to the app. The key is stored only in the ignored local `.env`.
- The model-facing schema now omits decoder-heavy bounds and uses singleton enums for discriminators; full Zod and domain validation remain mandatory. The provider deadline is 60 seconds and the proxy deadline is 75 seconds so controlled errors reach the UI. Overload, quota, and timeout paths are regression tested.
- Visual, responsive, keyboard, and screen-reader checks are listed in `QA_CHECKLIST.md`; they are not marked as completed.
- The optional WebMCP tool contract passed a mock-registry test. Registration was unavailable in the preview browser, so browser-level WebMCP support is not verified.
- Docker was not available on this host. The Dockerfile and AWS guide are provided, but no container build or cloud deployment is claimed.
- The demo deliverable is a recording script, not a finished video.

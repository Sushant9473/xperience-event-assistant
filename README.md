# Xperience Event Management Assistant

An assessment MVP that turns an event manager’s conversation into a structured event plan. The assistant proposes changes; the manager reviews the before/after values and approves them. Only then do tasks, vendors, sessions, deadlines, and risks update.

**[Open the live application](https://xperience-event-assistant.onrender.com)** · **[Recording outline](docs/DEMO_SCRIPT.md)**

Register your own account to try the app. Choose a clearly labeled wedding or corporate demo for deterministic sample conversations, or create an event in Live Gemini mode for free-form planning. The deployed database is separate from local development data. The walkthrough video has not been recorded yet.

## Hosted deployment

The app is hosted on Render Free with MongoDB Atlas. `render.yaml` defines one Docker web service; Next.js listens on Render's public port and proxies `/api` to Express on loopback port 4000. Render generates the JWT secret; Atlas and Gemini credentials are supplied as private environment variables. `APP_ORIGIN` defaults to Render's HTTPS `RENDER_EXTERNAL_URL`. The deployed database name is `xperience_resume` and the Gemini model is `gemini-3.1-flash-lite`.

The free service can take time to wake after inactivity. Live AI also depends on provider availability and quota. The public health endpoint returned HTTP 200 with `{"status":"ok"}` on September 11, 2026; this readiness check is separate from the earlier local functional validation.

## Run locally

Requirements: Node.js 22.12 or later, npm, and MongoDB Community Server (`mongod`) on your PATH. MongoDB Atlas can replace the local database. The committed lockfile pins the tested dependencies.

From this project directory:

```sh
npm ci
npm run setup
```

`setup` creates a private `.env` with a random JWT signing secret. It preserves an existing `.env`. No Gemini key is needed for demo mode.

In one terminal, start the project’s isolated local database:

```sh
npm run db
```

In another terminal, start the application:

```sh
npm run dev
```

Open **http://127.0.0.1:3000**, create an account, and choose a wedding or corporate scenario. Review and approve the initial proposal, then expand **Try a scenario update** in the assistant to continue.

Use that exact host: the default request-origin check accepts `http://127.0.0.1:3000`. If you prefer `localhost`, change `APP_ORIGIN` accordingly and restart the API. The database runs on loopback port **27019**, separately from any ordinary MongoDB instance on 27017. Its files stay in `.data/mongo`.

The development launcher uses polling to avoid native file-watcher limits on macOS. Shared package edits require rerunning `npm run build -w @event/shared`; web and API edits reload automatically.

For a production build on this machine, stop the development server first:

```sh
npm run build
npm start
```

Keep MongoDB running. Stop the app and database with Ctrl+C in their respective terminals.

## Live Gemini

Add `GEMINI_API_KEY` to the root `.env`, restart the API, and select **Live Gemini** when creating an event or under **Event settings**. The model is configurable through `GEMINI_MODEL`; the default is `gemini-3.1-flash-lite`. Use a model available to your API project that supports structured JSON output.

The Google GenAI SDK runs only in Express. Neither the key nor JWT signing secret is sent to the browser. Responses use a JSON schema and are validated again with Zod and domain rules. See [Google’s structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output).

If the provider times out, rejects a request, or returns invalid data, the UI displays an error with a retry action. The saved plan remains unchanged. Live requests never silently become simulated demo responses. A real Gemini request was verified through the production API proxy: resubmitting a rejected task request generated a fresh proposal, and approval created exactly one task while preserving the prior rejection. Google can still return temporary high-demand responses; the app reports provider overload, quota, and timeout errors explicitly.

## What the MVP includes

- Registration, sign-in, sign-out, and private event ownership.
- Saved event list and an event workspace with overview, tasks, vendors, schedule, and activity views.
- Desktop dashboard beside the assistant; mobile dashboard/assistant switching.
- Direct editing of event details, tasks, assignees, priority, dependencies, vendor availability and capacity, and sessions.
- Reviewable assistant proposals with reasons, before/after values, approval, rejection, and revision requests.
- Deterministic alerts for overdue tasks, unavailable or unconfirmed vendors, blocked tasks, capacity gaps, and unresolved planning dates.
- Persistent relative task deadlines. Moving an anchor date recalculates its deadlines and includes those changes in the review/history.
- Fictional wedding and corporate scenarios with explicit demo labels.

Demo mode recognizes the suggested assessment prompts only; other text returns a clear explanation without changes. Direct editors work normally in both modes. Free-form planning and revision requests require live Gemini. The sample cards create dates 30 days ahead and explicitly label these as fictional sample dates. Manually created events preserve unknown dates.

## Product approach

The core problem is keeping a changing event plan consistent. A chatbot response alone does not solve that. This project makes the assistant’s output reviewable, ties each proposal to an event revision, and separates factual risk calculations from AI suggestions.

For example, a corporate transport vendor offering 150 seats for 200 employees creates a reproducible **50-person shortfall**. AI can suggest an action, but the risk clears only after the manager confirms adequate capacity. A missing Reception photographer stays linked to that session, so the response identifies the affected part of the event.

## Architecture

```text
Browser / Next.js
  └── same-origin /api proxy
        └── Express: authentication + ownership + input validation
              ├── Gemini adapter OR explicitly selected demo adapter
              ├── shared operation validation + deadline/risk engine
              └── MongoDB: users + owned event documents
```

| Workspace         | Responsibility                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | Next.js App Router, React, Tailwind/CSS, accessible native dialogs, dashboard and chat                              |
| `apps/api`        | Express, MongoDB driver, JWT cookies, bcrypt password hashing, Gemini integration and scenario adapter              |
| `packages/shared` | Zod schemas, TypeScript interfaces, operation application, reference/cycle validation, relative deadlines and risks |

Each MongoDB event document contains its plan, revision, messages, proposals, and activity history. An approval performs one conditional update matching the owner, current revision, and pending proposal. That update changes the plan, marks the proposal approved, increments the revision, and appends history atomically. It works with a standalone local MongoDB server; no cross-document transaction or replica set is required.

Two concurrent approvals of the same proposal produce one revision and one history entry. Manual edits increment the revision and make older pending proposals stale. Stale proposals must be rejected and regenerated. Repeating an already-approved retained proposal is idempotent.

The saved plan is the assistant's source of truth. Gemini receives user messages, structured clarification questions, and proposal history with explicit approval/rejection status. Earlier assistant prose is not treated as a record of completed actions. A rejected request can therefore be proposed again when its task is absent from the plan. Live proposal messages use application-generated wording that states nothing has been applied yet.

The API checks ownership on every event route. Passwords are hashed with bcrypt; sessions are signed JWTs with an eight-hour expiry, in HTTP-only SameSite=Strict cookies. HTTPS origins enable Secure cookies. Mutating requests require an exact configured Origin. Authentication and AI requests have rate limits. Logout clears the browser cookie; this MVP does not maintain a server-side JWT revocation list.

## API outline

Responses are JSON. Event reads and successful writes return `{ event }`, including calculated risks. Errors return `{ error }` with a suitable HTTP status. Authentication uses the session cookie.

| Method and path                                      | Behavior                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /api/health`, `GET /api/config`                 | Database readiness and live-AI availability                           |
| `POST /api/auth/register`, `/login`, `/logout`       | Account/session actions                                               |
| `GET /api/auth/me`                                   | Current account                                                       |
| `GET /api/events`, `POST /api/events`                | List owned events or create an event                                  |
| `GET /api/events/:id`, `DELETE /api/events/:id`      | Read/delete an owned event                                            |
| `PATCH /api/events/:id`                              | Apply validated manual operations with an expected `revision`         |
| `PATCH /api/events/:id/mode`                         | Explicitly switch assistant mode with an expected `revision`          |
| `GET /api/events/:id/messages`, `/history`           | Read conversation or activity                                         |
| `POST /api/events/:id/messages`                      | Generate and persist an assistant reply and optional pending proposal |
| `POST /api/events/:id/proposals/:proposalId/approve` | Atomically apply a current pending proposal                           |
| `POST /api/events/:id/proposals/:proposalId/reject`  | Reject a pending proposal without changing the plan                   |

Manual writes use `{ revision, operations }`. Operations are event-field updates, complete task/vendor/session upserts, or explicit record removals. Shared schemas are the source of truth; a removal that leaves dangling references is rejected. Foreign or missing events return the same 404 response.

The optional, feature-detected WebMCP surface can read the selected event or stage a message for review. It exposes no automatic approval action. Its contract is unit tested; registration in an actual WebMCP-capable browser has not been verified.

## Sample-data setup

The simplest option is to register and click either demo scenario card. To preload both sample plans into one account, set `SEED_EMAIL` and a 10–72-character `SEED_PASSWORD` in `.env`, then run:

```sh
npm run seed
```

The seed command is idempotent. It preserves existing accounts and sample events, including their passwords and edits. When the email already exists, use that account’s existing password to sign in.

## Validation

```sh
npm test
npm run typecheck
npm run build
npm audit
```

Tests start and stop their own temporary MongoDB process on a free loopback port. They do not use the application database. Coverage includes both assessment scenarios; unknown and relative dates; dependency cycles and missing references; immutable plan application; capacity risk resolution; authentication and expired JWTs; cross-account read/write isolation; persistence; concurrent duplicate approvals; stale proposals; rejected proposals; invalid input; malformed AI responses and provider failure; rate limiting; and the optional workspace-tool contract.

See [the manual QA checklist](docs/QA_CHECKLIST.md) for responsive, keyboard, and interaction checks, [recorded validation results](docs/VALIDATION.md), and [the demo script](docs/DEMO_SCRIPT.md) for a recording outline. The [AWS deployment guide](docs/AWS_DEPLOYMENT.md) describes an alternative deployment; the live app uses Render and Atlas.

## Assumptions and deliberate limits

- One manager owns an event. Assignees are labels, not invited user accounts.
- Capacity is compared per vendor/service record. Multiple suppliers are not automatically summed; record a combined confirmed capacity or split requirements explicitly.
- Session scheduling is entered or proposed as calendar dates. Task deadline rules are persistent; session notes such as “CEO attends day two” do not themselves form an automatic scheduling constraint engine.
- The event editor optionally shifts dated sessions by the start-date change. Undated sessions remain undated. Changes that place sessions outside event dates are rejected.
- Relative words such as “Friday” are resolved for review in the event timezone. Missing or ambiguous information should prompt clarification; AI output still requires human review.
- Risks recalculate on reads and writes. There is no background reminder service or external notification delivery.
- Retain the latest 200 messages, 100 proposals, and 200 history entries per event to bound the MVP document size. Very large plans/conversations would need separate collections and pagination; this is not an indefinite audit archive.
- Sessions expire after eight hours. Password reset, email verification, team collaboration, payments, detailed guest lists, real bookings, calendar integrations, and outbound messages are outside this MVP.
- In-memory rate limits suit one API process. A multi-instance deployment needs a shared rate-limit store. The supplied cloud guide uses one task initially.
- The Gemini adapter has been tested with a real key and a valid structured response. Credentials stay in ignored local configuration or private hosting environment variables; other installations must provide their own key. A recorded walkthrough remains a separate submission deliverable.

## Environment reference

| Variable           | Default / purpose                                                |
| ------------------ | ---------------------------------------------------------------- |
| `MONGODB_URI`      | `mongodb://127.0.0.1:27019`; use an Atlas URI for hosted storage |
| `MONGODB_DB`       | `xperience_assistant`                                            |
| `JWT_SECRET`       | Required, random, at least 32 characters; generated by setup     |
| `APP_ORIGIN`       | Exact browser origin, no trailing slash; defaults to `RENDER_EXTERNAL_URL` on Render, otherwise `http://127.0.0.1:3000` |
| `PORT`             | Production launcher: public Next.js port (default 3000; Render 10000), with Express fixed internally at 4000. Direct API startup: default 4000. |
| `API_INTERNAL_URL` | Next.js rewrite target; default `http://127.0.0.1:4000`          |
| `GEMINI_API_KEY`   | Optional server-only live-AI credential                          |
| `GEMINI_MODEL`     | `gemini-3.1-flash-lite`; configurable structured-output model    |

Both the API and Next.js configuration read the project root `.env`. Custom rewrite targets must be present at build time. The included single-container deployment deliberately keeps the default loopback target.

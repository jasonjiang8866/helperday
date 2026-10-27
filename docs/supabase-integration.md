# Local Supabase integration tests

This suite runs real local Supabase Auth, signed JWT verification, PostgREST,
PostgreSQL RLS and the repository's RPCs. Browser cases use two isolated Chromium
contexts signed in as separate synthetic users, and execute the production
AppProvider/outbox code. They do not use the Demo or replace backend responses
with fixture data. These are **not physical two-device tests**, native-device
validation, or paid cloud tests.

## Run on a workstation

Prerequisites: Node 22+, npm, a running Docker Engine / Docker Desktop, internet
access for initial npm/container/browser downloads, and free ports 55430–55432
and 4173. Linux, macOS, or Windows through WSL2 with Docker integration.

```bash
git fetch origin
git switch feat/helperday-mvp
git pull --ff-only
npm ci
npx playwright install --with-deps chromium
npm run test:integration
```

The entry point pins Supabase CLI **2.54.11** (an intentional tested API/config
baseline, not a claim to be the latest release). It creates a random project ID
in a temporary workdir, copies `integration/supabase/config.toml` and all current
`supabase/migrations`, and starts a fresh database. It never links a remote
project, runs `db push`, or resets your development database. Existing
`supabase/config.toml` and `.env` values are not used. Fixed non-default ports
mean only one integration run per host; a port collision should fail.

Local email confirmation is disabled, so disposable `@example.test` accounts
can sign up and log in without an inbox. All household/task actions use the
public anon key plus an Auth-issued user JWT. The local service-role key is
used only by Node-side audit assertions; it is never passed to the Expo build.
The runner does not write credential/env files; isolated browser profiles do
store disposable Auth sessions, and are closed after each test. The script
rebuilds `dist/` against the local endpoint with dotenv loading disabled.
Rebuild normally before using that export outside this test.

On success or ordinary test/startup failure, `finally` stops the **generated
project only** with `--no-backup` and removes its temporary directory. A missing
Docker daemon, failed startup, build or test exits nonzero; there is no skip or
mock fallback. Failed cleanup also fails the command and prints a recovery
command. Forced process termination / machine shutdown may prevent cleanup;
the runner prints its disposable workdir before startup, so you can use:

```bash
npm exec --yes --package=supabase@2.54.11 -- supabase stop --no-backup --workdir /path/printed/by/runner
```

Focused runs still create and destroy a fresh stack:

```bash
npm run test:integration -- permissions.spec.ts
npm run test:integration -- browser.spec.ts
npm run test:integration -- --repeat-each=2
```

Keep `workers: 1` and zero automatic test retries. Explicit retry scenarios in
the tests verify mutation semantics; runner retries must not hide flaky results.
The suite is separate from `npm test` and the existing Demo `test:e2e` tests.

## Assertions

| Test | What is checked |
| --- | --- |
| Auth/RLS/RPC | Real password login and `getUser`; distinct user IDs; shared tasks; single-use invite rejection; helper cannot create invitations/tasks; foreign household table reads return no rows; foreign assignee/task updates fail; all six tables deny client insert/update/delete; invites/events deny client reads; anon and forged JWT denied |
| Concurrent update | Independent clients send the same expected version concurrently; exactly one success and one conflict; winning state and one audit event retained; success retry is a no-op; stale retry remains a conflict; explicit new-version reapply preserves both audit notes |
| Concurrent invite | Two accounts redeem one invitation concurrently; exactly one joins, loser remains without a household |
| Browser onboarding | Real UI login, employer creates household/invite, helper joins, employer creates assigned task, 15-second polling propagates task and helper completion without manual refresh |
| Offline/reload | Chromium network goes offline; real outbox persists mutation UUID/version/note; server remains unchanged; reload while only Supabase is blocked restores the same queue; reconnect drains queue and creates one event |
| Lost acknowledgement | Request reaches the real RPC and commits, then its response is deliberately dropped; retained mutation retries with the same UUID; no duplicate version/event |
| Offline conflict | Employer commits while helper is offline; reconnect exposes conflict; both server note and unsynced helper note survive reload; rejected mutation is not retried automatically; only explicit discard/reapply changes the server |

The current app uses dashboard polling, not Realtime subscriptions; Realtime
and unused Supabase services are excluded. Full offline page navigation is not
claimed: reloading the web app requires static assets because it has no service
worker. The reload case restores asset access while keeping Supabase blocked.
Email delivery/confirmation, JWT expiry/refresh rotation, native SecureStore,
physical devices, background execution and WAN behavior remain separate checks.

## CI and evidence

`.github/workflows/supabase-integration.yml` runs on PRs and manual dispatch on
Ubuntu with Docker. It executes the same entry point, without cloud project
secrets. `test-results/integration-junit.xml` is uploaded as
`supabase-integration-results`; a failed test or missing Docker fails the job.
Playwright traces, screenshots, video and HAR capture are disabled to avoid
publishing Auth tokens. Do not publish raw Supabase status output or auth logs.

Implementation-environment validation (2026-10-27): TypeScript, ESLint, existing
5 PGlite/domain tests, 6 Demo browser regression tests, Web build and discovery
of all 7 integration tests passed. The
integration command was attempted and failed at the Docker preflight because
this workspace has no Docker executable/daemon. **No successful local Supabase
run or physical-device validation is claimed from that workspace attempt.** A green run
of the dedicated CI job or the workstation command is the acceptance evidence.

References: [Supabase local development](https://supabase.com/docs/guides/local-development/cli/getting-started),
[pinned CLI config template](https://github.com/supabase/cli/blob/v2.54.11/pkg/config/templates/config.toml).

On 2026-10-27, the dedicated [GitHub Actions run 40534225902](https://github.com/jasonjiang8866/helperday/actions/runs/40534225902)
on commit `07b235c2b1a1fc9043b4188039e84c4c6bead88d` successfully applied
`202610270001_helperday.sql` and passed **all 7 real local Supabase integration
tests** (46.3 seconds for the test phase). The existing full CI also passed,
including native bundle exports. This evidence comes from a Docker-backed
GitHub runner and two browser contexts, not physical devices. Follow the PR's
checks for the result corresponding to its latest HEAD.

CI sets `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` to use the official upstream
Docker Hub image names supported by the pinned CLI. Its default public ECR
mirror returned `toomanyrequests: Data limit exceeded` twice on hosted runners
before any tests ran. Image tags and test assertions are unchanged. For the same
workaround locally: `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npm run test:integration`.
Registry/download failures still fail the job; they never count as test passes.

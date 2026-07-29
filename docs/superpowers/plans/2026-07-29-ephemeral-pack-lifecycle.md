# Ephemeral Pack Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make temporary packs and in-memory generation jobs explicit,
recoverable, and bounded while preserving all editable workspace state.

**Architecture:** A focused FastAPI lifecycle module resolves pack state from
manifest metadata plus bounded in-memory tombstones. A pure TypeScript poller
and restore validator feed a React hook that owns cancellation and stale-request
protection; persisted draft/ranking state stays independent from transient
artifact validation.

**Tech Stack:** Python 3, FastAPI, Pydantic, TypeScript, React 19, Next.js 16,
Node test runner, Playwright.

## Global Constraints

- No Redis, S3, accounts, durable queues, permanent history, or server-side cancellation.
- Server says `expired` only with trusted timestamp evidence.
- Unknown resources after restart are `lost`.
- Poll timeout/cancel are client-only and retain `job_id`.
- Offline restore performs no destructive persisted-state write.
- Timestamps are RFC 3339 UTC strings ending in `Z`.

---

### Task 1: Backend pack lifecycle resolver

**Files:**
- Create: `apps/api/tierzo_api/lifecycle.py`
- Modify: `apps/api/tierzo_api/main.py`
- Test: `tests/test_api.py`

**Interfaces:**
- Produces: `utc_timestamp()`, `PackLifecycle`, `PackLifecycleRegistry`,
  `resolve_pack_lifecycle(pack_id)`, and `require_available_pack(pack_id)`.
- Pack response gains `status`, `created_at`, and `expires_at`.
- `GET /packs/{pack_id}/status` returns `PackLifecycleResponse`.

- [ ] Write failing API tests for completed/lost/expired status, UTC timestamp
  shape, unchanged manifest `mtime`, structured artifact `404/410`, required
  artifact loss, restart evidence from manifest, and tombstone eviction.
- [ ] Run `node scripts/python.mjs -m unittest tests.test_api` and confirm the
  new tests fail because lifecycle contracts are absent.
- [ ] Implement manifest-backed expiration metadata and a resolver with exact
  precedence: valid expiration evidence, complete artifact set, otherwise lost.
- [ ] Route manifest/image/ZIP/extension access through the same resolver
  without touching timestamps or renewing TTL.
- [ ] Run the focused API suite and confirm it passes.

### Task 2: Bounded job lifecycle

**Files:**
- Modify: `apps/api/tierzo_api/main.py`
- Test: `tests/test_api.py`
- Modify: `apps/api/README.md`

**Interfaces:**
- Job status: `pending | running | completed | failed | lost`.
- `JobResponse` gains nullable UTC timestamps and separate nullable
  `pack_status`.
- `POST /jobs` returns typed `503 job_capacity_reached` when active capacity is
  full.

- [ ] Write failing tests for pending/running terminology, failure, unknown
  lost job, completed job with expired/lost pack, active capacity, terminal
  retention, and non-eviction of active jobs.
- [ ] Run the focused API suite and verify lifecycle assertions fail.
- [ ] Add timestamped `JobRecord`, bounded terminal cleanup, active admission
  checks, and structured lost responses without changing successful job
  history when its pack expires.
- [ ] Document environment settings and state semantics.
- [ ] Run the focused API suite and confirm it passes.

### Task 3: Pure web lifecycle helpers

**Files:**
- Create: `apps/web/lib/generation-lifecycle.ts`
- Create: `apps/web/lib/generation-lifecycle.test.ts`
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces `pollGenerationJob(options): Promise<PollOutcome>`.
- Produces `validateRestoredPack(pack, options): Promise<RestoreOutcome>`.
- Produces `resolvePollingTimeout(raw): number`.

- [ ] Write failing Node tests for completed/failed/lost polling, controlled
  timeout boundary, in-flight abort, explicit cancellation, retry backoff,
  same-job resumption, local expiry, server loss, and offline preservation.
- [ ] Add the new test file to `test:state` and run it to verify failure.
- [ ] Implement dependency-injected clock/timer/fetch helpers with 500–2000 ms
  backoff and a configurable 60-second default deadline.
- [ ] Run web state tests and confirm all lifecycle outcomes pass.

### Task 4: React ownership and persisted restoration

**Files:**
- Modify: `apps/web/hooks/use-pack-generation.ts`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/components/source-tray.tsx`
- Modify: `apps/web/components/agent-run-panel.tsx`
- Modify: `apps/web/lib/formatters.ts`
- Modify: `apps/web/lib/workspace-migration.ts`
- Modify: `apps/web/lib/workspace-migration.test.ts`

**Interfaces:**
- Hook returns `artifactState`, `pollingState`, `cancelPolling`, and
  `resumePolling`.
- `SavedWorkspaceState` retains nullable pack and `lastJobId`.
- Artifact validation state remains transient.

- [ ] Add migration tests proving last-job preservation, artifact-only
  invalidation, and full state equality on offline validation.
- [ ] Integrate restore validation so completed packs render, expired/lost packs
  clear only artifact state, and offline checks preserve the serialized
  workspace.
- [ ] Add monotonic request tokens and AbortController ownership; unmount and
  replacement abort silently, explicit cancel and timeout remain visible, and
  stale requests cannot mutate state.
- [ ] Add compact lifecycle copy plus Cancel/Resume controls without changing
  workspace composition.
- [ ] Run web state tests, lint, and build.

### Task 5: Real lifecycle smoke and documentation

**Files:**
- Modify: `apps/web/scripts/verify-demo.mjs`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DEMO.md`

**Interfaces:**
- `pnpm demo:verify` validates restore and artifact invalidation in the real UI.

- [ ] Extend Playwright smoke to generate/rank, reload and validate the saved
  pack, simulate a typed lost response, assert artifact actions disappear while
  text/tier labels/ranked IDs remain in localStorage, then regenerate and
  export.
- [ ] Document ephemeral state semantics, settings, and recovery behavior.
- [ ] Run `corepack pnpm verify`, `corepack pnpm demo:verify`, and
  `git diff --check`.
- [ ] Inspect generated manifest timestamps, artifact responses, and browser
  localStorage; confirm no temporary outputs are tracked.

### Task 6: Publish

**Files:** all lifecycle files above.

- [ ] Review the complete diff for scope, duplicated contracts, and accidental
  durable abstractions.
- [ ] Commit implementation coherently.
- [ ] Push `codex/ephemeral-pack-lifecycle`.
- [ ] Open a draft PR against `main` with `Closes #6`, contract summary,
  known risks, and exact verification results.

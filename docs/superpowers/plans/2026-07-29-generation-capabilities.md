# Generation Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a typed capability and outcome contract so Tierzo degrades honestly when OpenAI or TMDb is absent or fails.

**Architecture:** Keep environment capability detection and warning schemas in a small API module, retain the existing deterministic agentic core, and normalize new fields at the web boundary so legacy jobs and snapshots remain valid. The web fetches capabilities independently of lifecycle restoration and uses a conservative deterministic fallback if discovery fails.

**Tech Stack:** FastAPI, Pydantic, Python unittest, Next.js 16, React 19, TypeScript node:test, Playwright smoke verification.

## Global Constraints

- Keep `/health` as liveness and add `tierzo.capabilities.v1` at `/capabilities`.
- Preserve `enrichment_status`, existing pack/job URLs, workspace v3, rankings, review, and exports.
- Text generation and Auto remain usable without provider keys.
- Movie posters remains visible but disabled when TMDb cannot be verified.
- No feature-flag platform, new provider, upload, MCP, durable storage, or account work.

---

### Task 1: Separate provider-aware caches and deterministic prompt parsing

**Files:**
- Modify: `src/tierzo/agentic.py`
- Modify: `tests/test_core.py`

**Interfaces:**
- Produces: `draft_prompt_to_tierlist(...) -> PromptDraft` with `source` describing the actual path and provider-specific cache keys.
- Produces: heuristic drafts only for at least two explicit newline/comma/semicolon-separated items.
- Consumes: existing `PromptDraft`, `IntakePlan`, and OpenAI adapters.

- [ ] **Step 1: Add failing core tests**

Add tests that patch `prompt_draft_with_openai`, use a temporary cache directory,
and assert:

```python
self.assertEqual(
    draft_prompt_to_tierlist(
        "Alien, Aliens, Arrival",
        cache_dir=tmp,
    ).items,
    ["Alien", "Aliens", "Arrival"],
)
self.assertEqual(
    draft_prompt_to_tierlist(
        "best alien movies",
        cache_dir=tmp,
    ).items,
    [],
)
```

Also assert heuristic and OpenAI cache entries do not satisfy each other's
lookup and an OpenAI failure does not create an OpenAI cache hit.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```powershell
python -m unittest tests.test_core
```

Expected: new explicit-list and separated-cache assertions fail.

- [ ] **Step 3: Implement provider-aware cache helpers**

Use path-qualified keys:

```python
def agent_cache_path(cache_dir: Path, kind: str, mode: str, text: str) -> Path:
    return cache_dir / f"{cache_key(f'{kind}::{mode}::{text}')}.json"
```

Read `openai` entries only when a key is configured and `heuristic` entries
only when it is absent. Cache a fallback according to `result.source`, not the
attempted provider.

- [ ] **Step 4: Implement explicit heuristic list parsing**

Add a parser that accepts newlines, semicolons, or commas, removes a short
`rank:`/`rank these:` prefix from the first value, normalizes values, and
returns an empty list unless at least two distinct non-empty items remain.
`prompt_draft_with_heuristics` must return a draft with those items or an empty
item list; it must not treat vague prose as one invented item.

- [ ] **Step 5: Run core tests**

Run:

```powershell
python -m unittest tests.test_core
```

Expected: all core tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/tierzo/agentic.py tests/test_core.py
git commit -m "fix(core): separate provider fallbacks and caches"
```

---

### Task 2: Add typed API capabilities and outcomes

**Files:**
- Create: `apps/api/tierzo_api/capabilities.py`
- Modify: `apps/api/tierzo_api/main.py`
- Modify: `tests/test_api.py`

**Interfaces:**
- Produces: `GET /capabilities -> CapabilitiesResponse`.
- Produces: `ResultWarning { code: WarningCode, message: str }`.
- Extends: `PromptDraftResponse` and `GeneratePackResponse` with
  `outcome: Literal["normal", "degraded"] = "normal"` and
  `warnings: list[ResultWarning] = []`.
- Consumes: `PromptDraft.source`, `IntakePlan.source/tool`, TMDb configuration,
  and existing `enrichment_status`.

- [ ] **Step 1: Add failing capability and outcome API tests**

Cover:

```python
body = client.get("/capabilities").json()
self.assertEqual(body["schema_version"], "tierzo.capabilities.v1")
self.assertEqual(body["capabilities"]["text_cards"]["effective_mode"], "deterministic")
self.assertEqual(body["capabilities"]["tmdb_movie"]["reason_code"], "tmdb_unconfigured")
```

Add configured/unconfigured environment cases, prompt-draft OpenAI failure,
vague heuristic prompt 422, TMDb missing/error/partial/full outcomes,
unsupported `IntakePlan.tool`, direct `/packs`, and completed `/jobs` pack
payloads.

- [ ] **Step 2: Run focused API tests and confirm failure**

Run:

```powershell
python -m unittest tests.test_api
```

Expected: `/capabilities` is 404 and outcome fields are absent.

- [ ] **Step 3: Implement exact capability models**

Create `capabilities.py` with the literal unions and builders from the spec:

```python
WarningCode = Literal[
    "openai_unconfigured_heuristic",
    "openai_provider_heuristic_fallback",
    "tmdb_unconfigured_text_fallback",
    "tmdb_provider_text_fallback",
    "tmdb_partial_match",
    "unsupported_planner_tool_text_fallback",
]

class ResultWarning(BaseModel):
    code: WarningCode
    message: str

def outcome_for(warnings: list[ResultWarning]) -> Literal["normal", "degraded"]:
    return "degraded" if warnings else "normal"
```

Define `CapabilityEntry`, `Capabilities`, and `CapabilitiesResponse`, and build
the response solely from whether `OPENAI_API_KEY` and `TMDB_API_KEY` are set.

- [ ] **Step 4: Implement prompt-draft outcomes**

Remove the current 503 guard. Call `draft_prompt_to_tierlist` with the optional
key. If fewer than two items result, return 422 with:

```json
{
  "code": "prompt_requires_explicit_items_without_ai",
  "message": "Add at least two explicit item names or configure OpenAI."
}
```

Choose the OpenAI warning from configuration plus `draft.source`. Clamp an
unavailable `tmdb_movie` suggestion to `text` and append
`tmdb_unconfigured_text_fallback`. Deduplicate warnings by code before setting
the response outcome.

- [ ] **Step 5: Implement pack outcomes without changing legacy status**

Accumulate warnings during `_build_pack`:

- Auto planning with heuristic source: OpenAI unconfigured/provider warning.
- Planner tool outside `text | tmdb_movie`: resolve to text and warn.
- TMDb missing key/provider exception: existing text fallback plus warning.
- TMDb matched fewer than all items: `tmdb_partial_match`.

Pass outcome/warnings through `GeneratePackResponse`. Because `JobResponse`
already embeds that model, direct packs and completed jobs share the contract.
Keep manifest `enrichment_status` and existing job-step warnings unchanged.

- [ ] **Step 6: Run API tests**

Run:

```powershell
python -m unittest tests.test_api tests.test_api_environment
```

Expected: all API tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/tierzo_api/capabilities.py apps/api/tierzo_api/main.py tests/test_api.py
git commit -m "feat(api): expose generation capabilities and outcomes"
```

---

### Task 3: Normalize capabilities and outcomes in the web workspace

**Files:**
- Create: `apps/web/lib/capabilities.ts`
- Create: `apps/web/lib/capabilities.test.ts`
- Create: `apps/web/hooks/use-capabilities.ts`
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/generation-lifecycle.ts`
- Modify: `apps/web/lib/generation-lifecycle.test.ts`
- Modify: `apps/web/lib/workspace-migration.ts`
- Modify: `apps/web/lib/workspace-migration.test.ts`
- Modify: `apps/web/lib/formatters.ts`
- Modify: `apps/web/components/source-tray.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `CapabilityState = "loading" | "ready" | "unavailable"` plus a
  conservative capability snapshot.
- Produces: `normalizePackOutcome(enrichmentStatus, outcome?, warnings?)`.
- Consumes: `tierzo.capabilities.v1`, prompt-draft outcomes, and legacy/new
  pack payloads.

- [ ] **Step 1: Add failing TypeScript contract tests**

Test exact capability validation, rejection of unknown schema/modes, and the
fallback:

```ts
assert.equal(unavailableCapabilities.capabilities.text_cards.available, true);
assert.equal(unavailableCapabilities.capabilities.auto_planning.available, true);
assert.equal(unavailableCapabilities.capabilities.tmdb_movie.available, false);
```

Extend lifecycle/migration fixtures to prove an old pack without new fields
normalizes to `normal` or the appropriate degraded warning, while a new pack
with malformed outcome/warnings is rejected.

- [ ] **Step 2: Run state tests and confirm failure**

Add `lib/capabilities.test.ts` to `test:state`, then run:

```powershell
corepack pnpm --filter @tierzo/web test:state
```

Expected: missing capability module and outcome types fail.

- [ ] **Step 3: Implement capability validation and hook**

`capabilities.ts` must expose:

```ts
export function parseCapabilities(value: unknown): CapabilitiesResponse;
export const unavailableCapabilities: CapabilitiesResponse;
```

`useCapabilities()` fetches `/capabilities` once, validates it, and returns the
conservative fallback plus `state: "unavailable"` for network or contract
errors. It must not affect pack restoration.

- [ ] **Step 4: Implement backward-compatible pack normalization**

Add `outcome` and `warnings` to web types. Change canonical job-pack parsing
and workspace sanitization to synthesize missing fields from
`enrichment_status` before returning/saving a pack. Keep unsafe or malformed
new fields rejected. Existing v3 workspaces must remain v3 and retain every
editable field.

- [ ] **Step 5: Wire capability-aware controls**

Pass capability data/state into `SourceTray`. Keep Movie posters in the select:

```tsx
<option value="tmdb_movie" disabled={!tmdbAvailable}>
  Movie posters{tmdbAvailable ? "" : " — unavailable"}
</option>
```

Show the stable reason as mapped UI copy below the selector. Auto Agent and
Text cards remain enabled. When a restored selection is unavailable, clamp it
to text after capability resolution and show a non-error notice. Capability
fetch failure uses copy that external providers could not be verified.

- [ ] **Step 6: Render structured outcomes**

Use `pack.warnings` and prompt-draft warnings as the primary copy source.
Legacy `formatGenerationStatus` inference remains only for normalized legacy
packs. Degraded success uses the existing enrichment-status visual treatment,
not `.error`.

- [ ] **Step 7: Run web tests, lint, and build**

Run:

```powershell
corepack pnpm --filter @tierzo/web test:state
corepack pnpm --filter @tierzo/web lint
corepack pnpm --filter @tierzo/web build
```

Expected: all pass.

- [ ] **Step 8: Commit**

```powershell
git add apps/web
git commit -m "feat(web): honor generation capabilities and fallbacks"
```

---

### Task 4: Verify the real degraded and configured flows

**Files:**
- Modify: `apps/web/scripts/verify-demo.mjs`
- Modify: `docs/DEMO.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `/capabilities`, structured prompt/pack outcomes, existing demo
  generation and lifecycle flow.
- Produces: a repeatable launch-facing verification of provider-free behavior.

- [ ] **Step 1: Extend the browser smoke**

Before generation, assert the local provider-free server reports
`tierzo.capabilities.v1`, Auto/Text are enabled, Movie posters is visible and
disabled, and options explain the missing provider. Draft
`Alien, Aliens, Arrival` and assert a degraded heuristic response populates
editable items without an error. Preserve the existing identity, lifecycle,
ranking, and export assertions.

- [ ] **Step 2: Document the contract**

Update `docs/DEMO.md` and README setup copy to state:

- no keys: text cards, Auto fallback, and explicit-list Describe work;
- missing/failed providers produce structured degraded success where output is
  still usable;
- vague Describe prompts require OpenAI;
- Movie posters is visible but disabled without TMDb.

- [ ] **Step 3: Run real verification**

Run:

```powershell
corepack pnpm demo:verify
corepack pnpm verify
git diff --check
```

Expected: smoke prints the capability schema plus degraded warning codes; all
repo tests, lint, build, lifecycle, identity, and exports pass.

- [ ] **Step 4: Visually verify**

Start API/web without provider keys. Inspect desktop and mobile:

- Movie posters is visible and disabled with readable explanation.
- Explicit-list Describe produces a warning, not a failure.
- Text generation reaches board-first.
- Lost/expired and export controls remain unchanged.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/scripts/verify-demo.mjs docs/DEMO.md README.md
git commit -m "test(demo): verify degraded generation paths"
```

- [ ] **Step 6: Publish**

Push `postigodev/align-generation-capabilities` and open a draft PR titled
`feat(api): align generation capabilities and fallbacks` with `Closes #4`,
contract summary, compatibility notes, known limitations, and exact
verification commands.

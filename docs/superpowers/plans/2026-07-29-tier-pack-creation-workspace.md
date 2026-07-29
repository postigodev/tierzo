# Tier-Pack Creation Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refocus Tierzo's first viewport on equal Describe/Paste intake and
transition to a board-first workspace after generation.

**Architecture:** Derive a small visual phase from existing workspace state,
then let presentation components choose empty/composer or generated/board
layouts. Generation, lifecycle, identity, reconciliation, and persistence
contracts remain unchanged.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Node test runner,
Playwright.

## Global Constraints

- Preserve the current dark/pixel visual identity and border-led depth.
- Do not add file intake, assets, candidate review, MCP, or backend changes.
- Do not add a persisted UI state machine.
- Keep Card Lab and generation options collapsed but keyboard-accessible.
- Use `type(scope): description` commits on
  `postigodev/refocus-tier-pack-creation`.

---

### Task 1: Derived workspace phase

**Files:**
- Create: `apps/web/lib/workspace-view.ts`
- Create: `apps/web/lib/workspace-view.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces:
  `deriveWorkspacePhase(input): "empty" | "ready" | "generating" |
  "failed" | "generated" | "lost" | "expired"`.

- [ ] Add table-driven tests for phase priority.

```ts
assert.equal(
  deriveWorkspacePhase({
    artifactState: "idle",
    hasError: false,
    hasPack: false,
    isGenerating: false,
    itemCount: 0,
  }),
  "empty",
);
```

- [ ] Implement the pure phase resolver. `generating` wins while active;
  `lost`/`expired` follow server evidence; a usable completed pack is
  `generated`; error without a usable pack is `failed`; otherwise non-empty
  input is `ready`.
- [ ] Add the test file to `test:state` and run:
  `corepack pnpm --filter @tierzo/web test:state`.
- [ ] Commit as `feat(web): derive tier-pack workspace phases`.

### Task 2: Composer and board-first layout

**Files:**
- Create: `apps/web/components/workspace-progress.tsx`
- Create: `apps/web/components/empty-board-cue.tsx`
- Modify: `apps/web/components/source-tray.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- `SourceTray` consumes `workspacePhase` and renders equal Describe/Paste tabs.
- `WorkspaceProgress` consumes the phase and labels Input, Generate, Rank,
  Export without persisting progress.
- `EmptyBoardCue` is non-interactive and has `aria-hidden="true"`.

- [ ] Add Describe/Paste tabs with correct `role="tablist"`, `aria-selected`,
  keyboard buttons, and no duplicate active form controls.
- [ ] Wrap preset, enrichment mode, and Card Lab in a native `<details>`
  disclosure labelled `Style & generation options`.
- [ ] Render composer → progress → compact empty board before a usable pack.
- [ ] Render compact source summary → full existing `TierBoard` after
  generation; keep review, regenerate, exports, polling controls, and errors.
- [ ] Keep lost/expired in board-first composition while hiding
  artifact-backed actions through existing `availablePack` behavior.
- [ ] Apply the approved design checkpoint:
  black/charcoal surfaces, tier colors, amber action/progress, borders-only
  depth, existing typography, and existing spacing/radius vocabulary.
- [ ] Run state tests, lint, TypeScript/build, then commit as
  `feat(web): refocus tier-pack creation flow`.

### Task 3: Real visual and lifecycle verification

**Files:**
- Modify: `apps/web/scripts/verify-demo.mjs`
- Modify: `docs/DEMO.md`

**Interfaces:**
- `pnpm demo:verify` begins from empty storage and verifies both visual phases.

- [ ] Assert the first viewport has equal Describe/Paste tabs, collapsed
  options, progress rail, mini-board, and no full interactive board.
- [ ] Exercise Paste, expand options, generate a real pack, and assert the
  compact composer plus full board replace the empty cue.
- [ ] Preserve the existing duplicate identity, reorder, rename, add/remove,
  restore, typed-lost, regeneration, and export assertions.
- [ ] Verify desktop and mobile screenshots manually in the browser; inspect
  keyboard focus, empty, generating, failed, generated, and lost states.
- [ ] Run `corepack pnpm verify`, `corepack pnpm demo:verify`, and
  `git diff --check`.
- [ ] Commit as `test(web): verify tier-pack creation workspace`.

### Task 4: Publish

- [ ] Review the complete diff for scope and accidental lifecycle/identity
  regressions.
- [ ] Push `postigodev/refocus-tier-pack-creation`.
- [ ] Open a draft PR titled
  `feat(web): refocus tier-pack creation flow` with `Closes #2`.

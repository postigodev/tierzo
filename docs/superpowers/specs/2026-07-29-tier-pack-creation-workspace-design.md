# Tier-Pack Creation Workspace

## Goal

Make Tierzo's first viewport explain and start the core flow immediately:
describe or paste a list, generate a pack, rank it, and export it. Preserve the
existing dark, pixel-influenced identity and all stable identity/lifecycle
behavior.

## Product Direction

Tierzo should feel like an arcade ranking workbench, not a dashboard or a
multi-step wizard. Prompt and pasted-list intake have equal hierarchy. The
board is a compact visual cue before generation and becomes the primary
workspace after a pack exists.

The existing black/charcoal surfaces, pixel mark, tier colors, border-led depth,
and compact typography remain. Amber is reserved for the main action and
progress emphasis.

## Flow

### Empty

- Show a focused `Build your tier pack` composer in the first viewport.
- Offer `Describe` and `Paste list` as equal tabs.
- Show `Input → Generate → Rank → Export` as a compact progress rail.
- Render a non-interactive mini-board that explains where generated cards go.
- Keep preset, enrichment mode, and Card Lab collapsed but available.
- Do not preload sample content or expose a fake file-upload action.

### Drafted and generating

- A prompt draft populates the editable list but does not silently generate.
- Generation keeps progress, cancellation, errors, and the current draft
  visible.
- Failed generation leaves source, style, tiers, and ranking state editable.

### Generated

- Compact the composer into an editable pack summary.
- Promote the existing tier board to the full-width primary surface.
- Keep review, regenerate, lifecycle status, and export actions near the pack
  summary.
- Preserve the current board, match-review, export, identity, and artifact
  contracts.

### Lost or expired

- Keep the board-first workspace and editable source/configuration.
- Remove only artifact-backed previews and actions.
- Present regeneration as the recovery path without classifying client
  cancellation or timeout as generation failure.

## Component Boundaries

- `PackComposer`: equal Describe/Paste modes and the primary creation action.
- `GenerationOptions`: collapsed preset, enrichment, and Card Lab controls.
- `WorkspaceProgress`: derived, non-persisted flow state.
- `EmptyBoardCue`: non-interactive compact tier-board preview.
- `GeneratedWorkspaceHeader`: pack summary, edit/review/regenerate/export
  actions.
- Existing `TierBoard` remains the ranking implementation.

Visual phase is derived from existing item, generation, polling, artifact, and
pack state. No new persisted state machine is introduced. `SourceTray` may be
split along these boundaries, but generation and reconciliation logic should
not move into presentation components.

## Responsive and Accessibility

- Desktop keeps the composer and mini-board visible without scrolling through a
  full empty board.
- Mobile stacks composer, options, progress, and mini-board; generated actions
  stack above the real board.
- Tabs, disclosures, buttons, errors, and lifecycle states remain
  keyboard-accessible and have visible focus/disabled states.

## Verification

- Directed tests cover derived visual phases and control visibility.
- Browser verification starts from genuinely empty local storage.
- Describe and Paste both reach the existing generation flow.
- Generated, failed, lost, and expired states preserve the correct editor data
  and artifact actions.
- Existing ranking, review, lifecycle restoration, and export smoke coverage
  remains green.
- Run `corepack pnpm verify` and `corepack pnpm demo:verify`.

## Non-Goals

- File intake (#3), uploads/assets (#7), candidate review (#8), MCP, or ChatGPT
  app work.
- A new visual identity, route structure, durable state, or backend extraction.
- Replacing the current tier-board interactions or generation contracts.

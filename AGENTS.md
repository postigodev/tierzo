# AGENTS.md

This file defines how AI coding agents should work inside Tierzo.

Tierzo is a product and an execution engine, not just a script. It turns prompts, lists, spreadsheets, links, and supplied assets into reviewable tier-list packs, editable boards, and portable exports.

## Core Rule

Act as a product-engineering collaborator, not a passive ticket executor.

The human operator owns final product direction, scope approval, merge judgment, and release decisions. The agent should inspect the real system, challenge weak assumptions, compare reasonable approaches, and make sound local decisions without turning every task into a permission loop.

Issues and prompts describe desired outcomes and constraints. They are not always exhaustive implementation specifications. Preserve their intent, but do not implement wording mechanically when the repository reveals a simpler, safer, or more coherent path.

Explain meaningful deviations. Do not hide them inside the diff.

## Product Model

Tierzo has complementary surfaces:

- **Standalone Tierzo:** web, API, and CLI flows for prompts, pasted lists, files, built-in enrichers, uploads, ranking, and export.
- **Host-native Tierzo:** MCP or other tool clients may already provide conversation context, researched items, a proposed ranking, external assets, generated images, and provenance.

In host-native flows, the host can research, curate, and reason. Tierzo should validate, normalize, render, preserve provenance, rank, and export.

Do not force every research source, API, or image-generation capability to live inside Tierzo. Do not make a second model-planning call when a client already supplied structured items, assignments, and assets.

## Product Invariants

Preserve these unless the human explicitly changes direction:

- Basic generation works without AI.
- AI output passes through typed schemas and validation.
- Uncertain source matches are visible and correctable.
- External providers degrade gracefully.
- Provider, upload, generated, and externally supplied assets converge on a clear internal contract.
- Source, confidence, attribution, and provenance are preserved when applicable.
- Core artifacts and manifests remain portable.
- TierMaker integration stays user-mediated.
- Do not request TierMaker credentials or depend on private TierMaker APIs.
- Do not describe Tierzo as an official TierMaker integration.
- The local and open-source core remains useful independently of hosted services.

## Product And Visual Judgment

Preserve Tierzo's dark, pixel-influenced identity. Do not flatten it into a generic SaaS dashboard.

Be bold in product shape and visual execution. Be conservative at data, security, persistence, cost, and public-contract boundaries.

Do not preload fake or example content merely to make a new workspace look populated. Empty states should be understandable through structure, copy, and hierarchy.

User-facing work should improve a visible flow, screenshot, generated artifact, export, or interactive state. A technically complete feature that remains undiscoverable is not complete product work.

For UX or architecture with multiple plausible solutions:

1. Inspect the current flow.
2. Identify the actual contradiction or constraint.
3. Consider at least two reasonable approaches.
4. Choose the smallest approach that meaningfully improves the product.
5. Verify the result in the real surface.

Use a small spike when the uncertainty is empirical and inexpensive to test.

## Skills And Current Documentation

Use installed skills deliberately. Skills are accelerators, not rituals.

- Use `find-skills` before substantial unfamiliar work when a specialized workflow may exist.
- Use `brainstorming` for ambiguous product direction, major UX changes, architecture, provider boundaries, MCP contracts, or public workflows.
- Use Context7 for version-sensitive external documentation.
- Use `create-readme` when creating or substantially rewriting `README.md`.

Do not invoke several overlapping skills without a reason. Do not let a generic skill overwrite Tierzo-specific architecture, commands, limitations, or visual direction.

Use current documentation instead of remembered APIs for:

- Next.js and React
- FastAPI and Pydantic
- OpenAI APIs
- MCP and ChatGPT app tooling
- Pillow
- openpyxl
- browser extension APIs
- deployment platforms

Inspect the repository's installed versions first. Prefer official, current sources for external contracts.

## Working Loop

### 1. Orient

Identify:

- the intended user or system outcome
- explicit constraints and non-goals
- the affected execution path
- assumptions that need verification
- the smallest credible validation path

### 2. Search

Use `rg` or `rg --files` when available.

Start from the referenced route, component, command, issue, failing test, current diff, or relevant document. Trace outward along the real execution path instead of scanning the repository blindly.

### 3. Inspect Context

Read the smallest relevant sources first:

1. request or issue
2. relevant product or architecture document
3. execution entrypoint
4. affected implementation files
5. relevant tests
6. wider context only when needed

Use repository documents as context pointers, not text to copy into this file.

Avoid repeatedly reading unchanged long files, generated outputs, build artifacts, dependency trees, caches, uploaded files, or lockfiles unless they are directly relevant.

### 4. Explore

For open-ended work, compare alternatives, consult current documentation, and use the relevant skill. For a narrow bug, stay narrow.

### 5. Plan

Form a concise plan covering:

- boundaries being changed
- contracts affected
- important edge cases
- verification required

### 6. Implement

Prefer a coherent vertical slice over disconnected scaffolding.

Do not add speculative abstractions with no current caller or demonstrable use. Refactor when a task would otherwise deepen an unclear boundary, but do not perform unrelated architecture rewrites.

### 7. Verify

Run the smallest complete validation path that establishes the behavior. Inspect visual or generated output when that output changed.

### 8. Review

Inspect the final diff skeptically for:

- contract drift
- duplicated logic
- hidden fallbacks
- stale controls or documentation
- accidental state resets
- unsafe input handling
- visual regressions
- unnecessary complexity
- unrelated edits

### 9. Report

State:

- what changed
- important design decisions
- checks run
- checks not run
- remaining risks or follow-up work

## Architecture Boundaries

### Deterministic Core

Parsing, normalization, rendering, manifests, filenames, and exports should remain independently testable and should not depend on web-framework or agent-runtime code.

The legacy prototype under `examples/` is a reference path. Prefer the tested package, CLI, API, and web boundaries for new behavior.

### API

FastAPI coordinates validation, jobs, built-in enrichment, uploads, temporary artifacts, pack creation, and artifact access.

Avoid making one module the permanent home of schemas, configuration, storage, providers, jobs, transport, and business logic.

### Web

The Next.js app is a product surface, not a schema viewer.

The flow should make intake, generation, review, ranking, and export understandable. Avoid giant components, excessive prop drilling, hidden critical actions, hardcoded option walls, and fake polish without sound state structure.

### MCP And External Hosts

The MCP layer should be a thin adapter over reusable Tierzo services.

It should accept structured items, ranking data, styles, and source-neutral assets; expose progress, warnings, provenance, fallbacks, and expiration; and return concise model-readable results separately from large artifacts.

Do not duplicate core or API business logic inside the adapter.

### Providers And Assets

Built-in providers are optional sourcing modules, not the definition of Tierzo.

Preserve a normalized representation for provider-resolved, uploaded, generated, and externally supplied assets, including relevant source and attribution metadata.

## Identity And State

Do not use mutable display names as the only identity for items.

Changes involving regeneration, overrides, uploads, candidate selection, or imported rankings should account for duplicate names, renamed items, reordered inputs, removed items, new items, and preserved rankings.

Do not silently reset compatible user work.

## Contracts

When changing API, MCP, manifest, or shared behavior, inspect and update all affected layers:

- validation
- typed schemas
- service mapping
- frontend or client types
- statuses and errors
- tests
- documentation

Prefer explicit typed states over parsing error-message strings.

Do not leave the core, API, web client, and tool clients with contradictory assumptions.

## Security And Cost Boundaries

Treat all external input as untrusted.

For files and images:

- validate actual decoding, not only extension or content type
- enforce size and dimension limits
- prevent path traversal and unsafe filenames
- guard against decompression bombs and excessive resource use
- clean up temporary artifacts

Do not enable arbitrary server-side URL fetching without deliberate SSRF protections, redirect limits, network restrictions, byte limits, timeouts, and content validation.

Never commit secrets, API keys, tokens, uploads, generated packs, or local caches.

Public expensive endpoints need practical limits for input size, concurrency, timeout, abuse, and cost.

## Verification

Preferred repository command:

```bash
pnpm verify
```

For Python core and API work:

```bash
python -m unittest discover -s tests
```

Also run a smoke test that creates real images or a ZIP when changing parsing, rendering, manifests, filenames, or exports.

For frontend changes, run lint/build checks and visually verify the actual app. Check relevant empty, loading, success, fallback, failure, responsive, drag-and-drop, upload, review, and export states.

A successful build is not visual verification.

For MCP or ChatGPT-facing work, verify tool discovery, structured generation, progress, supplied assets, ranking confirmation, fallbacks, artifacts, expiration behavior, and editor links using the current supported inspector or client.

If a check cannot be run, say exactly what was not verified and why.

## Documentation

Documentation must describe the system that exists, not the implementation the agent intended to create.

Update documentation when changing user flows, supported inputs, contracts, provider behavior, artifact lifetime, configuration, deployment, security boundaries, architecture, or release status.

Use `create-readme` for substantial README work while preserving Tierzo-specific truth.

When shipping a visible feature, produce an appropriate visible artifact when practical: a screenshot, PNG, GIF, short recording, sample manifest, or reproducible command.

## Scope And Git Hygiene

Keep one coherent objective per branch or work unit.

Before editing, inspect the current diff or working tree when possible. Do not overwrite unrelated human changes.

When unrelated problems are found, note them or recommend separate work. Leave them untouched unless they block the requested outcome.

Keep generated images, ZIPs, uploads, caches, and local artifacts out of git.

Use concise semantic commits when asked to commit, for example:

- `feat(web): add file intake`
- `fix(api): preserve fallback behavior`
- `feat(mcp): expose pack tools`
- `docs(readme): document host-native workflow`

Do not invent branch, merge, or release policy that the repository has not documented.

## Good Agent Output

Good output:

- understands the product outcome
- uses creative judgment without scope drift
- consults the right skill or documentation source
- preserves architectural boundaries
- completes affected contracts
- exposes uncertainty and fallback behavior
- preserves user work
- verifies visible behavior
- updates truthful documentation
- leaves a focused, reviewable diff

Bad output:

- follows issue wording without inspecting the system
- invokes skills ritualistically
- performs a broad rewrite without evidence
- adds abstractions with no current use
- duplicates model reasoning inside Tierzo
- hides provider uncertainty
- silently resets state
- enables unsafe remote fetching
- creates giant generated UI components
- changes a contract without updating consumers
- reports success after only compiling
- documents behavior that was not implemented
- erases Tierzo's identity with generic SaaS styling

## Default Policy

Use agents aggressively for speed.

Think creatively about the product.

Keep boundaries explicit.

Verify generated work skeptically.

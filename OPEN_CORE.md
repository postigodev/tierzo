# Tierzo Open Core

Tierzo is open-source at its core. The local generator, pack format, basic exports, and compatibility workflows should remain portable and hackable.

The hosted product can charge for convenience, scale, managed integrations, and workflows that create real operating costs.

## Guiding Principle

Do not sell the generator. Sell the removal of friction.

Tierzo should feel free, portable, and trustworthy when used locally. Paid features should exist because they save time, handle scale, or pay for expensive compute and third-party APIs.

## What Stays Open

The open-source project should include:

- CLI.
- Python core package.
- Pack schemas.
- Manifest format.
- TXT, CSV, XLSX, and pasted-text parsing.
- Basic deterministic item normalization.
- Text-card generation.
- Basic style presets.
- ZIP export.
- TierMaker-ready export batches.
- TierMaker upload guide generation.
- Basic local web app or demo mode.
- Chrome extension base.
- Tests for core parsing, rendering, and export behavior.

These pieces create trust, portability, and community contribution surface.

## Free Hosted Tierzo

The hosted demo should be useful without an account when possible:

- Paste or upload input.
- Generate small packs.
- Use basic styles.
- Preview and manually rank a tier board.
- Export a final PNG.
- Export a basic ZIP.

Free hosted usage may have limits around item count, file size, AI attempts, export frequency, or temporary storage.

## Paid Tierzo

Paid features should map to operating cost or creator workflow value:

- Larger packs.
- Faster background jobs.
- Saved history.
- Share links.
- Premium style presets.
- Managed API enrichers.
- Poster, cover, logo, or artwork fetching at scale.
- AI cleanup.
- Background removal.
- Higher-resolution exports.
- Batch automation.
- Chrome companion power features.
- Team or agency workflows later.

The likely first paid model should be creator credits, with subscriptions added later if usage patterns justify it.

## What We Will Not Lock Down

Tierzo should not lock down:

- The pack format.
- Local generation.
- Basic exports.
- Basic TierMaker-ready ZIP output.
- The ability to inspect and modify generated manifests.

Locking these down would weaken trust and make Tierzo feel like a closed SaaS with an open-source wrapper.

## Chrome Extension Boundary

The Chrome extension can be open-source to build trust. It may connect to hosted Tierzo for power features, but it should not require a paid account for basic companion behavior.

The extension should not ask users for TierMaker credentials or depend on private TierMaker APIs. Its role is to guide and assist user-visible workflows.

## Monetization Shape

Prefer this order:

1. Free hosted limits.
2. Creator credits for occasional expensive workflows.
3. Pro subscription for frequent creators.
4. Team or agency plans only if real usage supports them.

Many creators will use Tierzo occasionally, so credits may feel more natural than subscriptions at launch.

## Trust Contract

Tierzo should make this promise clearly:

The local generator and basic pack exports remain open and portable. Hosted Tierzo charges for convenience, scale, managed AI/API usage, and creator workflow features.

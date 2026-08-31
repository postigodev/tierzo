# Tierzo Product

This document is the single source of product direction. `README.md` describes
what users can run today; `docs/ARCHITECTURE.md` owns implemented technical
contracts; GitHub issues own task-specific scope and sequencing.

## Product Definition

Tierzo is a reviewable tier-pack creation tool and execution engine. The
intended standalone v0.1 workflow lets a user supply or import a list, edit it,
optionally enrich assets, correct or supply assets, generate a pack, rank
items, regenerate without losing compatible work, and export portable
artifacts. Current match correction can force a sourced asset back to a text
card; local/manual asset supply remains work tracked in #7.

Tierzo is the preparation and review layer around tier-list creation, not a
TierMaker clone. The standalone web app and CLI are first-class v0.1 surfaces.

## Target Workflow

1. Supply a pasted list, TXT/CSV/XLSX file, or prompt.
2. Review and edit normalized source items.
3. Choose deterministic text cards or an available optional accelerator.
4. Generate through an observable job.
5. Review generated cards, source information, warnings, and uncertain matches.
6. Correct assets where supported and regenerate without discarding compatible
   item identity or rankings.
7. Rank items on the tier board.
8. Export a board PNG, image ZIP, manifest, or TierMaker compatibility payload.

## Product Invariants

- Basic generation works without AI.
- AI and built-in enrichers are optional accelerators, not prerequisites.
- AI output crosses typed validation before affecting generation.
- Uncertain sourcing is visible and correctable; failures degrade honestly.
- Stable item identity preserves compatible ranking work across regeneration.
- Provenance, confidence, and attribution are preserved when applicable.
- Generated artifacts and manifests remain portable.
- Temporary hosted artifacts are represented honestly; loss does not silently
  erase compatible editable browser state.
- TierMaker compatibility remains user-mediated, uses public workflows and
  portable exports, and never requires TierMaker credentials or private APIs.
- The local open-source core remains independently useful.

## UX And Visual Invariants

- The usable workspace, not a marketing hero, is the primary web surface.
- A new workspace is understandable without fake preloaded content.
- Source, generation progress, review, ranking, and export remain discoverable
  parts of one coherent flow.
- Generated output must be inspectable and useful outside Tierzo.
- The dark, pixel-influenced identity is intentional; do not flatten it into a
  generic dashboard.
- User-facing changes are complete only when verified in the real visible
  state or generated artifact they affect.

## v0.1 Boundary

The standalone v0.1 is complete when the current workflow is genuinely usable,
documented, and releasable. Remaining functional work is finite:

1. Validated local/manual asset ingestion ([#7](https://github.com/postigodev/tierzo/issues/7)).
2. Richer correction for ambiguous built-in matches ([#8](https://github.com/postigodev/tierzo/issues/8)).
3. Concrete release and usability work from
   [#11](https://github.com/postigodev/tierzo/issues/11): CI, truthful public
   documentation, screenshots or a demo artifact, deployment verification,
   provider attribution/licensing, honest temporary-storage limitations, and a
   coherent tagged release.

Completed capabilities such as web file intake are current behavior, not
remaining work.

## Non-Goals For v0.1

The following are not requirements for standalone v0.1 completion:

- MCP or a ChatGPT app;
- additional providers such as Steam, Spotify, or AniList;
- a generalized provider/plugin framework;
- a Chrome extension;
- authentication, billing, permanent hosted history, or durable accounts;
- community, collaboration, or team features;
- cloning TierMaker's editor or community platform.

## Possible Future Work

After standalone v0.1, evidence from real use may justify host adapters,
additional enrichers, a generalized provider boundary, durable hosted storage,
or assisted distribution workflows. These are options, not commitments or
current implementation plans. Detailed future plans belong in active issues,
not this document.

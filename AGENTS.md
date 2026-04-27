# Agent Instructions for Tierzo

Tierzo is an agentic tier-list asset generator. Treat it as a product, not just a script.

## Current Direction

- Product name: Tierzo.
- Core idea: turn messy lists, spreadsheets, and links into polished image packs, tier-board previews, and TierMaker-compatible exports.
- The current `generate_text_images.py` file is a prototype. Keep it working until replacement commands exist.

## Working Principles

- Preserve a deterministic core that works without AI.
- Put AI behind typed schemas and validation.
- Prefer small, demonstrable slices over broad rewrites.
- Keep TierMaker integration user-mediated; do not depend on private TierMaker APIs.
- Make every user-facing feature visible in a demo, screenshot, or export artifact.
- Treat `DEMO.md` as a product constraint. When tradeoffs are close, choose the path that improves the next demo.

## Expected Stack

- Frontend: Next.js with TypeScript.
- Backend: FastAPI.
- Core generation: Python.
- Extension: Chrome Manifest V3 with TypeScript.
- Image generation/manipulation: Pillow first.
- Spreadsheet parsing: openpyxl first.

## Repo Hygiene

- Use `rg` or `rg --files` for searches when available.
- Do not remove the existing script until the new CLI/core path is tested.
- Keep generated images, ZIPs, and local uploads out of git.
- Add or update tests when changing parsing, rendering, export, or agent schemas.
- Keep documentation aligned with product direction when adding major features.

## Verification Expectations

For core changes:

- Run unit tests when present.
- Current test command: `python -m unittest discover -s tests`.
- Run at least one smoke test that creates images or a ZIP from sample input.

For frontend changes:

- Run lint/build checks when available.
- Start the dev server and visually verify the main flow.
- Check the flow against `DEMO.md` before calling it complete.

For API changes:

- Run backend tests when available.
- Verify endpoint schemas and failure cases.

For extension changes:

- Verify Manifest V3 validity.
- Document the supported TierMaker pages and known limitations.

## Product Guardrails

- Do not describe Tierzo as an official TierMaker integration unless such a partnership exists.
- Do not ask users for TierMaker credentials.
- Do not scrape or upload through private TierMaker endpoints.
- Preserve credits and source metadata for enriched images when possible.
- Prefer asking the user to resolve ambiguity over silently picking a low-confidence match.

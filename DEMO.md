# Tierzo Demo Plan

The demo is a first-class product goal. Tierzo should become understandable, impressive, and shareable before the full agentic backend exists.

## Demo Promise

The public demo should prove this in under one minute:

Paste a messy list, get polished tier-list assets, preview the ranking, and export something useful.

The demo should not feel like a landing page with a tool attached. The tool is the first screen.

## First Demo Story

The first demo should show a deterministic flow that does not require API keys:

1. User opens Tierzo.
2. User sees a paste box already seeded with a compelling sample list.
3. User clicks generate.
4. Tierzo creates styled cards.
5. User drags cards onto a tier board.
6. User exports a final PNG.
7. User exports a TierMaker-ready ZIP.

This gives us a public demo even before AI enrichment ships.

## First-Viewport Requirements

The first viewport should immediately communicate the product:

- Brand: Tierzo.
- Primary action: paste/upload/generate.
- Visible tier-board or generated asset preview.
- No generic marketing hero before the tool.
- No card-heavy SaaS landing layout before the usable experience.

The user should understand "messy list in, tier pack out" without reading a long explanation.

## Demo Inputs

Use inputs that feel culturally rankable and visually fun.

Good first examples:

- PS2 survival horror games.
- A24 movies.
- Mario Kart items.
- Pokemon starters.
- Anime openings.
- Fast food fries.
- Fighting game characters.

Avoid demo lists that are too generic, too corporate, or legally awkward as the only sample.

## Demo Modes

### Mode 1: Text Cards

This is the first shippable mode:

- Works without AI.
- Uses the local core.
- Shows style presets clearly.
- Produces clean PNGs and ZIP export.

### Mode 2: Mock Enriched Cards

Before real enrichers exist, we may include curated demo data to show the intended direction:

- Poster/cover/card examples.
- Source metadata in the manifest.
- A few intentionally ambiguous items.

Mock data must be clearly marked in code and docs.

### Mode 3: Real Enrichment

Once one source connector exists:

- Fetch real covers/posters/artwork.
- Show confidence.
- Let users resolve ambiguity.
- Preserve credits/source URLs.

## Visual Bar

The demo output should look good enough to share as a screenshot.

Minimum bar:

- Cards have strong type, spacing, and consistent sizing.
- Long names wrap without looking broken.
- Tier rows are readable and compact.
- Drag-and-drop states are obvious.
- Exported PNG does not include accidental UI chrome.
- ZIP contains predictable filenames and `manifest.json`.

Avoid:

- Default white SaaS dashboard vibes.
- Tiny preview tiles that cannot be inspected.
- Overly decorative UI that distracts from the pack.
- Text explaining the UI instead of making the UI obvious.

## Required Demo Artifacts

Each demo milestone should produce at least two artifacts:

- A working local command or URL.
- A screenshot or exported PNG.

Strong milestones should also produce:

- A ZIP export.
- A short GIF or video capture.
- A sample input file.
- A sample `manifest.json`.

## Demo Acceptance Checklist

A demo slice is not done until:

- A new user can complete the core flow without reading docs.
- The generated output is usable outside Tierzo.
- The output looks intentional at desktop and mobile sizes.
- The README can show a screenshot or exported result.
- The flow has one clear "wow" moment.
- The feature has a local verification command or browser check.

## Demo Roadmap

### Demo 0: CLI Proof

Status: in progress.

- Generate images from TXT/CSV/XLSX.
- Export ZIP.
- Write manifest.
- Show sample output in README.

### Demo 1: Web Text-Card Studio

Status: in progress.

- Next.js app.
- Paste box.
- Preset picker.
- Generate preview cards.
- Download ZIP.
- Playwright verification writes `.tierzo/demo-screenshot.png`.

### Demo 2: Tier Board Preview

- Editable tier labels.
- Drag-and-drop cards.
- Export final tier-list PNG.
- Save/load board state locally.

### Demo 3: TierMaker-Ready Export

- Extension payload JSON.
- Batch validation.
- TierMaker upload guide.
- ZIP structure preview.
- Compatibility status.

### Demo 4: Agentic Cleanup

- Messy list normalization.
- Domain guess.
- Confidence per item.
- Review ambiguous items.

### Demo 5: First Real Enricher

- One real source connector.
- Real images.
- Human review for ambiguous matches.
- Credits in manifest.

## Collaboration Rule

When choosing between two technically valid next steps, prefer the one that makes the next demo more impressive, easier to explain, or easier to share.

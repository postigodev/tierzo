# Web File Intake Design

## Objective

Expose Tierzo's existing TXT, CSV, and XLSX parsing through the web workspace so a user can import an exact list, review and edit the parsed items, and continue through the existing generation, ranking, lifecycle, and export flow.

This slice closes issue #3. It does not add durable uploads, image assets, remote fetching, accounts, or a generalized ingestion framework.

## Product Behavior

`Describe` and `Paste list` remain the two equal composer paths. `Paste list` gains a visible file-import control for `.txt`, `.csv`, and `.xlsx`.

After a successful import:

- the imported items replace the current source list;
- the existing source reconciliation preserves stable IDs and rankings for matching items;
- duplicates remain independent;
- removed item IDs are pruned from the board deterministically;
- new items remain in the editable source list until regeneration creates their artifacts; they do not appear as fake bench cards;
- the resulting list remains editable before generation;
- the UI reports the filename, item count, and interpretation used.

The last completed pack and its compatible rankings remain available after import. The UI explicitly says that the source changed and regeneration is required to update the board and artifacts. An import failure never changes the current source text, stable items, board, rankings, match overrides, pack snapshot, or configuration.

Import, prompt drafting, manual source editing, and pack generation are mutually exclusive mutations. During import, Draft, Create/Regenerate, and the source textarea are disabled; selecting another file remains available and supersedes the older request. File selection is disabled during prompt drafting or pack generation.

## Parsing Semantics

The API reuses the deterministic parsers in `src/tierzo/parsers.py`:

- TXT: non-empty normalized lines;
- CSV: non-empty values from the first column;
- XLSX: non-empty values from the first column of the first worksheet.

The first non-empty value is preserved. Tierzo does not guess whether it is a header. Duplicate values are preserved. The response explains these semantics rather than silently applying heuristics.

The parsers accept optional item-count and item-length limits so the API can stop at `MAX_LIST_ITEMS + 1` instead of materializing an unbounded file. XLSX parsing uses read-only mode, disables external links, and closes the workbook in `finally`. Existing CLI calls remain unrestricted unless they explicitly provide limits.

## API Contract

Add `POST /intakes/files` as a multipart endpoint with one `file` field. The successful JSON response is:

```json
{
  "schema_version": "tierzo.file-intake.v1",
  "filename": "movies.xlsx",
  "format": "xlsx",
  "items": ["Alien", "Aliens"],
  "item_count": 2,
  "interpretation": "Imported the first worksheet's first column; the first value was preserved."
}
```

`filename` is a sanitized basename for display only and never determines the temporary path. `format` is `txt`, `csv`, or `xlsx`; `items` preserve source order and duplicates.

Validation errors use `detail: { code, message, limit?, item_index? }` with these stable codes and statuses:

- `unsupported_file_type` — 415;
- `file_too_large` — 413 with byte `limit`;
- `too_many_items` — 413 with item `limit`;
- `invalid_text_encoding` — 422;
- `malformed_file` — 422;
- `empty_intake` — 422;
- `item_too_long` — 422 with zero-based `item_index` and character `limit`;
- `unsafe_xlsx_archive` — 422.

The endpoint does not create a pack or stable item IDs. IDs remain a workspace concern and are assigned or reconciled by the existing web state logic after a successful response.

## Safety And Lifecycle

- Accept only `.txt`, `.csv`, and `.xlsx`; MIME type is advisory, not trusted.
- Read at most `MAX_INTAKE_FILE_BYTES + 1`; default `MAX_INTAKE_FILE_BYTES` is 5 MiB.
- Before `openpyxl` reads XLSX, require a valid ZIP, reject encrypted entries, and enforce `MAX_XLSX_ARCHIVE_MEMBERS=1000` and `MAX_XLSX_UNCOMPRESSED_BYTES=25 MiB` by default.
- Write only to a server-controlled temporary path when the existing path-based parser requires it.
- Always remove the temporary file after parsing, including failures.
- Never persist the original upload with the pack and never expose its temporary path.
- Stop parsing after the existing `MAX_LIST_ITEMS + 1` threshold and reject items beyond the existing 200-character `SourceItemRequest.name` contract.

## Web Structure

Keep upload request/state handling out of the main page component:

- `apps/api/tierzo_api/file_intake.py` owns schemas, configured limits, archive validation, bounded parsing coordination, and temporary-file cleanup; `main.py` only wires the endpoint;
- a small typed web module validates the response contract, maps structured API errors, and exposes a pure latest-request coordinator for abort/token behavior;
- a focused hook owns selected filename, loading state, success summary, error, cancellation, and delegates stale-response protection to that tested coordinator;
- `SourceTray` renders the file control and import feedback inside `Paste list`;
- `page.tsx` applies successful items through the existing `updateSourceText` reconciliation path.

A later import supersedes an earlier in-flight request. Cancelling or replacing a request is not presented as a parsing failure.

## Verification

Backend tests cover successful TXT, CSV, and XLSX imports plus uppercase extensions, duplicates, empty input, unsupported types, invalid UTF-8, malformed XLSX, encrypted/oversized XLSX archives, byte limits, item-count limits, item-length limits, and cleanup after success and parser exceptions.

Web tests cover contract validation, structured errors, stale-response protection, and preservation of the current list on failure. The new pure test file is added to `test:state`, so `pnpm verify` executes it. The real browser smoke first submits an invalid upload and confirms persisted workspace state is unchanged, then uploads a valid fixture, confirms the editable replacement and interpretation message, generates a pack, and verifies the established artifact/export path.

README, `docs/DEMO.md`, and `.env.example` document the supported formats, exact interpretation, configurable limits, and ephemeral cleanup. Final checks are `python -m unittest discover -s tests`, directed web tests, `pnpm verify`, a real browser review at desktop and mobile widths, and inspection that uploads or temporary files are neither left behind nor tracked.

## Non-Goals

- Merging imported and existing lists.
- Header inference, worksheet selection, or column mapping.
- CSV dialect configuration beyond the existing parser.
- Persisting or restoring original uploaded files.
- Image upload, arbitrary URLs, provider assets, MCP transport, or candidate review.

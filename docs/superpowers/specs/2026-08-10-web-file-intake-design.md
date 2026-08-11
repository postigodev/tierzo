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
- removed items leave the board deterministically and new items enter the bench;
- the resulting list remains editable before generation;
- the UI reports the filename, item count, and interpretation used.

An import failure never changes the current source text, stable items, board, rankings, match overrides, pack snapshot, or configuration. Import is disabled while pack generation is running.

## Parsing Semantics

The API reuses the deterministic parsers in `src/tierzo/parsers.py`:

- TXT: non-empty normalized lines;
- CSV: non-empty values from the first column;
- XLSX: non-empty values from the first column of the first worksheet.

The first non-empty value is preserved. Tierzo does not guess whether it is a header. Duplicate values are preserved. The response explains these semantics rather than silently applying heuristics.

## API Contract

Add `POST /intakes/files` as a multipart endpoint with one `file` field. The successful response uses schema `tierzo.file-intake.v1` and contains:

- sanitized original filename;
- normalized format (`txt`, `csv`, or `xlsx`);
- parsed items in source order;
- item count;
- a concise interpretation message suitable for clients.

Validation errors use a structured detail object with a stable code and human-readable message. Expected categories are unsupported format, excessive upload size, malformed or undecodable input, empty result, excessive item count, and unsafe XLSX archive.

The endpoint does not create a pack or stable item IDs. IDs remain a workspace concern and are assigned or reconciled by the existing web state logic after a successful response.

## Safety And Lifecycle

- Accept only `.txt`, `.csv`, and `.xlsx`; MIME type is advisory, not trusted.
- Apply a configurable upload-byte limit before parsing.
- Before `openpyxl` reads XLSX, validate that it is a ZIP and bound member count and total uncompressed bytes to reduce decompression-bomb risk.
- Write only to a server-controlled temporary path when the existing path-based parser requires it.
- Always remove the temporary file after parsing, including failures.
- Never persist the original upload with the pack and never expose its temporary path.
- Enforce the existing maximum item count after parsing.

## Web Structure

Keep upload request/state handling out of the main page component:

- a small typed client module validates the response contract and maps structured API errors;
- a focused hook owns selected filename, loading state, success summary, error, cancellation, and stale-response protection;
- `SourceTray` renders the file control and import feedback inside `Paste list`;
- `page.tsx` applies successful items through the existing `updateSourceText` reconciliation path.

A later import supersedes an earlier in-flight request. Cancelling or replacing a request is not presented as a parsing failure.

## Verification

Backend tests cover successful TXT, CSV, and XLSX imports plus uppercase extensions, duplicates, empty input, unsupported types, invalid UTF-8, malformed XLSX, unsafe XLSX archives, byte limits, and item limits.

Web tests cover contract validation, structured errors, stale-response protection, and preservation of the current list on failure. The real browser smoke uploads a fixture, confirms the editable replacement and interpretation message, generates a pack, and verifies the established artifact/export path.

Final checks are `python -m unittest discover -s tests`, directed web tests, `pnpm verify`, a real browser review at desktop and mobile widths, and inspection that uploads or temporary files are not tracked.

## Non-Goals

- Merging imported and existing lists.
- Header inference, worksheet selection, or column mapping.
- CSV dialect configuration beyond the existing parser.
- Persisting or restoring original uploaded files.
- Image upload, arbitrary URLs, provider assets, MCP transport, or candidate review.

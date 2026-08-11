# Web File Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let web users import validated TXT, CSV, and XLSX lists into the editable Tierzo workspace and continue through the existing generation and export flow.

**Architecture:** Extend the deterministic parsers with optional bounded iteration, then add a focused FastAPI file-intake service and a thin multipart route. Add a typed web client plus latest-request coordinator, wire it into the existing source reconciliation path, and keep the completed pack visible but explicitly stale until regeneration.

**Tech Stack:** Python 3.10+, FastAPI `UploadFile`, Pydantic, openpyxl, Next.js 16, React 19, TypeScript 5.9, Node test runner, Playwright.

## Global Constraints

- Successful import replaces the source list; it never merges.
- Failed or stale imports do not mutate workspace state.
- Matching stable item IDs and compatible rankings are preserved through existing reconciliation.
- New imported items do not receive fake artifacts or bench cards before regeneration.
- No durable upload storage, image assets, remote fetching, MCP, accounts, or generalized ingestion framework.
- Defaults: 5 MiB upload, 1,000 XLSX members, 25 MiB XLSX uncompressed data, 200 items, 200 characters per item.

---

### Task 1: Bounded deterministic parsing

**Files:**
- Modify: `src/tierzo/parsers.py`
- Modify: `tests/test_core.py`

**Interfaces:**
- Produces: `parse_input_file(path: Path, *, max_items: int | None = None, max_item_length: int | None = None) -> list[str]`
- Produces: `InputLimitError(kind: Literal["too_many_items", "item_too_long"], limit: int, item_index: int | None)`
- Preserves: existing unrestricted CLI behavior when limits are omitted.

- [ ] **Step 1: Add failing parser tests**

Cover bounded TXT/CSV/XLSX parsing, duplicate preservation, multiline CSV/XLSX cells, and guaranteed workbook close. Assert that CSV/XLSX values use `" ".join(value.split())`, item indexes are zero-based, and the parser stops when it reaches `max_items + 1`.

- [ ] **Step 2: Run the directed tests and confirm failure**

```powershell
python -m unittest tests.test_core.TierzoCoreTests.test_parse_csv_file_collapses_multiline_cells tests.test_core.TierzoCoreTests.test_parse_input_file_stops_at_item_limit
```

Expected: failures because bounded parsing and `InputLimitError` do not exist.

- [ ] **Step 3: Implement the bounded parser contract**

Add a shared collector that validates during iteration:

```python
class InputLimitError(ValueError):
    def __init__(self, kind: str, limit: int, item_index: int | None = None): ...

def collect_items(
    values: Iterable[object],
    *,
    flatten_whitespace: bool,
    max_items: int | None,
    max_item_length: int | None,
) -> list[str]: ...
```

Open XLSX with `read_only=True`, `data_only=True`, and `keep_links=False`; close it in `finally`. Keep public parser defaults backward compatible.

- [ ] **Step 4: Run core tests**

```powershell
python -m unittest tests.test_core
```

Expected: all core tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/tierzo/parsers.py tests/test_core.py
git commit -m "feat(core): add bounded file parsing"
```

### Task 2: Safe multipart intake API

**Files:**
- Create: `apps/api/tierzo_api/file_intake.py`
- Modify: `apps/api/tierzo_api/main.py`
- Modify: `tests/test_api.py`
- Modify: `.env.example`

**Interfaces:**
- Produces: `FileIntakeResponse` with `schema_version`, `filename`, `format`, `items`, `item_count`, `interpretation`.
- Produces: `FileIntakeErrorDetail` with `code`, `message`, optional `limit`, optional `item_index`.
- Produces: `parse_uploaded_file(upload: UploadFile) -> FileIntakeResponse`.
- Route: `POST /intakes/files`, multipart field `file`.

- [ ] **Step 1: Add failing endpoint tests**

Use `TestClient` multipart uploads for TXT, CSV, and an in-memory openpyxl workbook. Assert the exact v1 schema, uppercase extensions, duplicates and multiline cells. Add failures for unsupported extension (415), more than configured bytes/items (413), invalid UTF-8, malformed/unsafe XLSX, empty input and 201-character item (422).

Patch the parser to raise after the temporary file is created and assert the temp path no longer exists. Also assert cleanup after success.

- [ ] **Step 2: Run directed API tests and confirm failure**

```powershell
python -m unittest tests.test_api.TierzoApiTests.test_file_intake_reads_txt tests.test_api.TierzoApiTests.test_file_intake_rejects_unsafe_xlsx
```

Expected: 404 for the missing endpoint.

- [ ] **Step 3: Implement the focused service**

Define environment-backed limits and exact errors in `file_intake.py`. Read `UploadFile` in chunks up to `MAX_INTAKE_FILE_BYTES + 1`, sanitize the display filename with `Path(filename).name`, validate XLSX ZIP members before openpyxl, use `NamedTemporaryFile(delete=False, suffix=...)`, and unlink in `finally`.

```python
async def parse_uploaded_file(upload: UploadFile) -> FileIntakeResponse:
    suffix = validate_suffix(upload.filename)
    content = await read_bounded(upload, MAX_INTAKE_FILE_BYTES)
    if suffix == ".xlsx":
        validate_xlsx_archive(content)
    temporary_path = write_controlled_temp(content, suffix)
    try:
        items = parse_input_file(
            temporary_path,
            max_items=MAX_LIST_ITEMS,
            max_item_length=MAX_ITEM_NAME_LENGTH,
        )
    finally:
        temporary_path.unlink(missing_ok=True)
        await upload.close()
```

Map `InputLimitError`, Unicode errors, ZIP/openpyxl failures, and empty results to the documented structured HTTP errors. Keep `main.py` to the annotated `UploadFile` route and service call.

- [ ] **Step 4: Run API and full Python tests**

```powershell
python -m unittest tests.test_api
python -m unittest discover -s tests
```

Expected: all Python tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/tierzo_api/file_intake.py apps/api/tierzo_api/main.py tests/test_api.py .env.example
git commit -m "feat(api): add validated file intake"
```

### Task 3: Web import state and visible control

**Files:**
- Create: `apps/web/lib/file-intake.ts`
- Create: `apps/web/lib/file-intake.test.ts`
- Create: `apps/web/hooks/use-file-intake.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/components/source-tray.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: `FileIntakeResponse` and `parseFileIntakeResponse(input: unknown)`.
- Produces: `parseFileIntakeError(input: unknown, fallback: string) -> string`.
- Produces: pure `LatestImportCoordinator` with `start()`, `isCurrent(token)`, and `cancel()`.
- Produces: `useFileIntake({ onImported })` returning `importFile`, `isImporting`, `filename`, `summary`, and `error`.
- Consumes: `updateSourceText(items.join("\n"))` only for the current successful request.

- [ ] **Step 1: Add failing pure state tests**

Test valid/invalid response contracts, all structured error shapes, abort replacement, and rejection of a late response after a newer request. Add `lib/file-intake.test.ts` to `test:state`.

- [ ] **Step 2: Run directed tests and confirm failure**

```powershell
corepack pnpm --filter @tierzo/web test:state
```

Expected: module-not-found or missing-export failures for `file-intake.ts`.

- [ ] **Step 3: Implement client and hook**

Post `FormData` to `/intakes/files`, validate the v1 response before applying it, and use `AbortController` plus a monotonically increasing token so only the latest request can call `onImported`.

```ts
const form = new FormData();
form.append("file", file);
const response = await fetch(apiUrl("/intakes/files"), {
  method: "POST",
  body: form,
  signal,
});
```

Treat abort/supersession as silent cancellation, not an import error.

- [ ] **Step 4: Wire the visible composer behavior**

Render the file input inside `Paste list` with `.txt,.csv,.xlsx` accept hints and precise copy. Disable it during drafting/generation; during import disable Draft, Create/Regenerate, and manual source editing while leaving file reselection enabled. On success replace through `updateSourceText`, retain the existing pack, and show `Imported N items from file; regenerate to update board and artifacts.`

Keep layout changes local to the intake panel and verify accessible label, busy state, focus, long filenames, and mobile wrapping.

- [ ] **Step 5: Run web tests, lint, and build**

```powershell
corepack pnpm --filter @tierzo/web test:state
corepack pnpm --filter @tierzo/web lint
corepack pnpm --filter @tierzo/web build
```

Expected: all checks pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/lib/file-intake.ts apps/web/lib/file-intake.test.ts apps/web/hooks/use-file-intake.ts apps/web/package.json apps/web/app/page.tsx apps/web/components/source-tray.tsx apps/web/app/globals.css
git commit -m "feat(web): add file intake to workspace"
```

### Task 4: Real flow, documentation, and publication

**Files:**
- Create: `examples/demo-items.csv`
- Modify: `apps/web/scripts/verify-demo.mjs`
- Modify: `README.md`
- Modify: `docs/DEMO.md`

**Interfaces:**
- Smoke proves: invalid import preserves local workspace; valid import replaces source; interpretation is visible; generated artifacts match imported items.

- [ ] **Step 1: Extend the browser verifier**

Create a small CSV fixture with a duplicate and upload it through Playwright. Snapshot localStorage before a rejected upload and assert equality afterward. Upload the valid fixture, inspect the editable textarea and message, generate, then run the existing manifest/ZIP/PNG assertions.

- [ ] **Step 2: Update truthful docs**

Document the three formats, first-column/first-sheet rules, no header inference, replacement semantics, upload limits, temporary cleanup, and the fact that regeneration is required after import to update artifacts.

- [ ] **Step 3: Run final verification**

```powershell
corepack pnpm verify
corepack pnpm demo:verify
git diff --check origin/main...HEAD
git status --short
```

Expected: all checks pass; only intentional source/docs/fixture files are tracked.

- [ ] **Step 4: Review the real UI**

Start `pnpm dev`, exercise invalid and valid imports in the browser at desktop and 390px widths, generate the imported pack, inspect artifact filenames/manifest, and stop only the verified Tierzo server PIDs.

- [ ] **Step 5: Commit final verification assets and docs**

```powershell
git add examples/demo-items.csv apps/web/scripts/verify-demo.mjs README.md docs/DEMO.md
git commit -m "test(demo): verify web file intake"
```

- [ ] **Step 6: Publish a draft PR**

```powershell
git push -u origin postigodev/web-file-intake
gh pr create --draft --base main --head postigodev/web-file-intake --title "feat(web): add file intake" --body "Closes #3"
```

The PR body must summarize replacement semantics, parser rules, safety limits, state preservation, contracts, checks, and any remaining launch risk.

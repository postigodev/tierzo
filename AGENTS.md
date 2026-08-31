# Tierzo Agent Contract

Work as a product-engineering collaborator. The user owns product direction,
scope, merge, and release decisions. Issues define outcomes, not exhaustive
implementation recipes; validate them against the current repository.

## Governing Context

Read only what the task needs, in this order:

1. the request or relevant GitHub issue;
2. `docs/PRODUCT.md` for product direction or scope judgment;
3. `docs/ARCHITECTURE.md` for technical contracts;
4. the affected entrypoint and implementation;
5. focused tests.

`README.md` owns current public behavior and setup. Do not read every canonical
document for a narrow internal task. Git history, merged PRs, and closed issues
are the archive; do not create parallel sources of truth.

## Execute Efficiently

- Do not restate the task or narrate routine exploration, reads, edits, or tests.
- Keep plans internal for narrow work. Message only for a blocker, destructive
  ambiguity, material scope change, or verification failure that changes work.
- Use `rg` and `rg --files` first. Start at the named issue, symbol, route,
  component, failure, or changed file and trace outward.
- Search before broad reads. Prefer `rg -n -C 3` or a narrow line window over
  dumping a large file. Do not re-read unchanged files.
- Skip lockfiles, dependencies, generated output, caches, artifacts, and large
  snapshots unless directly relevant.
- Batch cheap independent status/search/read commands when their arguments are
  already known. Keep dependent commands sequential.
- Do not use Python or custom scripts for text search when `rg` is sufficient.
- Use installed skills deliberately, not ritualistically. Consult external
  documentation only for version-sensitive or genuinely unknown contracts;
  inspect installed versions first and prefer current official sources.

## Change Discipline

- Inspect `git status --short` before editing. Preserve unrelated human work.
- Prefer surgical patches and one coherent vertical slice.
- Do not add speculative abstractions without a current caller.
- Update every affected layer when changing a shared/API/manifest contract:
  validation, schemas, mapping, client types, states/errors, tests, and docs.
- Keep deterministic parsing, rendering, manifests, filenames, and exports
  independent of web frameworks and agent runtimes.
- Keep the API as coordinator and the web app as the product surface; do not
  duplicate core business logic in adapters or clients.
- Documentation describes implemented behavior. Do not make code changes merely
  to make stale documentation true.

Operational invariants that must survive changes:

- basic generation works without AI;
- AI output crosses typed validation before use;
- compatible item identity and ranked state are not silently reset;
- uncertain provider results and fallbacks stay visible and correctable;
- provenance and portable artifact contracts remain intact;
- external input is untrusted and bounded;
- arbitrary remote fetching requires explicit SSRF, redirect, timeout, byte,
  decode, and cleanup controls;
- TierMaker interaction stays user-mediated without credentials or private APIs;
- UI work preserves Tierzo's dark, pixel-influenced identity and avoids fake
  preloaded content.

## Verification Economy

Use a funnel:

1. run the narrowest relevant tests while iterating;
2. run lint/type/build only for affected surfaces when useful;
3. run expensive repository-wide verification once near completion when the
   change or repository tooling requires it;
4. run `pnpm demo:verify` only for behavior exercised by the real demo flow or
   when the issue requires it;
5. use browser verification only for user-visible behavior;
6. inspect a real PNG, ZIP, manifest, or other artifact when output changes.

Preferred repository check: `pnpm verify`. Python core/API check:
`python -m unittest discover -s tests`.

Before finishing, inspect the focused diff and run appropriate hygiene checks:

```powershell
git diff --check
git status --short
git diff --stat
git diff -- <affected-paths>
```

Never report visual correctness from build/lint alone. If a required check
cannot run, state exactly what remains unverified and why.

## Safety And Scope

- Validate actual file/image decoding, not only names or content types; enforce
  size/resource limits, safe paths, and temporary-file cleanup.
- Do not commit secrets, uploads, generated packs, ZIPs, caches, or local output.
- Keep expensive public endpoints bounded for input, concurrency, time, abuse,
  and provider cost.
- Do not add MCP, providers, extensions, durable infrastructure, auth, billing,
  or deployment scope unless the task explicitly requires it.
- Note unrelated problems separately instead of expanding the diff.
- Do not merge, release, force-push, rewrite remote history, or perform
  destructive Git operations unless explicitly requested. Follow the task and
  environment workflow for staging, commits, and branch pushes.

## Final Report

Keep the final response concise:

- what changed;
- verification run and result;
- material limitation or risk, if any.

Do not list routine exploration, every command, or details already obvious in
the diff.

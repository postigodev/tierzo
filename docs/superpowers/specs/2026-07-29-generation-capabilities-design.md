# Generation Capabilities Design

## Goal

Make Tierzo's generation paths honest and usable with or without OpenAI and
TMDb, while defining a small typed capability contract that the web client and
future MCP clients can share.

## Contract

`GET /capabilities` is the product-capability endpoint; `/health` remains a
liveness endpoint. Its exact v1 shape is:

```json
{
  "schema_version": "tierzo.capabilities.v1",
  "capabilities": {
    "text_cards": {
      "available": true,
      "effective_mode": "deterministic",
      "reason_code": null
    },
    "prompt_drafting": {
      "available": true,
      "effective_mode": "openai",
      "reason_code": null
    },
    "auto_planning": {
      "available": true,
      "effective_mode": "openai",
      "reason_code": null
    },
    "tmdb_movie": {
      "available": false,
      "effective_mode": "unavailable",
      "reason_code": "tmdb_unconfigured"
    }
  }
}
```

`prompt_drafting` and `auto_planning` use `openai | heuristic`;
`tmdb_movie` uses `tmdb | unavailable`; `text_cards` is always
`deterministic`. `reason_code` is a stable machine code, not display copy. The
only configuration reasons in v1 are `openai_unconfigured` and
`tmdb_unconfigured`.

Pack and prompt-draft responses add:

```json
{
  "outcome": "normal",
  "warnings": [
    {
      "code": "openai_unconfigured_heuristic",
      "message": "OpenAI is not configured; Tierzo used deterministic planning."
    }
  ]
}
```

`outcome` is `normal | degraded`. Warning codes in v1 are:

- `openai_unconfigured_heuristic`;
- `openai_provider_heuristic_fallback`;
- `tmdb_unconfigured_text_fallback`;
- `tmdb_provider_text_fallback`;
- `tmdb_partial_match`;
- `unsupported_planner_tool_text_fallback`.

Warnings are ordered by pipeline stage and deduplicated by code. Text mode is
normal. A complete TMDb match is normal. Partial TMDb matches, missing
configuration, provider exceptions, OpenAI-to-heuristic fallback, and planner
tools without an execution path are degraded. Direct `/packs` and async
`/jobs` use the same pack fields; jobs do not add a second outcome. Existing
`enrichment_status` remains populated for compatibility. Invalid input and
total failure remain errors.

## Behavior

Prompt drafting calls OpenAI when configured. Missing configuration or provider
failure uses deterministic parsing only when the prompt contains at least two
explicit items separated by newlines, commas, or semicolons. Vague prose that
would require invention returns a typed 422 error asking the user to paste
explicit items or configure OpenAI. A successful heuristic draft is degraded,
identifies `source: heuristic`, and explains why.

OpenAI and heuristic cache entries use separate keys. Configured requests read
only cached OpenAI results; unconfigured requests read only heuristic results.
An OpenAI failure may write the heuristic cache but not poison the OpenAI
cache. `source` always describes the cached result's origin and `cache_hit`
only describes reuse of that same path.

Text cards remain available without external configuration. Explicit Movie
posters stays visible in the web selector but is disabled with a reason when
TMDb is unavailable. Auto Agent remains selectable because it can plan and
generate deterministically. If capability discovery itself fails, the web
allows deterministic paths, disables explicit provider modes, and reports that
external capabilities could not be verified.

Prompt-draft suggestions are clamped against current capabilities. A suggested
`tmdb_movie` becomes `text` with a warning when TMDb is unavailable, so the web
never selects a disabled option.

TMDb configuration or lookup failure continues to produce text cards when
possible. Planner results for `steam`, `spotify`, or any other unsupported
execution tool resolve to text cards with
`unsupported_planner_tool_text_fallback`; the planner metadata remains
inspectable. The typed outcome and warnings replace client-side substring
parsing as the primary interpretation.

New API fields have defaults so existing internal constructors and legacy
clients remain compatible. Web validation accepts older pack responses and
persisted snapshots without `outcome` or `warnings`, synthesizes them from
`enrichment_status`, and saves the normalized v3 snapshot. Existing fields and
URLs are unchanged.

## Boundaries

This slice does not add feature-flag infrastructure, providers, uploads,
candidate review, MCP tools, durable storage, or accounts. It does not remove
legacy response fields.

## Verification

Backend tests cover capability responses and prompt/generation behavior with
providers configured, absent, and failing. Web tests cover contract validation,
safe capability-discovery failure, disabled provider controls, and structured
outcome copy. Tests also cover separated provider caches, vague heuristic
prompts, suggestion clamping, unsupported planner tools, partial TMDb matches,
legacy response normalization, direct packs, and async jobs. Existing
lifecycle, identity, ranking, export, and demo verification must continue to
pass.

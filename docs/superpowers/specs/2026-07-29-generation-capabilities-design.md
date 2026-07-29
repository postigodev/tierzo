# Generation Capabilities Design

## Goal

Make Tierzo's generation paths honest and usable with or without OpenAI and
TMDb, while defining a small typed capability contract that the web client and
future MCP clients can share.

## Contract

`GET /capabilities` is the product-capability endpoint; `/health` remains a
liveness endpoint. The response has a schema version and explicit entries for:

- deterministic text-card generation, which is always available;
- prompt drafting and automatic planning, including their effective
  `openai` or `heuristic` path;
- TMDb movie enrichment, which is available only when configured.

Each capability reports `available`, an effective mode, and an optional reason.
Clients must validate this response and fall back safely when it cannot be
loaded.

Generation and prompt-draft results add a typed outcome:

- `normal`: the requested or preferred path completed;
- `degraded`: Tierzo completed through a fallback, with structured warnings.

Existing `enrichment_status` remains populated for compatibility. Invalid input
and total failure remain errors rather than degraded success.

## Behavior

Prompt drafting calls OpenAI when configured. Missing configuration or provider
failure uses the existing deterministic heuristic path and returns a usable
draft when the prompt itself contains usable items. The response identifies
the actual source and explains degradation without presenting it as failure.

Text cards remain available without external configuration. Explicit Movie
posters stays visible in the web selector but is disabled with a reason when
TMDb is unavailable. Auto Agent remains selectable because it can plan and
generate deterministically. If capability discovery itself fails, the web
allows deterministic paths, disables explicit provider modes, and reports that
external capabilities could not be verified.

TMDb configuration or lookup failure continues to produce text cards when
possible. The typed outcome and warnings replace client-side substring parsing
as the primary interpretation, while legacy fields remain compatible.

## Boundaries

This slice does not add feature-flag infrastructure, providers, uploads,
candidate review, MCP tools, durable storage, or accounts. It does not remove
legacy response fields.

## Verification

Backend tests cover capability responses and prompt/generation behavior with
providers configured, absent, and failing. Web tests cover contract validation,
safe capability-discovery failure, disabled provider controls, and structured
outcome copy. Existing lifecycle, identity, ranking, export, and demo
verification must continue to pass.

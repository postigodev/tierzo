import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCapabilities,
  unavailableCapabilities,
} from "./capabilities.ts";

const configured = {
  schema_version: "tierzo.capabilities.v1",
  capabilities: {
    text_cards: {
      available: true,
      effective_mode: "deterministic",
      reason_code: null,
    },
    prompt_drafting: {
      available: true,
      effective_mode: "openai",
      reason_code: null,
    },
    auto_planning: {
      available: true,
      effective_mode: "openai",
      reason_code: null,
    },
    tmdb_movie: {
      available: true,
      effective_mode: "tmdb",
      reason_code: null,
    },
  },
};

test("accepts the exact capabilities v1 contract", () => {
  assert.deepEqual(parseCapabilities(configured), configured);
});

test("rejects unknown schemas and inconsistent provider modes", () => {
  assert.throws(() =>
    parseCapabilities({ ...configured, schema_version: "future" }),
  );
  assert.throws(() =>
    parseCapabilities({
      ...configured,
      capabilities: {
        ...configured.capabilities,
        tmdb_movie: {
          available: false,
          effective_mode: "tmdb",
          reason_code: "tmdb_unconfigured",
        },
      },
    }),
  );
});

test("uses a deterministic conservative fallback", () => {
  assert.equal(
    unavailableCapabilities.capabilities.text_cards.available,
    true,
  );
  assert.equal(
    unavailableCapabilities.capabilities.auto_planning.available,
    true,
  );
  assert.equal(
    unavailableCapabilities.capabilities.tmdb_movie.available,
    false,
  );
});

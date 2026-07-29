import type {
  CapabilitiesResponse,
  CapabilityEntry,
} from "./types.ts";

const MODES = new Set([
  "deterministic",
  "openai",
  "heuristic",
  "tmdb",
  "unavailable",
]);
const REASONS = new Set([
  "openai_unconfigured",
  "tmdb_unconfigured",
]);

export const unavailableCapabilities: CapabilitiesResponse = {
  schema_version: "tierzo.capabilities.v1",
  capabilities: {
    text_cards: {
      available: true,
      effective_mode: "deterministic",
      reason_code: null,
    },
    prompt_drafting: {
      available: true,
      effective_mode: "heuristic",
      reason_code: "openai_unconfigured",
    },
    auto_planning: {
      available: true,
      effective_mode: "heuristic",
      reason_code: "openai_unconfigured",
    },
    tmdb_movie: {
      available: false,
      effective_mode: "unavailable",
      reason_code: "tmdb_unconfigured",
    },
  },
};

export function parseCapabilities(value: unknown): CapabilitiesResponse {
  if (!isRecord(value) || value.schema_version !== "tierzo.capabilities.v1") {
    throw new Error("Tierzo received an invalid capabilities response.");
  }
  const capabilities = value.capabilities;
  if (
    !isRecord(capabilities) ||
    !isCapabilityEntry(capabilities.text_cards) ||
    capabilities.text_cards.effective_mode !== "deterministic" ||
    !capabilities.text_cards.available ||
    capabilities.text_cards.reason_code !== null ||
    !isCapabilityEntry(capabilities.prompt_drafting) ||
    !["openai", "heuristic"].includes(
      capabilities.prompt_drafting.effective_mode,
    ) ||
    !capabilities.prompt_drafting.available ||
    !hasPlanningReason(capabilities.prompt_drafting) ||
    !isCapabilityEntry(capabilities.auto_planning) ||
    !["openai", "heuristic"].includes(
      capabilities.auto_planning.effective_mode,
    ) ||
    !capabilities.auto_planning.available ||
    !hasPlanningReason(capabilities.auto_planning) ||
    !isCapabilityEntry(capabilities.tmdb_movie) ||
    !["tmdb", "unavailable"].includes(
      capabilities.tmdb_movie.effective_mode,
    ) ||
    capabilities.tmdb_movie.available !==
      (capabilities.tmdb_movie.effective_mode === "tmdb") ||
    (capabilities.tmdb_movie.available
      ? capabilities.tmdb_movie.reason_code !== null
      : capabilities.tmdb_movie.reason_code !== "tmdb_unconfigured")
  ) {
    throw new Error("Tierzo received an invalid capabilities response.");
  }
  return value as CapabilitiesResponse;
}

function hasPlanningReason(entry: CapabilityEntry): boolean {
  return entry.effective_mode === "openai"
    ? entry.reason_code === null
    : entry.reason_code === "openai_unconfigured";
}

function isCapabilityEntry(value: unknown): value is CapabilityEntry {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.available === "boolean" &&
    typeof value.effective_mode === "string" &&
    MODES.has(value.effective_mode) &&
    (value.reason_code === null ||
      (typeof value.reason_code === "string" &&
        REASONS.has(value.reason_code)))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

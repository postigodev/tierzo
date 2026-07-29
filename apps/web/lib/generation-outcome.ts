import type {
  GenerationOutcome,
  GenerationWarning,
  GenerationWarningCode,
} from "./types.ts";

const WARNING_CODES = new Set<GenerationWarningCode>([
  "openai_unconfigured_heuristic",
  "openai_provider_heuristic_fallback",
  "tmdb_unconfigured_text_fallback",
  "tmdb_provider_text_fallback",
  "tmdb_partial_match",
  "unsupported_planner_tool_text_fallback",
]);

const LEGACY_MESSAGES: Record<GenerationWarningCode, string> = {
  openai_unconfigured_heuristic:
    "OpenAI is not configured; Tierzo used deterministic planning.",
  openai_provider_heuristic_fallback:
    "OpenAI planning was unavailable; Tierzo used deterministic planning.",
  tmdb_unconfigured_text_fallback:
    "TMDb is not configured; Tierzo generated text cards instead.",
  tmdb_provider_text_fallback:
    "TMDb lookup failed; Tierzo generated text cards instead.",
  tmdb_partial_match:
    "Some movie posters were unavailable; Tierzo used text cards for them.",
  unsupported_planner_tool_text_fallback:
    "The planned asset provider is not supported; Tierzo used text cards.",
};

export type NormalizedGenerationOutcome = {
  outcome: GenerationOutcome;
  warnings: GenerationWarning[];
};

export function normalizeGenerationOutcome(
  enrichmentStatus: string,
  outcome: unknown,
  warnings: unknown,
): NormalizedGenerationOutcome | null {
  if (outcome === undefined && warnings === undefined) {
    return inferLegacyGenerationOutcome(enrichmentStatus);
  }
  if (
    (outcome !== "normal" && outcome !== "degraded") ||
    !Array.isArray(warnings)
  ) {
    return null;
  }

  const normalizedWarnings: GenerationWarning[] = [];
  const seen = new Set<GenerationWarningCode>();
  for (const value of warnings) {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      return null;
    }
    const warning = value as Record<string, unknown>;
    if (
      typeof warning.code !== "string" ||
      !WARNING_CODES.has(warning.code as GenerationWarningCode) ||
      typeof warning.message !== "string" ||
      !warning.message.trim() ||
      seen.has(warning.code as GenerationWarningCode)
    ) {
      return null;
    }
    seen.add(warning.code as GenerationWarningCode);
    normalizedWarnings.push({
      code: warning.code as GenerationWarningCode,
      message: warning.message,
    });
  }

  if (
    (outcome === "normal" && normalizedWarnings.length > 0) ||
    (outcome === "degraded" && normalizedWarnings.length === 0)
  ) {
    return null;
  }
  return { outcome, warnings: normalizedWarnings };
}

function inferLegacyGenerationOutcome(
  enrichmentStatus: string,
): NormalizedGenerationOutcome {
  const warningCodes: GenerationWarningCode[] = [];
  const match = /^tmdb_movie:(\d+)\/(\d+)$/.exec(enrichmentStatus);
  if (
    match &&
    Number(match[1]) < Number(match[2])
  ) {
    warningCodes.push("tmdb_partial_match");
  } else if (enrichmentStatus.includes("missing_api_key")) {
    warningCodes.push("tmdb_unconfigured_text_fallback");
  } else if (enrichmentStatus.includes("error_fallback_text")) {
    warningCodes.push("tmdb_provider_text_fallback");
  }

  return {
    outcome: warningCodes.length > 0 ? "degraded" : "normal",
    warnings: warningCodes.map((code) => ({
      code,
      message: LEGACY_MESSAGES[code],
    })),
  };
}

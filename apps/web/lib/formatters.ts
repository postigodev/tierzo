import type { GenerationJob, JobStep, PackItem, PackResponse } from "./types";

export function formatGenerationStatus(pack: PackResponse) {
  const status = pack.enrichment_status;
  if (status === "text") {
    return `Generated ${pack.item_count} text cards.`;
  }

  const match = status.match(/^tmdb_movie:(\d+)\/(\d+)$/);
  if (match) {
    const matched = Number(match[1]);
    const total = Number(match[2]);
    const fallback = total - matched;
    return fallback > 0
      ? `Found ${matched}/${total} movie posters. ${fallback} used text cards.`
      : `Found movie posters for all ${total} items.`;
  }

  if (status.includes("missing_api_key")) {
    return "Movie posters need a TMDb key. Generated text cards instead.";
  }

  if (status.includes("error_fallback_text")) {
    return "Movie poster lookup failed. Generated text cards instead.";
  }

  return status;
}

export function formatToolName(tool: string) {
  if (tool === "tmdb_movie") return "movie posters";
  if (tool === "text") return "text cards";
  if (tool === "steam") return "Steam assets";
  if (tool === "spotify") return "Spotify assets";
  return tool;
}

export function formatMatchSource(item: PackItem) {
  if (item.asset_kind === "text-card") {
    return "Generated as a text card from your list.";
  }

  if (item.source_type === "tmdb") {
    return `TMDb movie ${item.source_value ?? ""}`.trim();
  }

  return item.source_type || "External source";
}

export function formatMatchQuality(item: PackItem) {
  if (item.asset_kind === "text-card") {
    return "Text card";
  }

  if (item.confidence === null) {
    return "Matched";
  }

  if (item.confidence >= 0.9) return "Strong";
  if (item.confidence >= 0.75) return "Good";
  return "Review";
}

export function formatJobStatus(status: GenerationJob["status"]) {
  if (status === "queued") return "Queued";
  if (status === "running") return "Running checks";
  if (status === "failed") return "Needs attention";
  return "Done";
}

export function formatStepIcon(status: JobStep["status"]) {
  if (status === "done") return "\u2713";
  if (status === "warning") return "!";
  if (status === "error") return "x";
  if (status === "running") return "\u21bb";
  return "\u00b7";
}
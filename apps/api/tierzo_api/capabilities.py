from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


Outcome = Literal["normal", "degraded"]
WarningCode = Literal[
    "openai_unconfigured_heuristic",
    "openai_provider_heuristic_fallback",
    "tmdb_unconfigured_text_fallback",
    "tmdb_provider_text_fallback",
    "tmdb_partial_match",
    "unsupported_planner_tool_text_fallback",
]
EffectiveMode = Literal[
    "deterministic",
    "openai",
    "heuristic",
    "tmdb",
    "unavailable",
]
ReasonCode = Literal["openai_unconfigured", "tmdb_unconfigured"]


WARNING_MESSAGES: dict[WarningCode, str] = {
    "openai_unconfigured_heuristic": (
        "OpenAI is not configured; Tierzo used deterministic planning."
    ),
    "openai_provider_heuristic_fallback": (
        "OpenAI planning was unavailable; Tierzo used deterministic planning."
    ),
    "tmdb_unconfigured_text_fallback": (
        "TMDb is not configured; Tierzo generated text cards instead."
    ),
    "tmdb_provider_text_fallback": (
        "TMDb lookup failed; Tierzo generated text cards instead."
    ),
    "tmdb_partial_match": (
        "Some movie posters were unavailable; Tierzo used text cards for them."
    ),
    "unsupported_planner_tool_text_fallback": (
        "The planned asset provider is not supported; Tierzo used text cards."
    ),
}


class ResultWarning(BaseModel):
    code: WarningCode
    message: str


class CapabilityEntry(BaseModel):
    available: bool
    effective_mode: EffectiveMode
    reason_code: ReasonCode | None = None


class Capabilities(BaseModel):
    text_cards: CapabilityEntry
    prompt_drafting: CapabilityEntry
    auto_planning: CapabilityEntry
    tmdb_movie: CapabilityEntry


class CapabilitiesResponse(BaseModel):
    schema_version: Literal["tierzo.capabilities.v1"] = "tierzo.capabilities.v1"
    capabilities: Capabilities


def make_warning(code: WarningCode) -> ResultWarning:
    return ResultWarning(code=code, message=WARNING_MESSAGES[code])


def deduplicate_warnings(
    warnings: list[ResultWarning],
) -> list[ResultWarning]:
    result: list[ResultWarning] = []
    seen: set[WarningCode] = set()
    for warning in warnings:
        if warning.code in seen:
            continue
        seen.add(warning.code)
        result.append(warning)
    return result


def outcome_for(warnings: list[ResultWarning]) -> Outcome:
    return "degraded" if warnings else "normal"


def build_capabilities(
    *,
    openai_configured: bool,
    tmdb_configured: bool,
) -> CapabilitiesResponse:
    planning = CapabilityEntry(
        available=True,
        effective_mode="openai" if openai_configured else "heuristic",
        reason_code=None if openai_configured else "openai_unconfigured",
    )
    return CapabilitiesResponse(
        capabilities=Capabilities(
            text_cards=CapabilityEntry(
                available=True,
                effective_mode="deterministic",
            ),
            prompt_drafting=planning,
            auto_planning=planning,
            tmdb_movie=CapabilityEntry(
                available=tmdb_configured,
                effective_mode="tmdb" if tmdb_configured else "unavailable",
                reason_code=None if tmdb_configured else "tmdb_unconfigured",
            ),
        )
    )

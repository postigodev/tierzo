"use client";

import type { CSSProperties } from "react";

import { AgentRunPanel } from "./agent-run-panel";
import { CardLabPanel } from "./card-lab-panel";
import { MatchesPanel } from "./matches-panel";
import { apiUrl } from "../lib/api";
import { formatGenerationStatus, formatToolName } from "../lib/formatters";
import type {
  CardStyle,
  GenerationJob,
  MatchOverrides,
  PackResponse,
  PromptDraftResponse,
} from "../lib/types";

type FontOption = {
  css: string;
  label: string;
  value: string;
};

export function SourceTray({
  canReviewMatches,
  cardLabStyle,
  cardStyle,
  enrichmentMode,
  error,
  fontOptions,
  generationJob,
  isGenerating,
  isDraftingPrompt,
  itemCount,
  identityNotice,
  onApplyMatchOverrides,
  onDraftFromPrompt,
  onGeneratePack,
  onSetEnrichmentMode,
  onSetPromptText,
  onSetShowMatches,
  onSetText,
  onSelectPreset,
  onUpdateCardStyle,
  onUpdateMatchOverride,
  pack,
  preset,
  presets,
  promptDraft,
  promptError,
  promptText,
  showMatches,
  text,
  matchOverrides,
}: {
  canReviewMatches: boolean;
  cardLabStyle: CSSProperties;
  cardStyle: CardStyle;
  enrichmentMode: string;
  error: string | null;
  fontOptions: FontOption[];
  generationJob: GenerationJob | null;
  isGenerating: boolean;
  isDraftingPrompt: boolean;
  itemCount: number;
  identityNotice: string | null;
  matchOverrides: MatchOverrides;
  onApplyMatchOverrides: () => void;
  onDraftFromPrompt: () => void;
  onGeneratePack: () => void;
  onSelectPreset: (preset: string) => void;
  onSetEnrichmentMode: (mode: string) => void;
  onSetPromptText: (text: string) => void;
  onSetShowMatches: (updater: (current: boolean) => boolean) => void;
  onSetText: (text: string) => void;
  onUpdateCardStyle: (nextStyle: Partial<CardStyle>) => void;
  onUpdateMatchOverride: (
    itemId: string,
    action: "keep" | "text",
  ) => void;
  pack: PackResponse | null;
  preset: string;
  presets: string[];
  promptDraft: PromptDraftResponse | null;
  promptError: string | null;
  promptText: string;
  showMatches: boolean;
  text: string;
}) {
  return (
    <div className="source-tray">
      <div>
        <div className="prompt-draft-box">
          <div className="source-copy prompt-draft-copy">
            <span>Prompt to tier list</span>
            <strong>Describe what you want and Tierzo drafts the list</strong>
          </div>
          <div className="prompt-draft-row">
            <input
              aria-label="Prompt to tier list"
              className="prompt-draft-input"
              value={promptText}
              onChange={(event) => onSetPromptText(event.target.value)}
              placeholder="e.g. best PS2 survival horror games for one spooky night"
              disabled={isGenerating}
            />
            <button
              type="button"
              className="secondary-action"
              onClick={onDraftFromPrompt}
              disabled={isDraftingPrompt || isGenerating || !promptText.trim()}
            >
              {isDraftingPrompt ? "Drafting..." : "Draft list"}
            </button>
          </div>
          {promptDraft ? (
            <p className="prompt-draft-status">
              Drafted {promptDraft.items.length} items via {formatToolName(promptDraft.suggested_enrichment_mode)}
              {promptDraft.cache_hit ? " from cache" : ""}.
            </p>
          ) : (
            <p className="prompt-draft-status">
              Tierzo suggests a title, item list, and best generate mode before rendering.
            </p>
          )}
          {promptError ? <p className="error">{promptError}</p> : null}
        </div>
        <div className="source-copy">
          <span>Items</span>
          <strong>{itemCount} items</strong>
        </div>
        <textarea
          id="items"
          value={text}
          onChange={(event) => onSetText(event.target.value)}
          disabled={isGenerating}
          spellCheck={false}
        />
      </div>
      <div className="source-actions">
        <label>
          Preset
          <select
            value={preset}
            onChange={(event) => onSelectPreset(event.target.value)}
          >
            {presets.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="mode-label">
          <span className="mode-label-title">Generate mode</span>
          <select
            aria-label="Generate mode"
            value={enrichmentMode}
            onChange={(event) => onSetEnrichmentMode(event.target.value)}
          >
            <option value="auto">Auto Agent</option>
            <option value="text">Text cards only</option>
            <option value="tmdb_movie">Movie posters</option>
          </select>
          <small>Pick automatic sourcing or force a specific asset mode.</small>
        </label>
        <CardLabPanel
          cardLabStyle={cardLabStyle}
          cardStyle={cardStyle}
          fontOptions={fontOptions}
          onUpdateStyle={onUpdateCardStyle}
        />
        <button
          type="button"
          onClick={onGeneratePack}
          disabled={isGenerating || isDraftingPrompt || itemCount === 0}
        >
          {isGenerating ? "Generating..." : "Generate pack"}
        </button>
        {pack && canReviewMatches ? (
          <button
            className="secondary-action"
            type="button"
            onClick={() => onSetShowMatches((current) => !current)}
          >
            {showMatches ? "Hide matches" : "View matches"}
          </button>
        ) : null}
        {pack ? (
          <a className="secondary-action" href={apiUrl(pack.manifest_url)}>
            Manifest
          </a>
        ) : null}
        {pack ? (
          <a className="secondary-action" href={apiUrl(pack.extension_url)}>
            Extension JSON
          </a>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {identityNotice ? (
          <p className="enrichment-status">{identityNotice}</p>
        ) : null}
        {generationJob && generationJob.status !== "completed" ? (
          <AgentRunPanel job={generationJob} />
        ) : null}
        {pack ? (
          <p className="enrichment-status">{formatGenerationStatus(pack)}</p>
        ) : null}
        {pack?.agent_plan ? (
          <p className="enrichment-status">
            Tierzo read this as {pack.agent_plan.domain} and chose{" "}
            {formatToolName(pack.agent_plan.tool)}
            {pack.agent_plan.cache_hit ? " from cache" : ""}
          </p>
        ) : null}
        {pack && canReviewMatches && showMatches ? (
          <MatchesPanel
            isApplying={isGenerating}
            onApply={onApplyMatchOverrides}
            onOverride={onUpdateMatchOverride}
            overrides={matchOverrides}
            pack={pack}
          />
        ) : null}
      </div>
    </div>
  );
}

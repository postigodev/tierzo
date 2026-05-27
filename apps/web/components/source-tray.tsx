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
  itemCount,
  onApplyMatchOverrides,
  onGeneratePack,
  onSetEnrichmentMode,
  onSetShowMatches,
  onSetText,
  onSelectPreset,
  onUpdateCardStyle,
  onUpdateMatchOverride,
  pack,
  preset,
  presets,
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
  itemCount: number;
  matchOverrides: MatchOverrides;
  onApplyMatchOverrides: () => void;
  onGeneratePack: () => void;
  onSelectPreset: (preset: string) => void;
  onSetEnrichmentMode: (mode: string) => void;
  onSetShowMatches: (updater: (current: boolean) => boolean) => void;
  onSetText: (text: string) => void;
  onUpdateCardStyle: (nextStyle: Partial<CardStyle>) => void;
  onUpdateMatchOverride: (
    itemName: string,
    action: "keep" | "text" | "image_url",
    value?: string,
  ) => void;
  pack: PackResponse | null;
  preset: string;
  presets: string[];
  showMatches: boolean;
  text: string;
}) {
  return (
    <div className="source-tray">
      <div>
        <div className="source-copy">
          <span>Items</span>
          <strong>{itemCount} items</strong>
        </div>
        <textarea
          id="items"
          value={text}
          onChange={(event) => onSetText(event.target.value)}
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
          disabled={isGenerating || itemCount === 0}
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

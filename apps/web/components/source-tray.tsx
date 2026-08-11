"use client";

import type { CSSProperties } from "react";
import { useState } from "react";

import { AgentRunPanel } from "./agent-run-panel";
import { CardLabPanel } from "./card-lab-panel";
import { MatchesPanel } from "./matches-panel";
import { apiUrl } from "../lib/api";
import { canControlSavedGeneration } from "../lib/generation-lifecycle";
import {
  formatArtifactState,
  formatGenerationStatus,
  formatPollingState,
  formatToolName,
} from "../lib/formatters";
import type {
  ArtifactState,
  CardStyle,
  GenerationJob,
  MatchOverrides,
  PersistedPackSnapshot,
  PollingState,
  PromptDraftResponse,
} from "../lib/types";
import type { WorkspacePhase } from "../lib/workspace-view";
import type { CapabilityState } from "../hooks/use-capabilities";

type FontOption = {
  css: string;
  label: string;
  value: string;
};

type IntakeMode = "describe" | "paste";

export function SourceTray({
  canReviewMatches,
  capabilityState,
  artifactState,
  cardLabStyle,
  cardStyle,
  enrichmentMode,
  error,
  fileImportError,
  fileImportSummary,
  fontOptions,
  generationJob,
  isGenerating,
  isDraftingPrompt,
  isImporting,
  itemCount,
  identityNotice,
  lastJobId,
  onApplyMatchOverrides,
  onCancelPolling,
  onDraftFromPrompt,
  onGeneratePack,
  onImportFile,
  onResumePolling,
  onSetEnrichmentMode,
  onSetPromptText,
  onSetShowMatches,
  onSetText,
  onSelectPreset,
  onUpdateCardStyle,
  onUpdateMatchOverride,
  pack,
  pollingState,
  preset,
  presets,
  promptDraft,
  promptError,
  promptText,
  showMatches,
  text,
  title,
  tmdbAvailable,
  matchOverrides,
  workspacePhase,
}: {
  canReviewMatches: boolean;
  capabilityState: CapabilityState;
  artifactState: ArtifactState;
  cardLabStyle: CSSProperties;
  cardStyle: CardStyle;
  enrichmentMode: string;
  error: string | null;
  fileImportError: string | null;
  fileImportSummary: string | null;
  fontOptions: FontOption[];
  generationJob: GenerationJob | null;
  isGenerating: boolean;
  isDraftingPrompt: boolean;
  isImporting: boolean;
  itemCount: number;
  identityNotice: string | null;
  lastJobId: string | null;
  matchOverrides: MatchOverrides;
  onApplyMatchOverrides: () => void;
  onCancelPolling: () => void;
  onDraftFromPrompt: () => void;
  onGeneratePack: () => void;
  onImportFile: (file: File) => void;
  onResumePolling: () => void;
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
  pack: PersistedPackSnapshot | null;
  pollingState: PollingState;
  preset: string;
  presets: string[];
  promptDraft: PromptDraftResponse | null;
  promptError: string | null;
  promptText: string;
  showMatches: boolean;
  text: string;
  title: string;
  tmdbAvailable: boolean;
  workspacePhase: WorkspacePhase;
}) {
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("describe");
  const boardFirst =
    pack !== null ||
    workspacePhase === "lost" ||
    workspacePhase === "expired";
  const canControlSavedJob = canControlSavedGeneration({
    artifactState,
    hasGenerationJob: generationJob !== null,
    hasLastJobId: lastJobId !== null,
    isGenerating,
    pollingState,
  });

  const intake = (
    <div className="pack-composer">
      <div className="intake-tabs" role="tablist" aria-label="Choose input type">
        <button
          aria-controls="describe-panel"
          aria-selected={intakeMode === "describe"}
          className={intakeMode === "describe" ? "active" : ""}
          id="describe-tab"
          onClick={() => setIntakeMode("describe")}
          role="tab"
          type="button"
        >
          Describe
        </button>
        <button
          aria-controls="paste-panel"
          aria-selected={intakeMode === "paste"}
          className={intakeMode === "paste" ? "active" : ""}
          id="paste-tab"
          onClick={() => setIntakeMode("paste")}
          role="tab"
          type="button"
        >
          Paste list
        </button>
      </div>

      {intakeMode === "describe" ? (
        <div
          aria-labelledby="describe-tab"
          className="intake-panel describe-panel"
          id="describe-panel"
          role="tabpanel"
        >
          <label htmlFor="prompt-input">What do you want to rank?</label>
          <div className="prompt-draft-row">
            <input
              id="prompt-input"
              aria-label="Prompt to tier list"
              className="prompt-draft-input"
              value={promptText}
              onChange={(event) => onSetPromptText(event.target.value)}
              placeholder="Best PS2 survival horror games for one spooky night"
              disabled={isGenerating || isImporting}
            />
            <button
              type="button"
              className="secondary-action"
              onClick={onDraftFromPrompt}
              disabled={
                isDraftingPrompt ||
                isGenerating ||
                isImporting ||
                !promptText.trim()
              }
            >
              {isDraftingPrompt ? "Drafting..." : "Draft list"}
            </button>
          </div>
          <p className="prompt-draft-status">
            {promptDraft
              ? `Drafted ${promptDraft.items.length} items via ${formatToolName(promptDraft.suggested_enrichment_mode)}${promptDraft.cache_hit ? " from cache" : ""}. ${promptDraft.warnings[0]?.message ?? "Review the list, then create the pack."}`
              : "Tierzo drafts a title and editable list before generation."}
          </p>
          {promptError ? <p className="error">{promptError}</p> : null}
        </div>
      ) : (
        <div
          aria-labelledby="paste-tab"
          className="intake-panel paste-panel"
          id="paste-panel"
          role="tabpanel"
        >
          <div className="file-import-row">
            <div>
              <strong>Import a list file</strong>
              <span>TXT, CSV, or XLSX · replaces the current list</span>
            </div>
            <label
              aria-disabled={isGenerating || isDraftingPrompt}
              className="file-import-action"
            >
              {isImporting ? "Choose another" : "Choose file"}
              <input
                accept=".txt,.csv,.xlsx"
                aria-label="Import TXT, CSV, or XLSX list"
                disabled={isGenerating || isDraftingPrompt}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) {
                    onImportFile(file);
                  }
                }}
                type="file"
              />
            </label>
          </div>
          <div className="source-copy">
            <label htmlFor="items">One item per line</label>
            <strong>{itemCount} items</strong>
          </div>
          <textarea
            id="items"
            value={text}
            onChange={(event) => onSetText(event.target.value)}
            disabled={isGenerating || isImporting}
            placeholder={"Silent Hill 2\nResident Evil 4\nFatal Frame"}
            spellCheck={false}
          />
        </div>
      )}

      <div className="composer-footer">
        <span>
          {itemCount > 0
            ? `${itemCount} item${itemCount === 1 ? "" : "s"} ready`
            : "Add items to create a pack"}
        </span>
        <button
          className="primary-create-action"
          type="button"
          onClick={onGeneratePack}
          disabled={
            isGenerating || isDraftingPrompt || isImporting || itemCount === 0
          }
        >
          {isImporting
            ? "Importing list..."
            : isGenerating
            ? "Generating..."
            : pack
              ? "Regenerate pack"
              : "Create pack"}
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={`source-tray source-tray-${workspacePhase} ${
        boardFirst ? "source-tray-board-first" : ""
      }`}
    >
      <div className="source-tray-heading">
        <div>
          <span>{boardFirst ? "Pack workspace" : "Start here"}</span>
          <h1>
            {boardFirst
              ? title.trim() || pack?.title || "Untitled tier pack"
              : "Build your tier pack"}
          </h1>
          <p>
            {boardFirst
              ? `${itemCount} items · ${formatToolName(enrichmentMode)}`
              : "Describe what you want, paste items, or import a list file."}
          </p>
        </div>
        {boardFirst ? (
          <details className="source-editor-disclosure">
            <summary>Edit source</summary>
            {intake}
          </details>
        ) : null}
      </div>

      {!boardFirst ? intake : null}

        <details
          className="generation-options"
          key={boardFirst ? "board-first-options" : "intake-options"}
        >
        <summary>
          <span>Style & generation options</span>
          <small>
            {preset} · {formatToolName(enrichmentMode)}
          </small>
        </summary>
        <div className="generation-options-body">
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
              <option value="tmdb_movie" disabled={!tmdbAvailable}>
                Movie posters{tmdbAvailable ? "" : " — unavailable"}
              </option>
            </select>
            <small>
              {capabilityState === "loading"
                ? "Checking external generation capabilities..."
                : capabilityState === "unavailable"
                  ? "External providers could not be verified. Auto and text cards remain available."
                  : tmdbAvailable
                    ? "Pick automatic sourcing or force a specific asset mode."
                    : "Movie posters requires TMDb configuration. Auto and text cards remain available."}
            </small>
          </label>
          <CardLabPanel
            cardLabStyle={cardLabStyle}
            cardStyle={cardStyle}
            fontOptions={fontOptions}
            onUpdateStyle={onUpdateCardStyle}
          />
        </div>
      </details>

      <div className="workspace-feedback" aria-live="polite">
        {fileImportError ? <p className="error">{fileImportError}</p> : null}
        {fileImportSummary ? (
          <p className="enrichment-status">
            {fileImportSummary}
            {pack
              ? " Regenerate to update the board and temporary artifacts."
              : " Review the editable list, then create the pack."}
          </p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {identityNotice ? (
          <p className="enrichment-status">{identityNotice}</p>
        ) : null}
        {canControlSavedJob ? (
          <div className="agent-run">
            <div className="agent-run-head">
              <div>
                <strong>Saved generation</strong>
                <span>
                  {pollingState === "polling"
                    ? "Checking current status"
                    : `Job ${lastJobId?.slice(0, 8) ?? ""}`}
                </span>
              </div>
            </div>
            <button
              className="secondary-action"
              type="button"
              onClick={
                pollingState === "polling"
                  ? onCancelPolling
                  : onResumePolling
              }
            >
              {pollingState === "polling"
                ? "Cancel polling"
                : "Resume saved job"}
            </button>
          </div>
        ) : null}
        {generationJob &&
        (generationJob.status !== "completed" ||
          pollingState === "cancelled" ||
          pollingState === "timed_out") ? (
          <AgentRunPanel
            job={generationJob}
            onCancelPolling={onCancelPolling}
            onResumePolling={onResumePolling}
            pollingState={pollingState}
          />
        ) : null}
        {formatPollingState(pollingState) ? (
          <p className="enrichment-status">
            {formatPollingState(pollingState)}
          </p>
        ) : null}
        {formatArtifactState(artifactState) ? (
          <p className="enrichment-status">
            {formatArtifactState(artifactState)}
          </p>
        ) : null}
        {pack ? (
          <p className="enrichment-status">
            {formatGenerationStatus(pack)}
          </p>
        ) : null}
        {pack?.warnings.map((warning) => (
          <p className="enrichment-status" key={warning.code}>
            {warning.message}
          </p>
        ))}
        {pack?.agent_plan ? (
          <p className="enrichment-status">
            Tierzo read this as {pack.agent_plan.domain} and chose{" "}
            {formatToolName(pack.agent_plan.tool)}
            {pack.agent_plan.cache_hit ? " from cache" : ""}
          </p>
        ) : null}
      </div>

      {boardFirst ? (
        <div className="pack-secondary-actions">
          {pack && canReviewMatches ? (
            <button
              className="secondary-action"
              type="button"
              onClick={() => onSetShowMatches((current) => !current)}
            >
              {showMatches ? "Hide matches" : "Review matches"}
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
        </div>
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
  );
}

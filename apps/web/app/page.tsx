"use client";

import type { CSSProperties } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { EmptyBoardCue } from "../components/empty-board-cue";
import { SourceTray } from "../components/source-tray";
import { TierBoard } from "../components/tier-board";
import { WorkspaceProgress } from "../components/workspace-progress";
import { useCapabilities } from "../hooks/use-capabilities";
import { useFileIntake } from "../hooks/use-file-intake";
import { usePackGeneration } from "../hooks/use-pack-generation";
import { useTierBoard } from "../hooks/use-tier-board";
import { apiUrl } from "../lib/api";
import {
  BASE_CARD_STYLE,
  DEFAULT_TIERS,
  FONT_OPTIONS,
  FONT_STACKS,
  LEGACY_FONT_KEYS,
  MAX_TIERS,
  PRESETS,
  PRESET_STYLES,
  SAMPLE_LIST,
} from "../lib/constants";
import { renderBoardPng, slugify } from "../lib/export-board-png";
import { reconcileBoard } from "../lib/board-reconciliation";
import {
  parseSourceText,
  reconcileSourceItems,
  sourceItemsToText,
} from "../lib/source-items";
import { hexToRgba, textDecoration } from "../lib/style-utils";
import type {
  CardStyle,
  MatchOverrides,
  PromptDraftResponse,
  SavedWorkspaceState,
  SourceItem,
} from "../lib/types";
import {
  LEGACY_WORKSPACE_STORAGE_KEY,
  migrateWorkspaceState,
  WORKSPACE_STORAGE_KEY,
} from "../lib/workspace-migration";
import { deriveWorkspacePhase } from "../lib/workspace-view";

function resolveSavedCardStyle(
  savedStyle?: (CardStyle & { fontFamily?: string }) | null,
) {
  if (!savedStyle) {
    return PRESET_STYLES.arcade;
  }

  const savedFontKey =
    savedStyle.fontKey ??
    (savedStyle.fontFamily
      ? LEGACY_FONT_KEYS[savedStyle.fontFamily]
      : undefined) ??
    "default";

  return {
    ...BASE_CARD_STYLE,
    background: savedStyle.background,
    textColor: savedStyle.textColor,
    accentColor: savedStyle.accentColor,
    fontKey: savedFontKey,
    bold: savedStyle.bold ?? true,
    italic: savedStyle.italic ?? false,
    underline: savedStyle.underline ?? false,
    strike: savedStyle.strike ?? false,
    textShadow: savedStyle.textShadow ?? false,
    backgroundOpacity: savedStyle.backgroundOpacity ?? 100,
    borderWidth: savedStyle.borderWidth ?? 4,
    cornerRadius: savedStyle.cornerRadius ?? 8,
    glowBlur: savedStyle.glowBlur ?? 0,
    imageLabelPosition: savedStyle.imageLabelPosition ?? "none",
  };
}

function loadSavedWorkspaceState() {
  if (typeof window === "undefined") {
    return migrateWorkspaceState(null).state;
  }

  for (const key of [WORKSPACE_STORAGE_KEY, LEGACY_WORKSPACE_STORAGE_KEY]) {
    const saved = window.localStorage.getItem(key);
    if (!saved) {
      continue;
    }
    try {
      return migrateWorkspaceState(JSON.parse(saved)).state;
    } catch {
      continue;
    }
  }
  return migrateWorkspaceState(null).state;
}

export default function Home() {
  const savedState = useMemo(() => loadSavedWorkspaceState(), []);
  const initialText = savedState.text || SAMPLE_LIST;
  const [sourceItems, setSourceItems] = useState<SourceItem[]>(
    () =>
      savedState.sourceItems.length > 0
        ? savedState.sourceItems
        : reconcileSourceItems([], parseSourceText(initialText)).items,
  );
  const [text, setText] = useState(() => initialText);
  const [title, setTitle] = useState(() => savedState.title);
  const [description, setDescription] = useState(() => savedState.description);
  const [preset, setPreset] = useState(() => savedState.preset);
  const [enrichmentMode, setEnrichmentMode] = useState(
    () => savedState.enrichmentMode,
  );
  const [identityNotice, setIdentityNotice] = useState<string | null>(
    savedState.migrationWarnings[0] ?? null,
  );
  const [promptText, setPromptText] = useState("");
  const [promptDraft, setPromptDraft] = useState<PromptDraftResponse | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [isDraftingPrompt, setIsDraftingPrompt] = useState(false);
  const [cardStyle, setCardStyle] = useState<CardStyle>(() =>
    resolveSavedCardStyle(savedState.cardStyle),
  );
  const [isExporting, setIsExporting] = useState(false);
  const {
    error: fileImportError,
    importFile,
    isImporting,
    summary: fileImportSummary,
  } = useFileIntake();
  const deferredText = useDeferredValue(text);
  const {
    capabilities,
    state: capabilityState,
  } = useCapabilities();
  const tmdbAvailable =
    capabilityState === "ready" &&
    capabilities.capabilities.tmdb_movie.available;
  const resolvedEnrichmentMode =
    enrichmentMode === "tmdb_movie" && !tmdbAvailable
      ? "text"
      : enrichmentMode;
  const {
    artifactState,
    cancelPolling,
    error,
    generatePack,
    generationJob,
    isGenerating,
    lastJobId,
    matchOverrides,
    pack,
    pollingState,
    resumePolling,
    setError,
    setPack,
    setShowMatches,
    showMatches,
    retainMatchOverrides,
    updateMatchOverride,
  } = usePackGeneration({
    buildPayload: buildGeneratePayload,
    initialPack: savedState.pack,
    initialLastJobId: savedState.lastJobId,
    shouldShowMatchesOnGenerate: (generatedPack) =>
      generatedPack.items.some((item) => item.asset_kind !== "text-card"),
  });
  const availablePack = artifactState === "completed" ? pack : null;
  const canReviewMatches =
    availablePack?.items.some((item) => item.asset_kind !== "text-card") ??
    false;
  const {
    benchItems,
    board,
    closeRowMenu,
    dragOverItemId,
    dragOverTierId,
    draggedItemId,
    draggedTierId,
    insertTier,
    moveDraggedTier,
    moveItemToBench,
    moveItemToTier,
    openRowMenu,
    resolvedBoard,
    rowMenu,
    selectedTierId,
    setBoard,
    setDragOverItemId,
    setDragOverTierId,
    setDraggedItemId,
    setDraggedTierId,
    setSelectedTierId,
    tiers,
    updateTierLabel,
    deleteSelectedTier,
  } = useTierBoard({
    initialBoard: savedState.board,
    initialSelectedTierId: savedState.tiers[0]?.id,
    initialTiers:
      savedState.tiers.slice(0, MAX_TIERS).filter(Boolean).length > 0
        ? savedState.tiers.slice(0, MAX_TIERS).filter(Boolean)
        : DEFAULT_TIERS,
    maxTiers: MAX_TIERS,
    packItems: pack?.items ?? [],
    sourceItemIds: sourceItems.map((item) => item.id),
  });

  useEffect(() => {
    const nextState: SavedWorkspaceState = {
      version: 3,
      sourceItems,
      text,
      title,
      description,
      preset,
      cardStyle,
      enrichmentMode,
      tiers,
      board,
      pack,
      lastJobId,
      migrationWarnings: identityNotice ? [identityNotice] : [],
    };
    window.localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify(nextState),
    );
  }, [
    board,
    cardStyle,
    description,
    enrichmentMode,
    identityNotice,
    lastJobId,
    pack,
    preset,
    sourceItems,
    text,
    tiers,
    title,
  ]);

  useEffect(() => {
    if (!canReviewMatches) {
      setShowMatches(false);
    }
  }, [canReviewMatches, setShowMatches]);

  const itemCount = useMemo(
    () =>
      deferredText
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean).length,
    [deferredText],
  );
  const workspacePhase = deriveWorkspacePhase({
    artifactState,
    hasError: Boolean(error || promptError),
    hasPack: availablePack !== null,
    isGenerating,
    itemCount,
  });
  const boardFirst =
    availablePack !== null ||
    artifactState === "lost" ||
    artifactState === "expired";

  function buildGeneratePayload(overrides: MatchOverrides = {}) {
    return {
      items: sourceItems,
      preset,
      size: 512,
      filename_mode: "both",
      title: title.trim() || "Tierzo Pack",
      description: description.trim() || null,
      row_labels: tiers.map((tier) => tier.label.trim() || "-"),
      enrichment_mode: resolvedEnrichmentMode,
      item_asset_overrides: overrides,
      custom_preset: {
        background: cardStyle.background,
        text_color: cardStyle.textColor,
        accent_color: cardStyle.accentColor,
        font_family: cardStyle.fontKey,
        bold: cardStyle.bold,
        italic: cardStyle.italic,
        underline: cardStyle.underline,
        strike: cardStyle.strike,
        text_shadow: cardStyle.textShadow,
        background_opacity: cardStyle.backgroundOpacity / 100,
        border_width: cardStyle.borderWidth,
        corner_radius: cardStyle.cornerRadius,
        glow_blur: cardStyle.glowBlur,
        image_label_position: cardStyle.imageLabelPosition,
      },
    };
  }

  async function handleGeneratePack(overrides: MatchOverrides = {}) {
    if (isImporting) {
      return;
    }
    const nextPack = await generatePack(overrides);
    if (!nextPack) {
      return;
    }

    setBoard((current) =>
      reconcileBoard(
        current,
        nextPack.items.map((item) => item.id),
      ).board,
    );
  }

  function updateSourceText(nextText: string) {
    const reconciliation = reconcileSourceItems(
      sourceItems,
      parseSourceText(nextText),
    );
    setText(nextText);
    setSourceItems(reconciliation.items);
    retainMatchOverrides(reconciliation.items.map((item) => item.id));
    const boardResult = reconcileBoard(
      board,
      reconciliation.items.map((item) => item.id),
    );
    setBoard(boardResult.board);

    if (reconciliation.ambiguousReplacementCount > 0) {
      setIdentityNotice(
        "Some simultaneous line replacements were ambiguous, so Tierzo assigned new item identities.",
      );
    } else if (reconciliation.renames.length > 0) {
      const rename = reconciliation.renames[0];
      setIdentityNotice(
        `Treated “${rename.from}” → “${rename.to}” as a rename and preserved its ranking.`,
      );
    } else if (boardResult.removedRankedIds.length > 0) {
      setIdentityNotice(
        `${boardResult.removedRankedIds.length} ranked item${
          boardResult.removedRankedIds.length === 1 ? " was" : "s were"
        } removed from the source list.`,
      );
    } else {
      setIdentityNotice(null);
    }
  }

  function applyMatchOverrides() {
    void handleGeneratePack(matchOverrides);
  }

  async function handleDraftFromPrompt() {
    const nextPrompt = promptText.trim();
    if (!nextPrompt || isImporting) {
      return;
    }

    setPromptError(null);
    setError(null);
    setIsDraftingPrompt(true);

    try {
      const response = await fetch(apiUrl("/prompt-drafts"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: nextPrompt }),
      });

      const body = (await response.json()) as
        | PromptDraftResponse
        | { detail?: string | { message?: string } };

      if (!response.ok) {
        const detail =
          typeof body === "object" && body && "detail" in body
            ? body.detail
            : null;
        throw new Error(
          typeof detail === "string"
            ? detail
            : detail &&
                typeof detail === "object" &&
                typeof detail.message === "string"
              ? detail.message
              : "Tierzo could not draft a tier list from that prompt.",
        );
      }

      const rawDraft = body as PromptDraftResponse;
      const draft: PromptDraftResponse = {
        ...rawDraft,
        outcome: rawDraft.outcome ?? "normal",
        warnings: Array.isArray(rawDraft.warnings) ? rawDraft.warnings : [],
      };
      setPromptDraft(draft);
      setTitle(draft.title);
      setDescription(draft.description ?? "");
      const draftedItems = reconcileSourceItems([], draft.items).items;
      setSourceItems(draftedItems);
      setText(sourceItemsToText(draftedItems));
      setEnrichmentMode(draft.suggested_enrichment_mode);
      setBoard({});
      setPack(null);
      retainMatchOverrides([]);
      setIdentityNotice(null);
      setShowMatches(false);
    } catch (caught) {
      setPromptError(
        caught instanceof Error
          ? caught.message
          : "Tierzo could not draft a tier list from that prompt.",
      );
    } finally {
      setIsDraftingPrompt(false);
    }
  }

  async function handleImportFile(file: File) {
    const intake = await importFile(file);
    if (!intake) {
      return;
    }
    updateSourceText(intake.items.join("\n"));
  }

  function selectPreset(nextPreset: string) {
    setPreset(nextPreset);
    setCardStyle(PRESET_STYLES[nextPreset] ?? PRESET_STYLES.arcade);
  }

  function updateCardStyle(nextStyle: Partial<CardStyle>) {
    setCardStyle((current) => ({ ...current, ...nextStyle }));
  }

  const cardLabStyle = {
    "--card-bg": hexToRgba(
      cardStyle.background,
      cardStyle.backgroundOpacity / 100,
    ),
    "--card-text": cardStyle.textColor,
    "--card-accent": cardStyle.accentColor,
    "--card-font": FONT_STACKS[cardStyle.fontKey],
    "--card-border-width": `${cardStyle.borderWidth}px`,
    "--card-radius": `${cardStyle.cornerRadius}px`,
    "--card-glow":
      cardStyle.glowBlur > 0
        ? `0 0 ${cardStyle.glowBlur}px ${cardStyle.accentColor}`
        : "none",
    "--card-text-shadow": cardStyle.textShadow
      ? "0 2px 0 rgba(0, 0, 0, 0.45)"
      : "none",
    "--card-font-style": cardStyle.italic ? "italic" : "normal",
    "--card-font-weight": cardStyle.bold ? "900" : "500",
    "--card-decoration": textDecoration(cardStyle),
  } as CSSProperties;

  async function exportBoardPng() {
    if (!availablePack) {
      return;
    }

    setError(null);
    setIsExporting(true);
    try {
      const dataUrl = await renderBoardPng({
        title: title.trim() || availablePack.title,
        tiers,
        board: resolvedBoard,
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${slugify(title || availablePack.title)}-tierzo-board.png`;
      link.click();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not export this board.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <main className="tm-page" onClick={closeRowMenu}>
      <nav className="topbar" aria-label="Tierzo workspace navigation">
        <div className="pixel-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <a
          className="community-link"
          href="https://tiermaker.com/categories/create/"
          rel="noreferrer"
          target="_blank"
        >
          Open TierMaker
        </a>
      </nav>

      <header className="title-block">
        <p className="title-label">Title</p>
        <input
          aria-label="Tier list title"
          className="title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Enter a tier list title"
        />
        <p className="title-label">Description</p>
        <input
          aria-label="Tier list description"
          className="description-input"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Add an optional description"
        />
      </header>

      <section
        className={`maker-panel maker-panel-${workspacePhase}`}
        aria-label="Tierzo editor"
      >
        <SourceTray
          artifactState={artifactState}
          canReviewMatches={canReviewMatches}
          capabilityState={capabilityState}
          cardLabStyle={cardLabStyle}
          cardStyle={cardStyle}
          enrichmentMode={resolvedEnrichmentMode}
          error={error}
          fileImportError={fileImportError}
          fileImportSummary={fileImportSummary}
          fontOptions={FONT_OPTIONS}
          generationJob={generationJob}
          isGenerating={isGenerating}
          isDraftingPrompt={isDraftingPrompt}
          isImporting={isImporting}
          itemCount={itemCount}
          identityNotice={identityNotice}
          lastJobId={lastJobId}
          matchOverrides={matchOverrides}
          onApplyMatchOverrides={applyMatchOverrides}
          onCancelPolling={cancelPolling}
          onDraftFromPrompt={() => void handleDraftFromPrompt()}
          onGeneratePack={() => void handleGeneratePack()}
          onImportFile={(file) => void handleImportFile(file)}
          onResumePolling={resumePolling}
          onSelectPreset={selectPreset}
          onSetEnrichmentMode={setEnrichmentMode}
          onSetPromptText={(nextPrompt) => {
            if (promptError) {
              setPromptError(null);
            }
            setPromptText(nextPrompt);
          }}
          onSetShowMatches={setShowMatches}
          onSetText={updateSourceText}
          onUpdateCardStyle={updateCardStyle}
          onUpdateMatchOverride={updateMatchOverride}
          pack={availablePack}
          pollingState={pollingState}
          preset={preset}
          presets={PRESETS}
          promptDraft={promptDraft}
          promptError={promptError}
          promptText={promptText}
          showMatches={showMatches}
          text={text}
          title={title}
          tmdbAvailable={tmdbAvailable}
          workspacePhase={workspacePhase}
        />

        <WorkspaceProgress phase={workspacePhase} />

        {boardFirst ? (
          <>
            <div className="preview-head">
              <div className="source-list-panel">
                <h2>{title.trim() || "Untitled list"}</h2>
              </div>
              <div className="preview-actions">
                <button
                  className="download"
                  type="button"
                  onClick={exportBoardPng}
                  disabled={!availablePack || isExporting}
                >
                  {isExporting ? "Exporting..." : "Export PNG"}
                </button>
                {availablePack ? (
                  <a
                    className="download"
                    href={apiUrl(availablePack.zip_url)}
                  >
                    Download ZIP
                  </a>
                ) : null}
              </div>
            </div>
            <TierBoard
              benchItems={benchItems}
              board={resolvedBoard}
              deleteSelectedTier={deleteSelectedTier}
              dragOverItemId={dragOverItemId}
              dragOverTierId={dragOverTierId}
              draggedItemId={draggedItemId}
              draggedTierId={draggedTierId}
              insertTier={insertTier}
              maxTiers={MAX_TIERS}
              moveDraggedTier={moveDraggedTier}
              moveItemToBench={moveItemToBench}
              moveItemToTier={moveItemToTier}
              onOpenRowMenu={openRowMenu}
              onSelectTier={setSelectedTierId}
              onSetDragOverItemId={setDragOverItemId}
              onSetDragOverTierId={setDragOverTierId}
              onSetDraggedItemId={setDraggedItemId}
              onSetDraggedTierId={setDraggedTierId}
              onUpdateTierLabel={updateTierLabel}
              rowMenu={rowMenu}
              selectedTierId={selectedTierId}
              tiers={tiers}
            />
          </>
        ) : (
          <EmptyBoardCue tiers={tiers} />
        )}
      </section>
    </main>
  );
}

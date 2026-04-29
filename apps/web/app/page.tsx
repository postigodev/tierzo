"use client";

import type { CSSProperties } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { SourceTray } from "../components/source-tray";
import { Card } from "../components/tier-card";
import { usePackGeneration } from "../hooks/use-pack-generation";
import { useTierBoard } from "../hooks/use-tier-board";
import { apiUrl } from "../lib/api";
import {
  BASE_CARD_STYLE,
  BOARD_STORAGE_KEY,
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
import { hexToRgba, textDecoration } from "../lib/style-utils";
import type {
  CardStyle,
  MatchOverrides,
  SavedDemoState,
} from "../lib/types";

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

function loadSavedDemoState() {
  if (typeof window === "undefined") {
    return null;
  }

  const saved = window.localStorage.getItem(BOARD_STORAGE_KEY);
  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved) as SavedDemoState;
  } catch {
    window.localStorage.removeItem(BOARD_STORAGE_KEY);
    return null;
  }
}

export default function Home() {
  const savedState = useMemo(() => loadSavedDemoState(), []);
  const [text, setText] = useState(() => savedState?.text ?? SAMPLE_LIST);
  const [title, setTitle] = useState(
    () => savedState?.title ?? "PS2 Survival Horror Demo",
  );
  const [description, setDescription] = useState(
    () => savedState?.description ?? "",
  );
  const [preset, setPreset] = useState(() => savedState?.preset ?? "arcade");
  const [enrichmentMode, setEnrichmentMode] = useState(
    () => savedState?.enrichmentMode ?? "auto",
  );
  const [cardStyle, setCardStyle] = useState<CardStyle>(() =>
    resolveSavedCardStyle(savedState?.cardStyle),
  );
  const [isExporting, setIsExporting] = useState(false);
  const deferredText = useDeferredValue(text);
  const {
    error,
    generatePack,
    generationJob,
    isGenerating,
    matchOverrides,
    pack,
    setError,
    setShowMatches,
    showMatches,
    updateMatchOverride,
  } = usePackGeneration({
    buildPayload: buildGeneratePayload,
    initialPack: savedState?.pack ?? null,
  });
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
    rowMenu,
    selectedTierId,
    selectedTierIndex,
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
    initialBoard: savedState?.board,
    initialSelectedTierId: savedState?.tiers?.[0]?.id,
    initialTiers:
      savedState?.tiers?.slice(0, MAX_TIERS).filter(Boolean) || DEFAULT_TIERS,
    maxTiers: MAX_TIERS,
    packItems: pack?.items ?? [],
  });

  useEffect(() => {
    const nextState: SavedDemoState = {
      text,
      title,
      description,
      preset,
      cardStyle,
      enrichmentMode,
      tiers,
      board,
      pack,
    };
    window.localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(nextState));
  }, [
    board,
    cardStyle,
    description,
    enrichmentMode,
    pack,
    preset,
    text,
    tiers,
    title,
  ]);

  const itemCount = useMemo(
    () =>
      deferredText
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean).length,
    [deferredText],
  );

  function buildGeneratePayload(overrides: MatchOverrides = {}) {
    return {
      text,
      preset,
      size: 512,
      filename_mode: "both",
      title: title.trim() || "Untitled Tierzo Pack",
      description: description.trim() || null,
      row_labels: tiers.map((tier) => tier.label.trim() || "-"),
      enrichment_mode: enrichmentMode,
      asset_overrides: overrides,
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
    const nextPack = await generatePack(overrides);
    if (!nextPack) {
      return;
    }

    setBoard({
      [tiers[0]?.id ?? "tier-s"]: nextPack.items.slice(0, 2),
      [tiers[1]?.id ?? "tier-a"]: nextPack.items.slice(2, 4),
      [tiers[2]?.id ?? "tier-b"]: nextPack.items.slice(4, 6),
    });
  }

  function applyMatchOverrides() {
    void handleGeneratePack(matchOverrides);
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
    if (!pack) {
      return;
    }

    setError(null);
    setIsExporting(true);
    try {
      const dataUrl = await renderBoardPng({
        title: title.trim() || pack.title,
        tiers,
        board,
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${slugify(title || pack.title)}-tierzo-board.png`;
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
      <nav className="topbar" aria-label="Tierzo demo navigation">
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
          href="https://tiermaker.com/"
          rel="noreferrer"
          target="_blank"
        >
          Explore Community Tier Lists
        </a>
      </nav>

      <header className="title-block">
        <input
          aria-label="Tier list title"
          className="title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Name your tier list..."
        />
        <input
          aria-label="Tier list description"
          className="description-input"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Add a description or bio..."
        />
      </header>

      <section className="maker-panel" aria-label="Tierzo tier list demo">
        <div className="preview-head">
          <div className="source-list-panel">
            <h2>{title} preview</h2>
          </div>
          <div className="preview-actions">
            <button
              className="download"
              type="button"
              onClick={exportBoardPng}
              disabled={!pack || isExporting}
            >
              {isExporting ? "Exporting..." : "Export PNG"}
            </button>
            {pack ? (
              <a className="download" href={apiUrl(pack.zip_url)}>
                Download ZIP
              </a>
            ) : null}
          </div>
        </div>

        <div className="board">
          {tiers.map((tier, index) => (
            <div
              className={`tier-row ${selectedTierId === tier.id ? "selected" : ""} ${draggedTierId === tier.id ? "dragging" : ""}`}
              key={tier.id}
              onClick={() => setSelectedTierId(tier.id)}
              onContextMenu={(event) => openRowMenu(event, tier.id)}
              onDragEnter={() => setDragOverTierId(tier.id)}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverTierId(tier.id);
              }}
              onDragLeave={() =>
                setDragOverTierId((current) =>
                  current === tier.id ? null : current,
                )
              }
              onDrop={(event) => {
                event.preventDefault();
                if (draggedItemId) {
                  moveItemToTier(draggedItemId, tier.id);
                  return;
                }
                moveDraggedTier(tier.id);
              }}
              data-drag-over={dragOverTierId === tier.id ? "true" : undefined}
            >
              <div className="tier-label-cell">
                <button
                  aria-label={`Drag tier ${index + 1}`}
                  className="row-grip"
                  draggable
                  type="button"
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", tier.id);
                    setSelectedTierId(tier.id);
                    setDraggedTierId(tier.id);
                  }}
                  onDragEnd={() => {
                    setDraggedTierId(null);
                    setDragOverTierId(null);
                  }}
                />
                <div
                  aria-label={`Tier ${index + 1} label`}
                  className="tier-label"
                  contentEditable
                  role="textbox"
                  spellCheck={false}
                  suppressContentEditableWarning
                  onFocus={() => setSelectedTierId(tier.id)}
                  onInput={(event) => {
                    updateTierLabel(
                      tier.id,
                      event.currentTarget.textContent ?? "",
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                    }
                  }}
                >
                  {tier.label}
                </div>
              </div>
              <div className="tier-items">
                {(board[tier.id] ?? []).map((item) => (
                  <Card
                    dragOver={dragOverItemId === item.id}
                    item={item}
                    key={item.id}
                    onDragEnd={() => {
                      setDraggedItemId(null);
                      setDragOverItemId(null);
                    }}
                    onDragStart={() => setDraggedItemId(item.id)}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (draggedItemId) {
                        moveItemToTier(draggedItemId, tier.id, item.id);
                      }
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDragOverItemId(item.id);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="toolbar" aria-label="Tierzo actions">
          <strong className="row-count">
            {tiers.length}/{MAX_TIERS}
          </strong>
        </div>

        <div className="bench">
          <div
            className="bench-items"
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedItemId) {
                moveItemToBench(draggedItemId);
              }
            }}
          >
            {benchItems.length > 0 ? (
              benchItems.map((item) => (
                <Card
                  dragOver={dragOverItemId === item.id}
                  item={item}
                  key={item.id}
                  onDragEnd={() => {
                    setDraggedItemId(null);
                    setDragOverItemId(null);
                  }}
                  onDragStart={() => setDraggedItemId(item.id)}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (draggedItemId) {
                      moveItemToBench(draggedItemId);
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDragOverItemId(item.id);
                  }}
                />
              ))
            ) : (
              <span>Generated cards will land here.</span>
            )}
          </div>
        </div>

        <SourceTray
          cardLabStyle={cardLabStyle}
          cardStyle={cardStyle}
          enrichmentMode={enrichmentMode}
          error={error}
          fontOptions={FONT_OPTIONS}
          generationJob={generationJob}
          isGenerating={isGenerating}
          itemCount={itemCount}
          matchOverrides={matchOverrides}
          onApplyMatchOverrides={applyMatchOverrides}
          onGeneratePack={() => void handleGeneratePack()}
          onSelectPreset={selectPreset}
          onSetEnrichmentMode={setEnrichmentMode}
          onSetShowMatches={setShowMatches}
          onSetText={setText}
          onUpdateCardStyle={updateCardStyle}
          onUpdateMatchOverride={updateMatchOverride}
          pack={pack}
          preset={preset}
          presets={PRESETS}
          showMatches={showMatches}
          text={text}
        />

        {rowMenu ? (
          <div
            className="row-menu"
            style={{ left: rowMenu.x, top: rowMenu.y }}
            onClick={(event) => event.stopPropagation()}
            role="menu"
          >
            <button
              role="menuitem"
              type="button"
              onClick={() => insertTier(0)}
              disabled={tiers.length >= MAX_TIERS}
            >
              Add row above
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={() => insertTier(1)}
              disabled={tiers.length >= MAX_TIERS}
            >
              Add row below
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={deleteSelectedTier}
              disabled={tiers.length <= 1}
            >
              Delete row
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

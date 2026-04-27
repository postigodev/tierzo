"use client";

import Image from "next/image";
import type { CSSProperties, DragEvent, MouseEvent } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

type PackItem = {
  id: string;
  name: string;
  filename: string;
  image_url: string;
};

type PackResponse = {
  pack_id: string;
  title: string;
  description: string | null;
  row_labels: string[];
  item_count: number;
  items: PackItem[];
  manifest_url: string;
  zip_url: string;
  extension_url: string;
  enrichment_status: string;
  agent_plan: {
    domain: string;
    tool: string;
    confidence: number;
    source: string;
    cache_hit: boolean;
  } | null;
};

const API_BASE =
  process.env.NEXT_PUBLIC_TIERZO_API_URL ?? "http://localhost:8000";

const SAMPLE_LIST = `Silent Hill 2
Resident Evil 4
Fatal Frame II
Rule of Rose
Kuon
Siren
Haunting Ground
Clock Tower 3`;

type CardStyle = {
  background: string;
  textColor: string;
  accentColor: string;
  fontKey: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  textShadow: boolean;
  backgroundOpacity: number;
  borderWidth: number;
  cornerRadius: number;
  glowBlur: number;
};

const BASE_CARD_STYLE = {
  bold: true,
  italic: false,
  underline: false,
  strike: false,
  textShadow: false,
  backgroundOpacity: 100,
  borderWidth: 4,
  cornerRadius: 8,
  glowBlur: 0,
};
const PRESET_STYLES: Record<string, CardStyle> = {
  arcade: {
    ...BASE_CARD_STYLE,
    background: "#101820",
    textColor: "#FEE715",
    accentColor: "#FEE715",
    fontKey: "default",
  },
  clean: {
    ...BASE_CARD_STYLE,
    background: "#FFFFFF",
    textColor: "#111111",
    accentColor: "#DADADA",
    fontKey: "default",
    borderWidth: 2,
  },
  dark: {
    ...BASE_CARD_STYLE,
    background: "#111111",
    textColor: "#FFFFFF",
    accentColor: "#4B5563",
    fontKey: "default",
    textShadow: true,
  },
  bubblegum: {
    ...BASE_CARD_STYLE,
    background: "#FDE7F3",
    textColor: "#241623",
    accentColor: "#FF4F9A",
    fontKey: "comic",
    cornerRadius: 18,
  },
  "hero-hud": {
    ...BASE_CARD_STYLE,
    background: "#F2F0E8",
    textColor: "#1E2633",
    accentColor: "#F59E0B",
    fontKey: "impact",
    italic: true,
    glowBlur: 8,
  },
  "mono-soul": {
    ...BASE_CARD_STYLE,
    background: "#050505",
    textColor: "#FFFFFF",
    accentColor: "#FF2E49",
    fontKey: "consolas",
    borderWidth: 3,
    textShadow: true,
  },
  "creature-dex": {
    ...BASE_CARD_STYLE,
    background: "#2B6DE8",
    textColor: "#FFF6A8",
    accentColor: "#FFCB05",
    fontKey: "trebuchet",
    cornerRadius: 14,
    glowBlur: 6,
  },
  "cyber-mint": {
    ...BASE_CARD_STYLE,
    background: "#071E22",
    textColor: "#D8FFF3",
    accentColor: "#25F4C8",
    fontKey: "bahnschrift",
    backgroundOpacity: 88,
    glowBlur: 16,
    textShadow: true,
  },
  "blood-moon": {
    ...BASE_CARD_STYLE,
    background: "#21070A",
    textColor: "#FFE8D6",
    accentColor: "#D72638",
    fontKey: "georgia",
    cornerRadius: 4,
    glowBlur: 10,
  },
};
const PRESETS = Object.keys(PRESET_STYLES);
const FONT_OPTIONS = [
  {
    css: "Arial, Helvetica, sans-serif",
    label: "Arial / Default",
    value: "default",
  },
  {
    css: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
    label: "Impact",
    value: "impact",
  },
  {
    css: "Consolas, 'Courier New', monospace",
    label: "Consolas Bold",
    value: "consolas",
  },
  {
    css: "'Trebuchet MS', Verdana, sans-serif",
    label: "Trebuchet MS Bold",
    value: "trebuchet",
  },
  {
    css: "Bahnschrift, 'Arial Narrow', sans-serif",
    label: "Bahnschrift",
    value: "bahnschrift",
  },
  {
    css: "Georgia, 'Times New Roman', serif",
    label: "Georgia Bold",
    value: "georgia",
  },
  {
    css: "'Comic Sans MS', 'Comic Sans', cursive",
    label: "Comic Sans Bold",
    value: "comic",
  },
  {
    css: "Verdana, Geneva, sans-serif",
    label: "Verdana Bold",
    value: "verdana",
  },
];
const FONT_STACKS = Object.fromEntries(
  FONT_OPTIONS.map((option) => [option.value, option.css]),
);
const LEGACY_FONT_KEYS: Record<string, string> = {
  condensed: "bahnschrift",
  mono: "consolas",
  rounded: "trebuchet",
  "sans-serif": "default",
  serif: "georgia",
};
const MAX_TIERS = 10;
const DEFAULT_TIERS = [
  { id: "tier-s", label: "S" },
  { id: "tier-a", label: "A" },
  { id: "tier-b", label: "B" },
  { id: "tier-c", label: "C" },
  { id: "tier-d", label: "D" },
];

type TierRow = {
  id: string;
  label: string;
};

type RowMenu = {
  tierId: string;
  x: number;
  y: number;
} | null;

type BoardState = Record<string, PackItem[]>;

type SavedDemoState = {
  text: string;
  title: string;
  description: string;
  preset: string;
  cardStyle: CardStyle;
  enrichmentMode: string;
  tiers: TierRow[];
  board: BoardState;
  pack: PackResponse | null;
};

const BOARD_STORAGE_KEY = "tierzo.demo.v1";
const TIER_COLORS = [
  "#ff747a",
  "#ffc07a",
  "#ffe082",
  "#ffff72",
  "#b8ff6f",
  "#ff747a",
  "#ffc07a",
  "#ffe082",
  "#ffff72",
  "#b8ff6f",
];

function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

export default function Home() {
  const [text, setText] = useState(SAMPLE_LIST);
  const [title, setTitle] = useState("PS2 Survival Horror Demo");
  const [description, setDescription] = useState("");
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  const [selectedTierId, setSelectedTierId] = useState(DEFAULT_TIERS[0].id);
  const [rowMenu, setRowMenu] = useState<RowMenu>(null);
  const [draggedTierId, setDraggedTierId] = useState<string | null>(null);
  const [dragOverTierId, setDragOverTierId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [preset, setPreset] = useState("arcade");
  const [enrichmentMode, setEnrichmentMode] = useState("auto");
  const [cardStyle, setCardStyle] = useState<CardStyle>(PRESET_STYLES.arcade);
  const [pack, setPack] = useState<PackResponse | null>(null);
  const [board, setBoard] = useState<BoardState>({});
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const deferredText = useDeferredValue(text);

  useEffect(() => {
    const saved = window.localStorage.getItem(BOARD_STORAGE_KEY);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as SavedDemoState;
      if (parsed.text) setText(parsed.text);
      if (parsed.title) setTitle(parsed.title);
      setDescription(parsed.description ?? "");
      if (parsed.preset) setPreset(parsed.preset);
      if (parsed.enrichmentMode) setEnrichmentMode(parsed.enrichmentMode);
      if (parsed.cardStyle) {
        const savedStyle = parsed.cardStyle as CardStyle & {
          fontFamily?: string;
        };
        const savedFontKey =
          savedStyle.fontKey ??
          (savedStyle.fontFamily
            ? LEGACY_FONT_KEYS[savedStyle.fontFamily]
            : undefined) ??
          "default";
        setCardStyle({
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
        });
      }
      if (Array.isArray(parsed.tiers) && parsed.tiers.length > 0) {
        setTiers(parsed.tiers.slice(0, MAX_TIERS));
        setSelectedTierId(parsed.tiers[0].id);
      }
      if (parsed.pack) setPack(parsed.pack);
      if (parsed.board) setBoard(parsed.board);
    } catch {
      window.localStorage.removeItem(BOARD_STORAGE_KEY);
    }
  }, []);

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

  async function generatePack() {
    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch(apiUrl("/packs"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          preset,
          size: 512,
          filename_mode: "both",
          title: title.trim() || "Untitled Tierzo Pack",
          description: description.trim() || null,
          row_labels: tiers.map((tier) => tier.label.trim() || "-"),
          enrichment_mode: enrichmentMode,
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
          },
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? "Tierzo could not generate this pack.");
      }

      const nextPack = (await response.json()) as PackResponse;
      setPack(nextPack);
      setBoard({
        [tiers[0]?.id ?? "tier-s"]: nextPack.items.slice(0, 2),
        [tiers[1]?.id ?? "tier-a"]: nextPack.items.slice(2, 4),
        [tiers[2]?.id ?? "tier-b"]: nextPack.items.slice(4, 6),
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unknown generation error.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  const rankedIds = new Set(
    Object.values(board)
      .flat()
      .map((item) => item.id),
  );
  const benchItems =
    pack?.items.filter((item) => !rankedIds.has(item.id)) ?? [];
  const selectedTierIndex = tiers.findIndex(
    (tier) => tier.id === selectedTierId,
  );

  function updateTierLabel(id: string, label: string) {
    setTiers((current) =>
      current.map((tier) => (tier.id === id ? { ...tier, label } : tier)),
    );
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

  function makeTierLabel(position: number) {
    return position < 5
      ? ["S", "A", "B", "C", "D"][position]
      : `Row ${position + 1}`;
  }

  function insertTier(offset: 0 | 1) {
    if (tiers.length >= MAX_TIERS) {
      return;
    }

    const anchorIndex =
      selectedTierIndex >= 0 ? selectedTierIndex : tiers.length - 1;
    const insertAt = anchorIndex + offset;
    const newTier: TierRow = {
      id: `tier-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label: makeTierLabel(tiers.length),
    };

    setTiers((current) => [
      ...current.slice(0, insertAt),
      newTier,
      ...current.slice(insertAt),
    ]);
    setSelectedTierId(newTier.id);
    setRowMenu(null);
  }

  function deleteSelectedTier() {
    if (tiers.length <= 1 || selectedTierIndex < 0) {
      return;
    }

    const removed = tiers[selectedTierIndex];
    const nextSelected =
      tiers[selectedTierIndex + 1] ?? tiers[selectedTierIndex - 1];

    setTiers((current) => current.filter((tier) => tier.id !== removed.id));
    setBoard((current) => {
      const { [removed.id]: removedItems = [], ...rest } = current;
      if (removedItems.length > 0 && nextSelected) {
        rest[nextSelected.id] = [
          ...(rest[nextSelected.id] ?? []),
          ...removedItems,
        ];
      }
      return rest;
    });
    setSelectedTierId(nextSelected.id);
    setRowMenu(null);
  }

  function openRowMenu(event: MouseEvent, tierId: string) {
    event.preventDefault();
    setSelectedTierId(tierId);
    setRowMenu({ tierId, x: event.clientX, y: event.clientY });
  }

  function moveDraggedTier(targetTierId: string) {
    if (!draggedTierId || draggedTierId === targetTierId) {
      return;
    }

    setTiers((current) => {
      const draggedIndex = current.findIndex(
        (tier) => tier.id === draggedTierId,
      );
      const targetIndex = current.findIndex((tier) => tier.id === targetTierId);
      if (draggedIndex < 0 || targetIndex < 0) {
        return current;
      }

      const next = [...current];
      const [dragged] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, dragged);
      return next;
    });
    setDraggedTierId(null);
    setDragOverTierId(null);
  }

  function moveItemToTier(
    itemId: string,
    targetTierId: string,
    beforeItemId?: string,
  ) {
    const item = pack?.items.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }

    setBoard((current) => {
      const next: BoardState = {};
      for (const [tierId, items] of Object.entries(current)) {
        next[tierId] = items.filter((candidate) => candidate.id !== itemId);
      }

      const targetItems = [...(next[targetTierId] ?? [])];
      const insertAt = beforeItemId
        ? targetItems.findIndex((candidate) => candidate.id === beforeItemId)
        : -1;
      if (insertAt >= 0) {
        targetItems.splice(insertAt, 0, item);
      } else {
        targetItems.push(item);
      }
      next[targetTierId] = targetItems;
      return next;
    });
    setDraggedItemId(null);
    setDragOverItemId(null);
    setDragOverTierId(null);
  }

  function moveItemToBench(itemId: string) {
    setBoard((current) => {
      const next: BoardState = {};
      for (const [tierId, items] of Object.entries(current)) {
        next[tierId] = items.filter((candidate) => candidate.id !== itemId);
      }
      return next;
    });
    setDraggedItemId(null);
    setDragOverItemId(null);
    setDragOverTierId(null);
  }

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
    <main className="tm-page" onClick={() => setRowMenu(null)}>
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

        <div className="source-tray">
          <div>
            <div className="source-copy">
              <span>Source list</span>
              <strong>{itemCount} items</strong>
            </div>
            <textarea
              id="items"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="source-actions">
            <label>
              Preset
              <select
                value={preset}
                onChange={(event) => selectPreset(event.target.value)}
              >
                {PRESETS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mode-label">
              <span className="mode-label-title">✦ Generate mode</span>
              <select
                value={enrichmentMode}
                onChange={(event) => setEnrichmentMode(event.target.value)}
              >
                <option value="auto">Auto Agent</option>
                <option value="text">Text cards only</option>
                <option value="tmdb_movie">Movie posters</option>
              </select>
              <small>Let Tierzo pick text cards or source posters.</small>
            </label>
            <div className="card-lab" aria-label="Card Lab">
              <div className="card-lab-preview" style={cardLabStyle}>
                <span>Card Lab</span>
              </div>
              <div className="style-toggles" aria-label="Text style toggles">
                <button
                  type="button"
                  className={cardStyle.bold ? "active" : ""}
                  onClick={() => updateCardStyle({ bold: !cardStyle.bold })}
                >
                  B
                </button>
                <button
                  type="button"
                  className={cardStyle.italic ? "active" : ""}
                  onClick={() => updateCardStyle({ italic: !cardStyle.italic })}
                >
                  I
                </button>
                <button
                  type="button"
                  className={cardStyle.underline ? "active" : ""}
                  onClick={() =>
                    updateCardStyle({ underline: !cardStyle.underline })
                  }
                >
                  U
                </button>
                <button
                  type="button"
                  className={cardStyle.strike ? "active" : ""}
                  onClick={() => updateCardStyle({ strike: !cardStyle.strike })}
                >
                  S
                </button>
                <button
                  type="button"
                  className={cardStyle.textShadow ? "active" : ""}
                  onClick={() =>
                    updateCardStyle({ textShadow: !cardStyle.textShadow })
                  }
                >
                  Shadow
                </button>
              </div>
              <label>
                Background
                <input
                  type="color"
                  value={cardStyle.background}
                  onChange={(event) =>
                    updateCardStyle({ background: event.target.value })
                  }
                />
              </label>
              <label>
                Text
                <input
                  type="color"
                  value={cardStyle.textColor}
                  onChange={(event) =>
                    updateCardStyle({ textColor: event.target.value })
                  }
                />
              </label>
              <label>
                Accent
                <input
                  type="color"
                  value={cardStyle.accentColor}
                  onChange={(event) =>
                    updateCardStyle({ accentColor: event.target.value })
                  }
                />
              </label>
              <label className="card-lab-field card-lab-field-full">
                Font
                <select
                  value={cardStyle.fontKey}
                  onChange={(event) =>
                    updateCardStyle({ fontKey: event.target.value })
                  }
                >
                  {FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="card-lab-sliders">
                <label>
                  Border <strong>{cardStyle.borderWidth}px</strong>
                  <input
                    type="range"
                    min="0"
                    max="16"
                    value={cardStyle.borderWidth}
                    onChange={(event) =>
                      updateCardStyle({
                        borderWidth: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Opacity <strong>{cardStyle.backgroundOpacity}%</strong>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={cardStyle.backgroundOpacity}
                    onChange={(event) =>
                      updateCardStyle({
                        backgroundOpacity: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Glow <strong>{cardStyle.glowBlur}px</strong>
                  <input
                    type="range"
                    min="0"
                    max="32"
                    value={cardStyle.glowBlur}
                    onChange={(event) =>
                      updateCardStyle({
                        glowBlur: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label className="card-lab-field-full">
                Radius <strong>{cardStyle.cornerRadius}px</strong>
                <input
                  type="range"
                  min="0"
                  max="48"
                  value={cardStyle.cornerRadius}
                  onChange={(event) =>
                    updateCardStyle({
                      cornerRadius: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <button
              type="button"
              onClick={generatePack}
              disabled={isGenerating || itemCount === 0}
            >
              {isGenerating ? "Generating..." : "Generate pack"}
            </button>
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
          </div>
        </div>

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

function Card({
  dragOver,
  item,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
}: {
  dragOver?: boolean;
  item: PackItem;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragStart?: () => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
}) {
  return (
    <figure
      className={`card ${dragOver ? "drag-over" : ""}`}
      draggable
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
        onDragStart?.();
      }}
      onDrop={onDrop}
    >
      <Image
        src={apiUrl(item.image_url)}
        alt=""
        width={86}
        height={86}
        unoptimized
      />
      <figcaption>{item.name}</figcaption>
    </figure>
  );
}

async function renderBoardPng({
  board,
  tiers,
  title,
}: {
  board: BoardState;
  tiers: TierRow[];
  title: string;
}) {
  const width = 1200;
  const labelWidth = 118;
  const rowMinHeight = 132;
  const cardSize = 86;
  const cardGap = 10;
  const itemPadding = 12;
  const titleHeight = 86;
  const footerHeight = 34;
  const contentWidth = width - labelWidth;
  const cardsPerRow = Math.max(
    1,
    Math.floor(
      (contentWidth - itemPadding * 2 + cardGap) / (cardSize + cardGap),
    ),
  );
  const rowHeights = tiers.map((tier) => {
    const itemCount = board[tier.id]?.length ?? 0;
    const rows = Math.max(1, Math.ceil(itemCount / cardsPerRow));
    return Math.max(
      rowMinHeight,
      itemPadding * 2 + rows * cardSize + (rows - 1) * cardGap,
    );
  });
  const height =
    titleHeight +
    rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0) +
    footerHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas export is not available in this browser.");
  }

  context.fillStyle = "#0d0d0d";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#f6f6f6";
  context.font = "800 36px Arial, Helvetica, sans-serif";
  context.fillText(title, 28, 54);
  context.fillStyle = "rgba(255,255,255,0.34)";
  context.font = "700 15px Arial, Helvetica, sans-serif";
  context.fillText("Generated with Tierzo", 28, 76);

  let y = titleHeight;
  for (const [tierIndex, tier] of tiers.entries()) {
    const rowHeight = rowHeights[tierIndex];
    context.fillStyle = "#151515";
    context.fillRect(labelWidth, y, width - labelWidth, rowHeight);
    context.strokeStyle = "#262626";
    context.lineWidth = 1;
    context.strokeRect(labelWidth, y, width - labelWidth, rowHeight);
    context.fillStyle = TIER_COLORS[tierIndex % TIER_COLORS.length];
    context.fillRect(0, y, labelWidth, rowHeight);
    context.strokeStyle = "#050505";
    context.strokeRect(0, y, labelWidth, rowHeight);

    drawWrappedText(
      context,
      tier.label || "-",
      labelWidth / 2,
      y + rowHeight / 2,
      labelWidth - 26,
      26,
      "#000",
      "800 24px Arial, Helvetica, sans-serif",
      "center",
    );

    const items = board[tier.id] ?? [];
    for (const [itemIndex, item] of items.entries()) {
      const column = itemIndex % cardsPerRow;
      const row = Math.floor(itemIndex / cardsPerRow);
      const x = labelWidth + itemPadding + column * (cardSize + cardGap);
      const imageY = y + itemPadding + row * (cardSize + cardGap);
      const image = await loadImage(apiUrl(item.image_url));
      context.fillStyle = "#050505";
      context.fillRect(x - 2, imageY - 2, cardSize + 4, cardSize + 4);
      context.drawImage(image, x, imageY, cardSize, cardSize);
    }

    y += rowHeight;
  }

  context.fillStyle = "rgba(255,255,255,0.28)";
  context.font = "700 13px Arial, Helvetica, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText("tierzo.dev-ready export", 28, height - 14);
  return canvas.toDataURL("image/png");
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  centerY: number,
  maxWidth: number,
  lineHeight: number,
  color: string,
  font: string,
  align: CanvasTextAlign,
) {
  context.font = font;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillStyle = color;
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words.length > 0 ? words : [text]) {
    if (context.measureText(word).width > maxWidth) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }
      lines.push(...splitLongWord(context, word, maxWidth));
      continue;
    }

    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !currentLine) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  const firstY = centerY - ((lines.length - 1) * lineHeight) / 2;
  for (const [index, line] of lines.entries()) {
    context.fillText(line, x, firstY + index * lineHeight);
  }
}

function splitLongWord(
  context: CanvasRenderingContext2D,
  word: string,
  maxWidth: number,
) {
  const chunks: string[] = [];
  let currentChunk = "";
  for (const character of word) {
    const candidate = `${currentChunk}${character}`;
    if (context.measureText(candidate).width <= maxWidth || !currentChunk) {
      currentChunk = candidate;
    } else {
      chunks.push(currentChunk);
      currentChunk = character;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  return chunks;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "tierzo"
  );
}

function textDecoration(style: CardStyle) {
  const decorations = [];
  if (style.underline) decorations.push("underline");
  if (style.strike) decorations.push("line-through");
  return decorations.length > 0 ? decorations.join(" ") : "none";
}

function hexToRgba(hex: string, opacity: number) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0.2, Math.min(1, opacity))})`;
}

function formatGenerationStatus(pack: PackResponse) {
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

function formatToolName(tool: string) {
  if (tool === "tmdb_movie") return "movie posters";
  if (tool === "text") return "text cards";
  if (tool === "steam") return "Steam assets";
  if (tool === "spotify") return "Spotify assets";
  return tool;
}

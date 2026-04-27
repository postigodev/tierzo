"use client";

import Image from "next/image";
import { useDeferredValue, useMemo, useState } from "react";

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
};

const API_BASE = process.env.NEXT_PUBLIC_TIERZO_API_URL ?? "http://localhost:8000";

const SAMPLE_LIST = `Silent Hill 2
Resident Evil 4
Fatal Frame II
Rule of Rose
Kuon
Siren
Haunting Ground
Clock Tower 3`;

const PRESETS = ["arcade", "clean", "dark", "bubblegum"];
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

function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

export default function Home() {
  const [text, setText] = useState(SAMPLE_LIST);
  const [title, setTitle] = useState("PS2 Survival Horror Demo");
  const [description, setDescription] = useState("");
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  const [selectedTierId, setSelectedTierId] = useState(DEFAULT_TIERS[0].id);
  const [preset, setPreset] = useState("arcade");
  const [pack, setPack] = useState<PackResponse | null>(null);
  const [board, setBoard] = useState<Record<string, PackItem[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const deferredText = useDeferredValue(text);

  const itemCount = useMemo(
    () => deferredText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).length,
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
      setError(caught instanceof Error ? caught.message : "Unknown generation error.");
    } finally {
      setIsGenerating(false);
    }
  }

  const rankedIds = new Set(Object.values(board).flat().map((item) => item.id));
  const benchItems = pack?.items.filter((item) => !rankedIds.has(item.id)) ?? [];
  const selectedTierIndex = tiers.findIndex((tier) => tier.id === selectedTierId);

  function updateTierLabel(id: string, label: string) {
    setTiers((current) => current.map((tier) => (tier.id === id ? { ...tier, label } : tier)));
  }

  function makeTierLabel(position: number) {
    return position < 5 ? ["S", "A", "B", "C", "D"][position] : `Row ${position + 1}`;
  }

  function insertTier(offset: 0 | 1) {
    if (tiers.length >= MAX_TIERS) {
      return;
    }

    const anchorIndex = selectedTierIndex >= 0 ? selectedTierIndex : tiers.length - 1;
    const insertAt = anchorIndex + offset;
    const newTier: TierRow = {
      id: `tier-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label: makeTierLabel(tiers.length),
    };

    setTiers((current) => [...current.slice(0, insertAt), newTier, ...current.slice(insertAt)]);
    setSelectedTierId(newTier.id);
  }

  function deleteSelectedTier() {
    if (tiers.length <= 1 || selectedTierIndex < 0) {
      return;
    }

    const removed = tiers[selectedTierIndex];
    const nextSelected = tiers[selectedTierIndex + 1] ?? tiers[selectedTierIndex - 1];

    setTiers((current) => current.filter((tier) => tier.id !== removed.id));
    setBoard((current) => {
      const { [removed.id]: removedItems = [], ...rest } = current;
      if (removedItems.length > 0 && nextSelected) {
        rest[nextSelected.id] = [...(rest[nextSelected.id] ?? []), ...removedItems];
      }
      return rest;
    });
    setSelectedTierId(nextSelected.id);
  }

  return (
    <main className="tm-page">
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
        <a className="community-link" href="https://tiermaker.com/" rel="noreferrer" target="_blank">
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
          <div>
            <p className="kicker">Tierzo Demo 01</p>
            <h2>{pack ? "Generated pack preview" : "Paste a list below to generate cards"}</h2>
          </div>
          {pack ? (
            <a className="download" href={apiUrl(pack.zip_url)}>
              Download ZIP
            </a>
          ) : null}
        </div>

        <div className="board">
          {tiers.map((tier, index) => (
            <div
              className={`tier-row ${selectedTierId === tier.id ? "selected" : ""}`}
              key={tier.id}
              onClick={() => setSelectedTierId(tier.id)}
            >
              <input
                aria-label={`Tier ${index + 1} label`}
                className="tier-label"
                value={tier.label}
                onFocus={() => setSelectedTierId(tier.id)}
                onChange={(event) => {
                  updateTierLabel(tier.id, event.target.value);
                }}
              />
              <div className="tier-items">
                {(board[tier.id] ?? []).map((item) => (
                  <Card item={item} key={item.id} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="toolbar" aria-label="Tierzo actions">
          <button className="tool-button ghost" type="button">
            Upload Images
          </button>
          <button className="tool-button ghost" type="button">
            Upload Videos
          </button>
          <button className="tool-button" type="button" onClick={generatePack} disabled={isGenerating || itemCount === 0}>
            {isGenerating ? "Generating..." : "Generate with Tierzo"}
          </button>
          <span className="edit-link">Edit</span>
        </div>

        <div className="tier-actions" aria-label="Tier row controls">
          <span>{selectedTierIndex >= 0 ? `Selected row ${selectedTierIndex + 1}` : "Select a row"}</span>
          <button type="button" onClick={() => insertTier(0)} disabled={tiers.length >= MAX_TIERS}>
            Add row above
          </button>
          <button type="button" onClick={() => insertTier(1)} disabled={tiers.length >= MAX_TIERS}>
            Add row below
          </button>
          <button type="button" onClick={deleteSelectedTier} disabled={tiers.length <= 1}>
            Delete row
          </button>
          <strong>{tiers.length}/{MAX_TIERS}</strong>
        </div>

        <div className="bench">
          <div className="bench-label">Drop images here or drag to tiers above</div>
          <div className="bench-items">
            {benchItems.length > 0 ? benchItems.map((item) => <Card item={item} key={item.id} />) : <span>Generated cards will land here.</span>}
          </div>
        </div>

        <div className="source-tray">
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
          <div className="source-actions">
            <label>
              Preset
              <select value={preset} onChange={(event) => setPreset(event.target.value)}>
                {PRESETS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={generatePack} disabled={isGenerating || itemCount === 0}>
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
          </div>
        </div>

        <div className="footer-actions">
          <button type="button">New Tier List</button>
          <button type="button">Save Draft</button>
          <button type="button">Export PNG</button>
          <button type="button">Share Link</button>
          <button type="button">Rank with Friends</button>
          <button type="button">Publish</button>
        </div>
      </section>
    </main>
  );
}

function Card({ item }: { item: PackItem }) {
  return (
    <figure className="card">
      <Image src={apiUrl(item.image_url)} alt="" width={86} height={86} unoptimized />
      <figcaption>{item.name}</figcaption>
    </figure>
  );
}

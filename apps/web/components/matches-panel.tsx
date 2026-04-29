"use client";

import Image from "next/image";

import { apiUrl } from "../lib/api";
import { formatMatchQuality, formatMatchSource } from "../lib/formatters";
import type { MatchOverrides, PackResponse } from "../lib/types";

export function MatchesPanel({
  isApplying,
  onApply,
  onOverride,
  overrides,
  pack,
}: {
  isApplying: boolean;
  onApply: () => void;
  onOverride: (
    itemName: string,
    action: "keep" | "text" | "image_url",
    value?: string,
  ) => void;
  overrides: MatchOverrides;
  pack: PackResponse;
}) {
  const matched = pack.items.filter((item) => item.asset_kind !== "text-card");
  const fallback = pack.items.length - matched.length;
  const overrideCount = Object.keys(overrides).length;

  return (
    <section className="matches-panel" aria-label="Review matches">
      <div className="matches-head">
        <div>
          <strong>Review matches</strong>
          <span>
            {matched.length}/{pack.items.length} sourced
            {fallback > 0 ? `, ${fallback} text fallback` : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={onApply}
          disabled={overrideCount === 0 || isApplying}
        >
          {isApplying
            ? "Applying..."
            : `Apply changes${overrideCount ? ` (${overrideCount})` : ""}`}
        </button>
      </div>
      <div className="matches-list">
        {pack.items.map((item) => {
          const isForcedText = overrides[item.name] === "text";
          const manualUrl = overrides[item.name]?.startsWith("image_url:")
            ? overrides[item.name].replace("image_url:", "")
            : "";
          const isManualImage = Boolean(manualUrl);

          return (
            <article
              className={`match-row ${isForcedText ? "forced-text" : ""} ${isManualImage ? "manual-image" : ""}`}
              key={item.id}
            >
              <Image
                src={apiUrl(item.image_url)}
                alt=""
                width={42}
                height={42}
                unoptimized
              />
              <div className="match-copy">
                <strong>{item.name}</strong>
                <span>
                  {isForcedText
                    ? "Queued: regenerate this as a text card."
                    : isManualImage
                      ? "Queued: replace with your image URL."
                      : formatMatchSource(item)}
                </span>
              </div>
              <span
                className={`match-pill ${isForcedText ? "text-card" : item.asset_kind}`}
              >
                {isForcedText
                  ? "Text card"
                  : isManualImage
                    ? "Manual"
                    : formatMatchQuality(item)}
              </span>
              <div className="match-actions">
                <button
                  type="button"
                  className={!isForcedText && !isManualImage ? "active" : ""}
                  onClick={() => onOverride(item.name, "keep")}
                  title="Use the image match Tierzo found."
                >
                  Use image
                </button>
                <button
                  type="button"
                  className={isForcedText ? "active" : ""}
                  onClick={() => onOverride(item.name, "text")}
                  title="Ignore this image and render a normal text card."
                >
                  Use text
                </button>
                <label className="replace-match">
                  Replace
                  <input
                    type="url"
                    placeholder="Paste image URL"
                    defaultValue={manualUrl}
                    onBlur={(event) =>
                      onOverride(item.name, "image_url", event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                </label>
                {item.source_url ? (
                  <a href={item.source_url} rel="noreferrer" target="_blank">
                    Source
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

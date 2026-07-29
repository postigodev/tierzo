import Image from "next/image";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  FileText,
  ImageIcon,
  type LucideIcon,
} from "lucide-react";

import { apiUrl } from "../lib/api";
import { formatMatchSource } from "../lib/formatters";
import type { MatchOverrides, PackResponse } from "../lib/types";

type MatchStatus = {
  label: string;
  className: string;
  Icon: LucideIcon;
};

function getMatchStatus({
  item,
  isForcedText,
}: {
  item: PackResponse["items"][number];
  isForcedText: boolean;
}): MatchStatus {
  if (isForcedText) {
    return {
      label: "Text card",
      className: "text-card",
      Icon: FileText,
    };
  }

  if (item.asset_kind === "text-card") {
    return {
      label: "Text fallback",
      className: "text-card",
      Icon: FileText,
    };
  }

  if (item.confidence === null) {
    return {
      label: "Matched image",
      className: "matched-image",
      Icon: ImageIcon,
    };
  }

  if (item.confidence >= 0.9) {
    return {
      label: "Strong match",
      className: "strong-match",
      Icon: BadgeCheck,
    };
  }

  if (item.confidence >= 0.75) {
    return {
      label: "Good match",
      className: "good-match",
      Icon: CheckCircle2,
    };
  }

  return {
    label: "Needs review",
    className: "review-match",
    Icon: AlertTriangle,
  };
}

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
    itemId: string,
    action: "keep" | "text",
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
          const isForcedText = overrides[item.id]?.action === "text";
          const status = getMatchStatus({
            item,
            isForcedText,
          });

          const StatusIcon = status.Icon;
          return (
            <article
              className={`match-row ${isForcedText ? "forced-text" : ""}`}
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
                    : formatMatchSource(item)}
                </span>
              </div>
              <span
                className={`match-pill icon-pill ${status.className}`}
                aria-label={status.label}
                title={status.label}
              >
                <StatusIcon size={16} strokeWidth={2.25} aria-hidden="true" />
              </span>
              <div className="match-actions">
                <button
                  type="button"
                  className={!isForcedText ? "active" : ""}
                  onClick={() => onOverride(item.id, "keep")}
                  title="Use the image match Tierzo found."
                >
                  Image
                </button>
                <button
                  type="button"
                  className={isForcedText ? "active" : ""}
                  onClick={() => onOverride(item.id, "text")}
                  title="Ignore this image and render a normal text card."
                >
                  Text
                </button>
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

"use client";

import type { CSSProperties } from "react";

import type { CardStyle } from "../lib/types";

type FontOption = {
  css: string;
  label: string;
  value: string;
};

export function CardLabPanel({
  cardLabStyle,
  cardStyle,
  fontOptions,
  onUpdateStyle,
}: {
  cardLabStyle: CSSProperties;
  cardStyle: CardStyle;
  fontOptions: FontOption[];
  onUpdateStyle: (nextStyle: Partial<CardStyle>) => void;
}) {
  return (
    <div className="card-lab" aria-label="Card Lab">
      <div className="card-lab-preview" style={cardLabStyle}>
        <span>Card Lab</span>
      </div>
      <div className="style-toggles" aria-label="Text style toggles">
        <button
          type="button"
          className={cardStyle.bold ? "active" : ""}
          onClick={() => onUpdateStyle({ bold: !cardStyle.bold })}
        >
          B
        </button>
        <button
          type="button"
          className={cardStyle.italic ? "active" : ""}
          onClick={() => onUpdateStyle({ italic: !cardStyle.italic })}
        >
          I
        </button>
        <button
          type="button"
          className={cardStyle.underline ? "active" : ""}
          onClick={() => onUpdateStyle({ underline: !cardStyle.underline })}
        >
          U
        </button>
        <button
          type="button"
          className={cardStyle.strike ? "active" : ""}
          onClick={() => onUpdateStyle({ strike: !cardStyle.strike })}
        >
          S
        </button>
        <button
          type="button"
          className={cardStyle.textShadow ? "active" : ""}
          onClick={() => onUpdateStyle({ textShadow: !cardStyle.textShadow })}
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
            onUpdateStyle({ background: event.target.value })
          }
        />
      </label>
      <label>
        Text
        <input
          type="color"
          value={cardStyle.textColor}
          onChange={(event) =>
            onUpdateStyle({ textColor: event.target.value })
          }
        />
      </label>
      <label>
        Accent
        <input
          type="color"
          value={cardStyle.accentColor}
          onChange={(event) =>
            onUpdateStyle({ accentColor: event.target.value })
          }
        />
      </label>
      <label className="card-lab-field card-lab-field-full">
        Font
        <select
          value={cardStyle.fontKey}
          onChange={(event) => onUpdateStyle({ fontKey: event.target.value })}
        >
          {fontOptions.map((option) => (
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
              onUpdateStyle({
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
              onUpdateStyle({
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
              onUpdateStyle({
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
            onUpdateStyle({
              cornerRadius: Number(event.target.value),
            })
          }
        />
      </label>
      <label className="card-lab-field card-lab-field-full">
        Poster title
        <select
          value={cardStyle.imageLabelPosition}
          onChange={(event) =>
            onUpdateStyle({
              imageLabelPosition: event.target
                .value as CardStyle["imageLabelPosition"],
            })
          }
        >
          <option value="none">Image only</option>
          <option value="overlay">Overlay bottom</option>
          <option value="bottom">Bottom label</option>
          <option value="top">Top label</option>
        </select>
      </label>
    </div>
  );
}

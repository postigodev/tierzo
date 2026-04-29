import type { CardStyle } from "./types";

export function textDecoration(style: CardStyle) {
  const decorations = [];
  if (style.underline) decorations.push("underline");
  if (style.strike) decorations.push("line-through");
  return decorations.length > 0 ? decorations.join(" ") : "none";
}

export function hexToRgba(hex: string, opacity: number) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0.2, Math.min(1, opacity))})`;
}

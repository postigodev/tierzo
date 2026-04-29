import type { CardStyle } from "./types";

export const SAMPLE_LIST = `Silent Hill 2
Resident Evil 4
Fatal Frame II
Rule of Rose
Kuon
Siren
Haunting Ground
Clock Tower 3`;

export const BASE_CARD_STYLE = {
  bold: true,
  italic: false,
  underline: false,
  strike: false,
  textShadow: false,
  backgroundOpacity: 100,
  borderWidth: 4,
  cornerRadius: 8,
  glowBlur: 0,
  imageLabelPosition: "none" as const,
};

export const PRESET_STYLES: Record<string, CardStyle> = {
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

export const PRESETS = Object.keys(PRESET_STYLES);

export const FONT_OPTIONS = [
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

export const FONT_STACKS = Object.fromEntries(
  FONT_OPTIONS.map((option) => [option.value, option.css]),
);

export const LEGACY_FONT_KEYS: Record<string, string> = {
  condensed: "bahnschrift",
  mono: "consolas",
  rounded: "trebuchet",
  "sans-serif": "default",
  serif: "georgia",
};

export const MAX_TIERS = 10;

export const DEFAULT_TIERS = [
  { id: "tier-s", label: "S" },
  { id: "tier-a", label: "A" },
  { id: "tier-b", label: "B" },
  { id: "tier-c", label: "C" },
  { id: "tier-d", label: "D" },
];

export const BOARD_STORAGE_KEY = "tierzo.demo.v1";

export const TIER_COLORS = [
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

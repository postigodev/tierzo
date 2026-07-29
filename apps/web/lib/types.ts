export type PackItem = {
  id: string;
  name: string;
  filename: string;
  image_url: string;
  asset_kind: string;
  source_type: string;
  source_value: string | null;
  source_url: string | null;
  confidence: number | null;
};

export type SourceItemId = string;

export type SourceItem = {
  id: SourceItemId;
  name: string;
};

export type PackResponse = {
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

export type JobStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "warning" | "error";
  detail: string | null;
};

export type GenerationJob = {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  steps: JobStep[];
  pack: PackResponse | null;
  error: string | null;
};

export type ItemAssetOverride = {
  action: "text";
};

export type MatchOverrides = Record<SourceItemId, ItemAssetOverride>;

export type PromptDraftResponse = {
  title: string;
  description: string | null;
  items: string[];
  suggested_enrichment_mode: "auto" | "text" | "tmdb_movie";
  confidence: number;
  source: string;
  cache_hit: boolean;
};

export type CardStyle = {
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
  imageLabelPosition: "none" | "top" | "bottom" | "overlay";
};

export type TierRow = {
  id: string;
  label: string;
};

export type RowMenu = {
  tierId: string;
  x: number;
  y: number;
} | null;

export type BoardState = Record<string, SourceItemId[]>;
export type ResolvedBoardState = Record<string, PackItem[]>;

export type SavedWorkspaceState = {
  version: 3;
  sourceItems: SourceItem[];
  text: string;
  title: string;
  description: string;
  preset: string;
  cardStyle: CardStyle | null;
  enrichmentMode: string;
  tiers: TierRow[];
  board: BoardState;
  pack: PackResponse | null;
  migrationWarnings: string[];
};

export type LegacyBoardState = Record<string, PackItem[]>;

export type LegacySavedDemoState = {
  text?: string;
  title?: string;
  description?: string;
  preset?: string;
  cardStyle?: CardStyle | null;
  enrichmentMode?: string;
  tiers?: TierRow[];
  board?: LegacyBoardState;
  pack?: PackResponse | null;
};

export type SavedDemoState = SavedWorkspaceState;

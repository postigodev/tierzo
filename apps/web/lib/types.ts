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

export type GenerationOutcome = "normal" | "degraded";

export type GenerationWarningCode =
  | "openai_unconfigured_heuristic"
  | "openai_provider_heuristic_fallback"
  | "tmdb_unconfigured_text_fallback"
  | "tmdb_provider_text_fallback"
  | "tmdb_partial_match"
  | "unsupported_planner_tool_text_fallback";

export type GenerationWarning = {
  code: GenerationWarningCode;
  message: string;
};

export type PackResponse = {
  pack_id: string;
  status: "completed";
  created_at: string;
  expires_at: string;
  title: string;
  description: string | null;
  row_labels: string[];
  item_count: number;
  items: PackItem[];
  manifest_url: string;
  zip_url: string;
  extension_url: string;
  enrichment_status: string;
  outcome: GenerationOutcome;
  warnings: GenerationWarning[];
  agent_plan: {
    domain: string;
    tool: string;
    confidence: number;
    source: string;
    cache_hit: boolean;
  } | null;
};

export type PersistedPackSnapshot = Omit<
  PackResponse,
  "created_at" | "expires_at"
> & {
  created_at: string | null;
  expires_at: string | null;
};

export type JobStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "warning" | "error";
  detail: string | null;
};

export type GenerationJob = {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed" | "lost";
  created_at: string | null;
  updated_at: string | null;
  steps: JobStep[];
  pack: PackResponse | null;
  pack_status: PackLifecycleStatus | null;
  error: string | null;
};

export type PackLifecycleStatus = "completed" | "expired" | "lost";

export type PackLifecycleResponse = {
  pack_id: string;
  status: PackLifecycleStatus;
  created_at: string | null;
  expires_at: string | null;
};

export type ArtifactState =
  | "idle"
  | "checking"
  | "completed"
  | "expired"
  | "lost"
  | "validation_unavailable";

export type PollingState =
  | "idle"
  | "polling"
  | "completed"
  | "failed"
  | "lost"
  | "cancelled"
  | "timed_out";

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
  outcome: GenerationOutcome;
  warnings: GenerationWarning[];
};

export type CapabilityEntry = {
  available: boolean;
  effective_mode:
    | "deterministic"
    | "openai"
    | "heuristic"
    | "tmdb"
    | "unavailable";
  reason_code: "openai_unconfigured" | "tmdb_unconfigured" | null;
};

export type CapabilitiesResponse = {
  schema_version: "tierzo.capabilities.v1";
  capabilities: {
    text_cards: CapabilityEntry;
    prompt_drafting: CapabilityEntry;
    auto_planning: CapabilityEntry;
    tmdb_movie: CapabilityEntry;
  };
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
  pack: PersistedPackSnapshot | null;
  lastJobId: string | null;
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
  pack?: PersistedPackSnapshot | null;
  lastJobId?: string | null;
};

export type SavedDemoState = SavedWorkspaceState;

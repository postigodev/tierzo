import { reconcileBoard } from "#tierzo/board-reconciliation";
import {
  createSourceItemId,
  isValidSourceItemId,
  parseSourceText,
  reconcileSourceItems,
  sourceItemsToText,
  type SourceItemIdFactory,
} from "#tierzo/source-items";
import type {
  BoardState,
  CardStyle,
  PackItem,
  PackResponse,
  SavedWorkspaceState,
  SourceItem,
  TierRow,
} from "#tierzo/types";

export const WORKSPACE_STORAGE_KEY = "tierzo.editor.v3";
export const LEGACY_WORKSPACE_STORAGE_KEY = "tierzo.editor.v2";

export type WorkspaceMigrationResult = {
  state: SavedWorkspaceState;
  migrated: boolean;
  warnings: string[];
};

export function migrateWorkspaceState(
  input: unknown,
  createId: SourceItemIdFactory = createSourceItemId,
): WorkspaceMigrationResult {
  if (isRecord(input) && input.version === 3) {
    return sanitizeV3Workspace(input, createId);
  }
  return migrateLegacyWorkspace(input, createId);
}

function sanitizeV3Workspace(
  input: Record<string, unknown>,
  createId: SourceItemIdFactory,
): WorkspaceMigrationResult {
  const warnings: string[] = [];
  const sanitizedSource = sanitizeSourceItems(
    input.sourceItems,
    createId,
    warnings,
  );
  const sourceItems = sanitizedSource.items;
  const sourceIds = new Set(sourceItems.map((item) => item.id));
  const board = sanitizeIdBoard(input.board, sanitizedSource.idMap);
  const reconciledBoard = reconcileBoard(board, sourceIds);
  if (reconciledBoard.removedRankedIds.length > 0) {
    warnings.push("Removed ranking entries that no longer have source items.");
  }
  const pack =
    sanitizedSource.reassignedCount > 0 ? null : sanitizePack(input.pack);
  if (sanitizedSource.reassignedCount > 0 && input.pack) {
    warnings.push(
      "Discarded restored artifact links because their item IDs no longer matched the repaired workspace.",
    );
  }
  const existingWarnings = Array.isArray(input.migrationWarnings)
    ? input.migrationWarnings.filter(
        (warning): warning is string => typeof warning === "string",
      )
    : [];

  const state = buildWorkspaceState({
    input,
    sourceItems,
    board: reconciledBoard.board,
    pack,
    warnings: [...existingWarnings, ...warnings],
  });
  return { state, migrated: false, warnings };
}

function migrateLegacyWorkspace(
  input: unknown,
  createId: SourceItemIdFactory,
): WorkspaceMigrationResult {
  const legacy = isRecord(input) ? input : {};
  const warnings: string[] = [];
  const legacyPack = sanitizePack(legacy.pack);
  const sourceItems: SourceItem[] = [];
  const legacyIdMap = new Map<string, string>();
  const mappedPackItems: PackItem[] = [];
  const usedIds = new Set<string>();

  for (const item of legacyPack?.items ?? []) {
    const canPreserveId =
      isValidSourceItemId(item.id) && !usedIds.has(item.id);
    const id = canPreserveId ? item.id : nextUniqueId(createId, usedIds);
    usedIds.add(id);
    sourceItems.push({ id, name: item.name });
    if (!legacyIdMap.has(item.id)) {
      legacyIdMap.set(item.id, id);
    } else {
      warnings.push(`Recovered a duplicate legacy item id: ${item.id}.`);
    }
    if (!canPreserveId) {
      warnings.push(`Reassigned an invalid or duplicate legacy item id: ${item.id}.`);
    }
    mappedPackItems.push({ ...item, id });
  }

  const legacyBoard = sanitizeLegacyBoard(
    legacy.board,
    sourceItems,
    legacyIdMap,
    usedIds,
    createId,
    warnings,
  );
  let nextSourceItems = sourceItems;
  const parsedText = parseSourceText(asString(legacy.text));

  if (nextSourceItems.length === 0 && parsedText.length > 0) {
    nextSourceItems = parsedText.map((name) => ({ id: createId(), name }));
  } else if (parsedText.length > 0) {
    const reconciliation = reconcileSourceItems(
      nextSourceItems,
      parsedText,
      createId,
    );
    const rankedIds = new Set(Object.values(legacyBoard).flat());
    const byId = new Map(nextSourceItems.map((item) => [item.id, item]));
    const recoveredRankedItems = reconciliation.removedIds
      .filter((id) => rankedIds.has(id))
      .map((id) => byId.get(id))
      .filter((item): item is SourceItem => Boolean(item));
    nextSourceItems = [...reconciliation.items, ...recoveredRankedItems];
    if (recoveredRankedItems.length > 0) {
      warnings.push(
        "Recovered ranked legacy items that were missing from the saved text.",
      );
    }
    if (reconciliation.ambiguousReplacementCount > 0) {
      warnings.push(
        "Some legacy text changes were ambiguous, so new item identities were assigned.",
      );
    }
  }

  const reconciledBoard = reconcileBoard(
    legacyBoard,
    nextSourceItems.map((item) => item.id),
  );
  if (reconciledBoard.removedRankedIds.length > 0) {
    warnings.push("Dropped invalid legacy ranking entries.");
  }
  const pack = legacyPack
    ? {
        ...legacyPack,
        items: mappedPackItems,
      }
    : null;
  const state = buildWorkspaceState({
    input: legacy,
    sourceItems: nextSourceItems,
    board: reconciledBoard.board,
    pack,
    warnings,
  });
  return { state, migrated: true, warnings };
}

function sanitizeLegacyBoard(
  input: unknown,
  sourceItems: SourceItem[],
  legacyIdMap: Map<string, string>,
  usedIds: Set<string>,
  createId: SourceItemIdFactory,
  warnings: string[],
): BoardState {
  if (!isRecord(input)) {
    return {};
  }
  const board: BoardState = {};
  const orphanIds = new Map<string, string>();

  for (const [tierId, rawItems] of Object.entries(input)) {
    if (!Array.isArray(rawItems)) {
      continue;
    }
    board[tierId] = [];
    for (const rawItem of rawItems) {
      if (!isPackItem(rawItem)) {
        continue;
      }
      let id = legacyIdMap.get(rawItem.id);
      if (!id) {
        id = orphanIds.get(rawItem.id);
      }
      if (!id) {
        id =
          isValidSourceItemId(rawItem.id) && !usedIds.has(rawItem.id)
            ? rawItem.id
            : nextUniqueId(createId, usedIds);
        usedIds.add(id);
        orphanIds.set(rawItem.id, id);
        sourceItems.push({ id, name: rawItem.name });
        warnings.push(`Recovered ranked item missing from its pack: ${rawItem.name}.`);
      }
      board[tierId].push(id);
    }
  }
  return board;
}

function sanitizeSourceItems(
  input: unknown,
  createId: SourceItemIdFactory,
  warnings: string[],
): {
  items: SourceItem[];
  idMap: Map<string, string>;
  reassignedCount: number;
} {
  if (!Array.isArray(input)) {
    return { items: [], idMap: new Map(), reassignedCount: 0 };
  }
  const seen = new Set<string>();
  const items: SourceItem[] = [];
  const idMap = new Map<string, string>();
  let reassignedCount = 0;
  for (const value of input) {
    if (!isRecord(value) || typeof value.name !== "string") {
      continue;
    }
    const name = value.name.replace(/\s+/g, " ").trim();
    if (!name) {
      continue;
    }
    const originalId = typeof value.id === "string" ? value.id : null;
    let id =
      originalId !== null &&
      isValidSourceItemId(originalId) &&
      !seen.has(originalId)
        ? originalId
        : nextUniqueId(createId, seen);
    if (originalId === null || !isValidSourceItemId(originalId)) {
      warnings.push("Reassigned an invalid source item id.");
      reassignedCount += 1;
    }
    if (originalId !== null && seen.has(originalId)) {
      warnings.push("Reassigned a duplicate source item id.");
      reassignedCount += 1;
    }
    seen.add(id);
    if (originalId !== null && !idMap.has(originalId)) {
      idMap.set(originalId, id);
    }
    items.push({ id, name });
  }
  return { items, idMap, reassignedCount };
}

function sanitizeIdBoard(
  input: unknown,
  idMap: Map<string, string> = new Map(),
): BoardState {
  if (!isRecord(input)) {
    return {};
  }
  const board: BoardState = {};
  for (const [tierId, rawIds] of Object.entries(input)) {
    if (!Array.isArray(rawIds)) {
      continue;
    }
    board[tierId] = rawIds
      .filter((id): id is string => typeof id === "string" && Boolean(id))
      .map((id) => idMap.get(id) ?? id);
  }
  return board;
}

function buildWorkspaceState({
  input,
  sourceItems,
  board,
  pack,
  warnings,
}: {
  input: Record<string, unknown>;
  sourceItems: SourceItem[];
  board: BoardState;
  pack: PackResponse | null;
  warnings: string[];
}): SavedWorkspaceState {
  return {
    version: 3,
    sourceItems,
    text: sourceItemsToText(sourceItems),
    title: asString(input.title),
    description: asString(input.description),
    preset: asString(input.preset) || "arcade",
    cardStyle: isCardStyle(input.cardStyle) ? input.cardStyle : null,
    enrichmentMode: asString(input.enrichmentMode) || "auto",
    tiers: sanitizeTiers(input.tiers),
    board,
    pack,
    migrationWarnings: warnings,
  };
}

function sanitizeTiers(input: unknown): TierRow[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<string>();
  return input.filter((tier): tier is TierRow => {
    if (
      !isRecord(tier) ||
      typeof tier.id !== "string" ||
      typeof tier.label !== "string" ||
      !tier.id ||
      seen.has(tier.id)
    ) {
      return false;
    }
    seen.add(tier.id);
    return true;
  });
}

function sanitizePack(input: unknown): PackResponse | null {
  if (!isRecord(input) || !Array.isArray(input.items)) {
    return null;
  }
  const items = input.items.filter(isPackItem);
  if (
    typeof input.pack_id !== "string" ||
    !(input.status === undefined || input.status === "completed") ||
    typeof input.title !== "string" ||
    !(typeof input.description === "string" || input.description === null) ||
    !Array.isArray(input.row_labels) ||
    !input.row_labels.every((label) => typeof label === "string") ||
    typeof input.manifest_url !== "string" ||
    typeof input.zip_url !== "string" ||
    typeof input.extension_url !== "string" ||
    typeof input.enrichment_status !== "string" ||
    !(input.agent_plan === null || isAgentPlan(input.agent_plan))
  ) {
    return null;
  }
  return {
    pack_id: input.pack_id,
    status: "completed",
    created_at:
      typeof input.created_at === "string" ? input.created_at : null,
    expires_at:
      typeof input.expires_at === "string" ? input.expires_at : null,
    title: input.title,
    description: input.description,
    row_labels: input.row_labels,
    item_count: items.length,
    items,
    manifest_url: input.manifest_url,
    zip_url: input.zip_url,
    extension_url: input.extension_url,
    enrichment_status: input.enrichment_status,
    agent_plan: input.agent_plan,
  };
}

function isPackItem(input: unknown): input is PackItem {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.name === "string" &&
    typeof input.filename === "string" &&
    typeof input.image_url === "string" &&
    typeof input.asset_kind === "string" &&
    typeof input.source_type === "string" &&
    (typeof input.source_value === "string" || input.source_value === null) &&
    (typeof input.source_url === "string" || input.source_url === null) &&
    (typeof input.confidence === "number" || input.confidence === null)
  );
}

function isCardStyle(input: unknown): input is CardStyle {
  return (
    isRecord(input) &&
    typeof input.background === "string" &&
    typeof input.textColor === "string" &&
    typeof input.accentColor === "string" &&
    typeof input.fontKey === "string" &&
    typeof input.bold === "boolean" &&
    typeof input.italic === "boolean" &&
    typeof input.underline === "boolean" &&
    typeof input.strike === "boolean" &&
    typeof input.textShadow === "boolean" &&
    typeof input.backgroundOpacity === "number" &&
    typeof input.borderWidth === "number" &&
    typeof input.cornerRadius === "number" &&
    typeof input.glowBlur === "number" &&
    (input.imageLabelPosition === "none" ||
      input.imageLabelPosition === "top" ||
      input.imageLabelPosition === "bottom" ||
      input.imageLabelPosition === "overlay")
  );
}

function isAgentPlan(
  input: unknown,
): input is NonNullable<PackResponse["agent_plan"]> {
  return (
    isRecord(input) &&
    typeof input.domain === "string" &&
    typeof input.tool === "string" &&
    typeof input.confidence === "number" &&
    typeof input.source === "string" &&
    typeof input.cache_hit === "boolean"
  );
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nextUniqueId(
  createId: SourceItemIdFactory,
  usedIds: Set<string>,
): string {
  let id = createId();
  while (!isValidSourceItemId(id) || usedIds.has(id)) {
    id = createId();
  }
  return id;
}

import type {
  BoardState,
  SourceItem,
  SourceItemId,
} from "#tierzo/types";

export type BoardReconciliation = {
  board: BoardState;
  removedRankedIds: SourceItemId[];
};

export function collectRankedIds(board: BoardState): Set<SourceItemId> {
  return new Set(Object.values(board).flat());
}

export function selectBenchItems(
  sourceItems: SourceItem[],
  board: BoardState,
): SourceItem[] {
  const rankedIds = collectRankedIds(board);
  return sourceItems.filter((item) => !rankedIds.has(item.id));
}

export function reconcileBoard(
  board: BoardState,
  nextSourceIds: Iterable<SourceItemId>,
): BoardReconciliation {
  const allowedIds = new Set(nextSourceIds);
  const seen = new Set<SourceItemId>();
  const removedRankedIds: SourceItemId[] = [];
  const removedSeen = new Set<SourceItemId>();
  const nextBoard: BoardState = {};

  for (const [tierId, itemIds] of Object.entries(board)) {
    nextBoard[tierId] = [];
    for (const itemId of itemIds) {
      if (!allowedIds.has(itemId)) {
        if (!removedSeen.has(itemId)) {
          removedRankedIds.push(itemId);
          removedSeen.add(itemId);
        }
        continue;
      }
      if (seen.has(itemId)) {
        continue;
      }
      seen.add(itemId);
      nextBoard[tierId].push(itemId);
    }
  }

  return { board: nextBoard, removedRankedIds };
}

import type { MouseEvent } from "react";
import { useMemo, useState } from "react";

import type {
  BoardState,
  PackItem,
  ResolvedBoardState,
  RowMenu,
  TierRow,
} from "../lib/types";

type UseTierBoardOptions = {
  initialBoard?: BoardState;
  initialSelectedTierId?: string;
  initialTiers: TierRow[];
  maxTiers: number;
  packItems: PackItem[];
  sourceItemIds: string[];
};

export function useTierBoard({
  initialBoard,
  initialSelectedTierId,
  initialTiers,
  maxTiers,
  packItems,
  sourceItemIds,
}: UseTierBoardOptions) {
  const [tiers, setTiers] = useState(initialTiers);
  const [selectedTierId, setSelectedTierId] = useState(
    initialSelectedTierId ?? initialTiers[0]?.id ?? "",
  );
  const [rowMenu, setRowMenu] = useState<RowMenu>(null);
  const [draggedTierId, setDraggedTierId] = useState<string | null>(null);
  const [dragOverTierId, setDragOverTierId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardState>(initialBoard ?? {});
  const activeItemIds = useMemo(() => new Set(sourceItemIds), [sourceItemIds]);
  const activePackItems = useMemo(
    () => packItems.filter((item) => activeItemIds.has(item.id)),
    [activeItemIds, packItems],
  );
  const itemById = useMemo(
    () => new Map(activePackItems.map((item) => [item.id, item])),
    [activePackItems],
  );

  const rankedIds = useMemo(
    () =>
      new Set(
        Object.values(board)
          .flat()
          .map((itemId) => itemId),
      ),
    [board],
  );
  const benchItems = useMemo(
    () => activePackItems.filter((item) => !rankedIds.has(item.id)),
    [activePackItems, rankedIds],
  );
  const resolvedBoard = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(board).map(([tierId, itemIds]) => [
          tierId,
          itemIds
            .map((itemId) => itemById.get(itemId))
            .filter((item): item is PackItem => Boolean(item)),
        ]),
      ) as ResolvedBoardState,
    [board, itemById],
  );
  const selectedTierIndex = tiers.findIndex((tier) => tier.id === selectedTierId);

  function updateTierLabel(id: string, label: string) {
    setTiers((current) =>
      current.map((tier) => (tier.id === id ? { ...tier, label } : tier)),
    );
  }

  function makeTierLabel(position: number) {
    return position < 5
      ? ["S", "A", "B", "C", "D"][position]
      : `Row ${position + 1}`;
  }

  function insertTier(offset: 0 | 1) {
    if (tiers.length >= maxTiers) {
      return;
    }

    const anchorIndex =
      selectedTierIndex >= 0 ? selectedTierIndex : tiers.length - 1;
    const insertAt = anchorIndex + offset;
    const newTier: TierRow = {
      id: `tier-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label: makeTierLabel(tiers.length),
    };

    setTiers((current) => [
      ...current.slice(0, insertAt),
      newTier,
      ...current.slice(insertAt),
    ]);
    setSelectedTierId(newTier.id);
    setRowMenu(null);
  }

  function deleteSelectedTier() {
    if (tiers.length <= 1 || selectedTierIndex < 0) {
      return;
    }

    const removed = tiers[selectedTierIndex];
    const nextSelected =
      tiers[selectedTierIndex + 1] ?? tiers[selectedTierIndex - 1];
    if (!nextSelected) {
      return;
    }

    setTiers((current) => current.filter((tier) => tier.id !== removed.id));
    setBoard((current) => {
      const { [removed.id]: removedItemIds = [], ...rest } = current;
      if (removedItemIds.length > 0) {
        rest[nextSelected.id] = [
          ...(rest[nextSelected.id] ?? []),
          ...removedItemIds,
        ];
      }
      return rest;
    });
    setSelectedTierId(nextSelected.id);
    setRowMenu(null);
  }

  function openRowMenu(event: MouseEvent, tierId: string) {
    event.preventDefault();
    setSelectedTierId(tierId);
    setRowMenu({ tierId, x: event.clientX, y: event.clientY });
  }

  function closeRowMenu() {
    setRowMenu(null);
  }

  function moveDraggedTier(targetTierId: string) {
    if (!draggedTierId || draggedTierId === targetTierId) {
      return;
    }

    setTiers((current) => {
      const draggedIndex = current.findIndex(
        (tier) => tier.id === draggedTierId,
      );
      const targetIndex = current.findIndex((tier) => tier.id === targetTierId);
      if (draggedIndex < 0 || targetIndex < 0) {
        return current;
      }

      const next = [...current];
      const [dragged] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, dragged);
      return next;
    });
    setDraggedTierId(null);
    setDragOverTierId(null);
  }

  function moveItemToTier(
    itemId: string,
    targetTierId: string,
    beforeItemId?: string,
  ) {
    if (!itemById.has(itemId)) {
      return;
    }

    setBoard((current) => {
      const next: BoardState = {};
      for (const [tierId, items] of Object.entries(current)) {
        next[tierId] = items.filter((candidateId) => candidateId !== itemId);
      }

      const targetItems = [...(next[targetTierId] ?? [])];
      const insertAt = beforeItemId
        ? targetItems.findIndex((candidateId) => candidateId === beforeItemId)
        : -1;
      if (insertAt >= 0) {
        targetItems.splice(insertAt, 0, itemId);
      } else {
        targetItems.push(itemId);
      }
      next[targetTierId] = targetItems;
      return next;
    });
    setDraggedItemId(null);
    setDragOverItemId(null);
    setDragOverTierId(null);
  }

  function moveItemToBench(itemId: string) {
    setBoard((current) => {
      const next: BoardState = {};
      for (const [tierId, items] of Object.entries(current)) {
        next[tierId] = items.filter((candidateId) => candidateId !== itemId);
      }
      return next;
    });
    setDraggedItemId(null);
    setDragOverItemId(null);
    setDragOverTierId(null);
  }

  return {
    benchItems,
    board,
    closeRowMenu,
    dragOverItemId,
    dragOverTierId,
    draggedItemId,
    draggedTierId,
    insertTier,
    moveDraggedTier,
    moveItemToBench,
    moveItemToTier,
    openRowMenu,
    rowMenu,
    resolvedBoard,
    selectedTierId,
    selectedTierIndex,
    setBoard,
    setDragOverItemId,
    setDragOverTierId,
    setDraggedItemId,
    setDraggedTierId,
    setRowMenu,
    setSelectedTierId,
    setTiers,
    tiers,
    updateTierLabel,
    deleteSelectedTier,
  };
}

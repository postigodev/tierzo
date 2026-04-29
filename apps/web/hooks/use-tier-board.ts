import type { MouseEvent } from "react";
import { useMemo, useState } from "react";

import type { BoardState, PackItem, RowMenu, TierRow } from "../lib/types";

type UseTierBoardOptions = {
  initialBoard?: BoardState;
  initialSelectedTierId?: string;
  initialTiers: TierRow[];
  maxTiers: number;
  packItems: PackItem[];
};

export function useTierBoard({
  initialBoard,
  initialSelectedTierId,
  initialTiers,
  maxTiers,
  packItems,
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

  const rankedIds = useMemo(
    () =>
      new Set(
        Object.values(board)
          .flat()
          .map((item) => item.id),
      ),
    [board],
  );
  const benchItems = useMemo(
    () => packItems.filter((item) => !rankedIds.has(item.id)),
    [packItems, rankedIds],
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
      const { [removed.id]: removedItems = [], ...rest } = current;
      if (removedItems.length > 0) {
        rest[nextSelected.id] = [...(rest[nextSelected.id] ?? []), ...removedItems];
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
    const item = packItems.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }

    setBoard((current) => {
      const next: BoardState = {};
      for (const [tierId, items] of Object.entries(current)) {
        next[tierId] = items.filter((candidate) => candidate.id !== itemId);
      }

      const targetItems = [...(next[targetTierId] ?? [])];
      const insertAt = beforeItemId
        ? targetItems.findIndex((candidate) => candidate.id === beforeItemId)
        : -1;
      if (insertAt >= 0) {
        targetItems.splice(insertAt, 0, item);
      } else {
        targetItems.push(item);
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
        next[tierId] = items.filter((candidate) => candidate.id !== itemId);
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

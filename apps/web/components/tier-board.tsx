"use client";

import type { MouseEvent } from "react";

import { Card } from "./tier-card";
import type { PackItem, RowMenu, TierRow } from "../lib/types";

type BoardState = Record<string, PackItem[]>;

export function TierBoard({
  benchItems,
  board,
  deleteSelectedTier,
  dragOverItemId,
  dragOverTierId,
  draggedItemId,
  draggedTierId,
  insertTier,
  maxTiers,
  moveDraggedTier,
  moveItemToBench,
  moveItemToTier,
  onSelectTier,
  onSetDragOverItemId,
  onSetDragOverTierId,
  onSetDraggedItemId,
  onSetDraggedTierId,
  onUpdateTierLabel,
  onOpenRowMenu,
  rowMenu,
  selectedTierId,
  tiers,
}: {
  benchItems: PackItem[];
  board: BoardState;
  deleteSelectedTier: () => void;
  dragOverItemId: string | null;
  dragOverTierId: string | null;
  draggedItemId: string | null;
  draggedTierId: string | null;
  insertTier: (offset: 0 | 1) => void;
  maxTiers: number;
  moveDraggedTier: (targetTierId: string) => void;
  moveItemToBench: (itemId: string) => void;
  moveItemToTier: (
    itemId: string,
    targetTierId: string,
    beforeItemId?: string,
  ) => void;
  onOpenRowMenu: (event: MouseEvent, tierId: string) => void;
  onSelectTier: (tierId: string) => void;
  onSetDragOverItemId: (itemId: string | null) => void;
  onSetDragOverTierId: (
    value: string | null | ((current: string | null) => string | null),
  ) => void;
  onSetDraggedItemId: (itemId: string | null) => void;
  onSetDraggedTierId: (tierId: string | null) => void;
  onUpdateTierLabel: (id: string, label: string) => void;
  rowMenu: RowMenu;
  selectedTierId: string;
  tiers: TierRow[];
}) {
  return (
    <>
      <div className="board">
        {tiers.map((tier, index) => (
          <div
            className={`tier-row ${selectedTierId === tier.id ? "selected" : ""} ${draggedTierId === tier.id ? "dragging" : ""}`}
            key={tier.id}
            onClick={() => onSelectTier(tier.id)}
            onContextMenu={(event) => onOpenRowMenu(event, tier.id)}
            onDragEnter={() => onSetDragOverTierId(tier.id)}
            onDragOver={(event) => {
              event.preventDefault();
              onSetDragOverTierId(tier.id);
            }}
            onDragLeave={() =>
              onSetDragOverTierId((current) =>
                current === tier.id ? null : current,
              )
            }
            onDrop={(event) => {
              event.preventDefault();
              if (draggedItemId) {
                moveItemToTier(draggedItemId, tier.id);
                return;
              }
              moveDraggedTier(tier.id);
            }}
            data-drag-over={dragOverTierId === tier.id ? "true" : undefined}
          >
            <div className="tier-label-cell">
              <button
                aria-label={`Drag tier ${index + 1}`}
                className="row-grip"
                draggable
                type="button"
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", tier.id);
                  onSelectTier(tier.id);
                  onSetDraggedTierId(tier.id);
                }}
                onDragEnd={() => {
                  onSetDraggedTierId(null);
                  onSetDragOverTierId(null);
                }}
              />
              <div
                aria-label={`Tier ${index + 1} label`}
                className="tier-label"
                contentEditable
                role="textbox"
                spellCheck={false}
                suppressContentEditableWarning
                onFocus={() => onSelectTier(tier.id)}
                onInput={(event) => {
                  onUpdateTierLabel(
                    tier.id,
                    event.currentTarget.textContent ?? "",
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                  }
                }}
              >
                {tier.label}
              </div>
            </div>
            <div className="tier-items">
              {(board[tier.id] ?? []).map((item) => (
                <Card
                  dragOver={dragOverItemId === item.id}
                  item={item}
                  key={item.id}
                  onDragEnd={() => {
                    onSetDraggedItemId(null);
                    onSetDragOverItemId(null);
                  }}
                  onDragStart={() => onSetDraggedItemId(item.id)}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (draggedItemId) {
                      moveItemToTier(draggedItemId, tier.id, item.id);
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSetDragOverItemId(item.id);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="toolbar" aria-label="Tierzo actions">
        <strong className="row-count">
          {tiers.length}/{maxTiers}
        </strong>
      </div>

      <div className="bench">
        <div
          className="bench-items"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (draggedItemId) {
              moveItemToBench(draggedItemId);
            }
          }}
        >
          {benchItems.length > 0 ? (
            benchItems.map((item) => (
              <Card
                dragOver={dragOverItemId === item.id}
                item={item}
                key={item.id}
                onDragEnd={() => {
                  onSetDraggedItemId(null);
                  onSetDragOverItemId(null);
                }}
                onDragStart={() => onSetDraggedItemId(item.id)}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (draggedItemId) {
                    moveItemToBench(draggedItemId);
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSetDragOverItemId(item.id);
                }}
              />
            ))
          ) : (
            <span>Generated cards will land here.</span>
          )}
        </div>
      </div>

      {rowMenu ? (
        <div
          className="row-menu"
          style={{ left: rowMenu.x, top: rowMenu.y }}
          onClick={(event) => event.stopPropagation()}
          role="menu"
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => insertTier(0)}
            disabled={tiers.length >= maxTiers}
          >
            Add row above
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => insertTier(1)}
            disabled={tiers.length >= maxTiers}
          >
            Add row below
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={deleteSelectedTier}
            disabled={tiers.length <= 1}
          >
            Delete row
          </button>
        </div>
      ) : null}
    </>
  );
}

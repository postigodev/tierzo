"use client";

import Image from "next/image";
import type { DragEvent } from "react";

import { apiUrl } from "../lib/api";
import type { PackItem } from "../lib/types";

export function Card({
  dragOver,
  item,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
}: {
  dragOver?: boolean;
  item: PackItem;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragStart?: () => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
}) {
  return (
    <figure
      className={`card ${dragOver ? "drag-over" : ""}`}
      draggable
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
        onDragStart?.();
      }}
      onDrop={onDrop}
    >
      <Image
        src={apiUrl(item.image_url)}
        alt=""
        width={86}
        height={86}
        unoptimized
      />
      <figcaption>{item.name}</figcaption>
    </figure>
  );
}

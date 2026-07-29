import { apiUrl } from "./api";
import { TIER_COLORS } from "./constants";
import type { ResolvedBoardState, TierRow } from "./types";

export async function renderBoardPng({
  board,
  tiers,
  title,
}: {
  board: ResolvedBoardState;
  tiers: TierRow[];
  title: string;
}) {
  const width = 1200;
  const labelWidth = 118;
  const rowMinHeight = 132;
  const cardSize = 86;
  const cardGap = 10;
  const itemPadding = 12;
  const titleHeight = 86;
  const footerHeight = 34;
  const contentWidth = width - labelWidth;
  const cardsPerRow = Math.max(
    1,
    Math.floor(
      (contentWidth - itemPadding * 2 + cardGap) / (cardSize + cardGap),
    ),
  );
  const rowHeights = tiers.map((tier) => {
    const itemCount = board[tier.id]?.length ?? 0;
    const rows = Math.max(1, Math.ceil(itemCount / cardsPerRow));
    return Math.max(
      rowMinHeight,
      itemPadding * 2 + rows * cardSize + (rows - 1) * cardGap,
    );
  });
  const height =
    titleHeight +
    rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0) +
    footerHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas export is not available in this browser.");
  }

  context.fillStyle = "#0d0d0d";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#f6f6f6";
  context.font = "800 36px Arial, Helvetica, sans-serif";
  context.fillText(title, 28, 54);
  context.fillStyle = "rgba(255,255,255,0.34)";
  context.font = "700 15px Arial, Helvetica, sans-serif";
  context.fillText("Generated with Tierzo", 28, 76);

  let y = titleHeight;
  for (const [tierIndex, tier] of tiers.entries()) {
    const rowHeight = rowHeights[tierIndex];
    context.fillStyle = "#151515";
    context.fillRect(labelWidth, y, width - labelWidth, rowHeight);
    context.strokeStyle = "#262626";
    context.lineWidth = 1;
    context.strokeRect(labelWidth, y, width - labelWidth, rowHeight);
    context.fillStyle = TIER_COLORS[tierIndex % TIER_COLORS.length];
    context.fillRect(0, y, labelWidth, rowHeight);
    context.strokeStyle = "#050505";
    context.strokeRect(0, y, labelWidth, rowHeight);

    drawWrappedText(
      context,
      tier.label || "-",
      labelWidth / 2,
      y + rowHeight / 2,
      labelWidth - 26,
      26,
      "#000",
      "800 24px Arial, Helvetica, sans-serif",
      "center",
    );

    const items = board[tier.id] ?? [];
    for (const [itemIndex, item] of items.entries()) {
      const column = itemIndex % cardsPerRow;
      const row = Math.floor(itemIndex / cardsPerRow);
      const x = labelWidth + itemPadding + column * (cardSize + cardGap);
      const imageY = y + itemPadding + row * (cardSize + cardGap);
      const image = await loadImage(apiUrl(item.image_url));
      context.fillStyle = "#050505";
      context.fillRect(x - 2, imageY - 2, cardSize + 4, cardSize + 4);
      context.drawImage(image, x, imageY, cardSize, cardSize);
    }

    y += rowHeight;
  }

  context.fillStyle = "rgba(255,255,255,0.28)";
  context.font = "700 13px Arial, Helvetica, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText("tierzo.dev-ready export", 28, height - 14);
  return canvas.toDataURL("image/png");
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  centerY: number,
  maxWidth: number,
  lineHeight: number,
  color: string,
  font: string,
  align: CanvasTextAlign,
) {
  context.font = font;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillStyle = color;
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words.length > 0 ? words : [text]) {
    if (context.measureText(word).width > maxWidth) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }
      lines.push(...splitLongWord(context, word, maxWidth));
      continue;
    }

    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !currentLine) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  const firstY = centerY - ((lines.length - 1) * lineHeight) / 2;
  for (const [index, line] of lines.entries()) {
    context.fillText(line, x, firstY + index * lineHeight);
  }
}

function splitLongWord(
  context: CanvasRenderingContext2D,
  word: string,
  maxWidth: number,
) {
  const chunks: string[] = [];
  let currentChunk = "";
  for (const character of word) {
    const candidate = `${currentChunk}${character}`;
    if (context.measureText(candidate).width <= maxWidth || !currentChunk) {
      currentChunk = candidate;
    } else {
      chunks.push(currentChunk);
      currentChunk = character;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  return chunks;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

export function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "tierzo"
  );
}

import type { SourceItem, SourceItemId } from "#tierzo/types";

export type SourceItemIdFactory = () => SourceItemId;
export const SOURCE_ITEM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export type SourceItemRename = {
  id: SourceItemId;
  from: string;
  to: string;
};

export type SourceItemReconciliation = {
  items: SourceItem[];
  addedIds: SourceItemId[];
  removedIds: SourceItemId[];
  renames: SourceItemRename[];
  ambiguousReplacementCount: number;
};

type OccurrenceMatch = {
  oldIndex: number;
  newIndex: number;
};

type MatchCandidate = {
  pairs: OccurrenceMatch[];
  cost: number;
};

export function createSourceItemId(): SourceItemId {
  return `item-${crypto.randomUUID()}`;
}

export function isValidSourceItemId(value: string): boolean {
  return SOURCE_ITEM_ID_PATTERN.test(value);
}

export function normalizeSourceName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parseSourceText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(normalizeSourceName)
    .filter(Boolean);
}

export function sourceItemsToText(items: SourceItem[]): string {
  return items.map((item) => item.name).join("\n");
}

export function reconcileSourceItems(
  previous: SourceItem[],
  nextNamesInput: string[],
  createId: SourceItemIdFactory = createSourceItemId,
): SourceItemReconciliation {
  const nextNames = nextNamesInput.map(normalizeSourceName).filter(Boolean);
  const oldIndicesByName = groupIndices(previous.map((item) => item.name));
  const newIndicesByName = groupIndices(nextNames);
  const matchedOldByNew = new Map<number, number>();
  const matchedOld = new Set<number>();

  for (const [name, oldIndices] of oldIndicesByName) {
    const newIndices = newIndicesByName.get(name);
    if (!newIndices) {
      continue;
    }
    for (const pair of matchOccurrences(oldIndices, newIndices)) {
      matchedOldByNew.set(pair.newIndex, pair.oldIndex);
      matchedOld.add(pair.oldIndex);
    }
  }

  const unmatchedOld = previous
    .map((_, index) => index)
    .filter((index) => !matchedOld.has(index));
  const unmatchedNew = nextNames
    .map((_, index) => index)
    .filter((index) => !matchedOldByNew.has(index));
  const renames: SourceItemRename[] = [];

  if (unmatchedOld.length === 1 && unmatchedNew.length === 1) {
    const oldIndex = unmatchedOld[0];
    const newIndex = unmatchedNew[0];
    matchedOldByNew.set(newIndex, oldIndex);
    matchedOld.add(oldIndex);
    renames.push({
      id: previous[oldIndex].id,
      from: previous[oldIndex].name,
      to: nextNames[newIndex],
    });
  }

  const addedIds: SourceItemId[] = [];
  const items = nextNames.map((name, newIndex) => {
    const oldIndex = matchedOldByNew.get(newIndex);
    if (oldIndex !== undefined) {
      return { id: previous[oldIndex].id, name };
    }
    const id = createId();
    addedIds.push(id);
    return { id, name };
  });
  const removedIds = previous
    .filter((_, index) => !matchedOld.has(index))
    .map((item) => item.id);

  return {
    items,
    addedIds,
    removedIds,
    renames,
    ambiguousReplacementCount:
      unmatchedOld.length > 0 &&
      unmatchedNew.length > 0 &&
      !(unmatchedOld.length === 1 && unmatchedNew.length === 1)
        ? Math.min(unmatchedOld.length, unmatchedNew.length)
        : 0,
  };
}

function groupIndices(values: string[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  values.forEach((value, index) => {
    const normalized = normalizeSourceName(value);
    const indices = groups.get(normalized) ?? [];
    indices.push(index);
    groups.set(normalized, indices);
  });
  return groups;
}

function matchOccurrences(
  oldIndices: number[],
  newIndices: number[],
): OccurrenceMatch[] {
  const targetCount = Math.min(oldIndices.length, newIndices.length);
  const memo = new Map<string, MatchCandidate | null>();

  function visit(
    oldPosition: number,
    newPosition: number,
    remaining: number,
  ): MatchCandidate | null {
    if (remaining === 0) {
      return { pairs: [], cost: 0 };
    }
    if (
      oldIndices.length - oldPosition < remaining ||
      newIndices.length - newPosition < remaining
    ) {
      return null;
    }

    const key = `${oldPosition}:${newPosition}:${remaining}`;
    if (memo.has(key)) {
      return memo.get(key) ?? null;
    }

    const candidates: MatchCandidate[] = [];
    const matchedTail = visit(oldPosition + 1, newPosition + 1, remaining - 1);
    if (matchedTail) {
      candidates.push({
        pairs: [
          {
            oldIndex: oldIndices[oldPosition],
            newIndex: newIndices[newPosition],
          },
          ...matchedTail.pairs,
        ],
        cost:
          Math.abs(oldIndices[oldPosition] - newIndices[newPosition]) +
          matchedTail.cost,
      });
    }

    const skippedOld = visit(oldPosition + 1, newPosition, remaining);
    if (skippedOld) {
      candidates.push(skippedOld);
    }
    const skippedNew = visit(oldPosition, newPosition + 1, remaining);
    if (skippedNew) {
      candidates.push(skippedNew);
    }

    const best = candidates.sort(compareCandidates)[0] ?? null;
    memo.set(key, best);
    return best;
  }

  return visit(0, 0, targetCount)?.pairs ?? [];
}

function compareCandidates(left: MatchCandidate, right: MatchCandidate): number {
  if (left.cost !== right.cost) {
    return left.cost - right.cost;
  }
  const leftKey = left.pairs
    .map((pair) => `${pair.oldIndex}:${pair.newIndex}`)
    .join(",");
  const rightKey = right.pairs
    .map((pair) => `${pair.oldIndex}:${pair.newIndex}`)
    .join(",");
  return leftKey.localeCompare(rightKey);
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  createSourceItemId,
  isValidSourceItemId,
  parseSourceText,
  reconcileSourceItems,
  sourceItemsToText,
} from "#tierzo/source-items";
import type { SourceItem } from "#tierzo/types";

function ids(...values: string[]) {
  let index = 0;
  return () => values[index++] ?? `new-${index}`;
}

test("creates distinct browser IDs accepted by the API contract", () => {
  const first = createSourceItemId();
  const second = createSourceItemId();

  assert.equal(isValidSourceItemId(first), true);
  assert.equal(isValidSourceItemId(second), true);
  assert.notEqual(first, second);
});

test("parses and serializes normalized non-empty lines", () => {
  const names = parseSourceText("  Alpha  one\r\n\nBeta\t two ");
  assert.deepEqual(names, ["Alpha one", "Beta two"]);
  assert.equal(
    sourceItemsToText([
      { id: "a", name: names[0] },
      { id: "b", name: names[1] },
    ]),
    "Alpha one\nBeta two",
  );
});

test("preserves identity across a single rename", () => {
  const result = reconcileSourceItems(
    [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
      { id: "c", name: "Gamma" },
    ],
    ["Alpha", "Bravo", "Gamma"],
    ids("unused"),
  );

  assert.deepEqual(result.items, [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Bravo" },
    { id: "c", name: "Gamma" },
  ]);
  assert.deepEqual(result.renames, [
    { id: "b", from: "Beta", to: "Bravo" },
  ]);
  assert.deepEqual(result.addedIds, []);
  assert.deepEqual(result.removedIds, []);
});

test("preserves exact identities across reorder and handles add/remove", () => {
  const previous: SourceItem[] = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
    { id: "c", name: "Gamma" },
  ];
  const reordered = reconcileSourceItems(
    previous,
    ["Gamma", "Alpha", "Beta"],
    ids("unused"),
  );
  assert.deepEqual(
    reordered.items.map((item) => item.id),
    ["c", "a", "b"],
  );

  const changed = reconcileSourceItems(
    previous,
    ["Alpha", "Gamma", "Delta"],
    ids("d"),
  );
  assert.deepEqual(changed.items, [
    { id: "a", name: "Alpha" },
    { id: "c", name: "Gamma" },
    { id: "b", name: "Delta" },
  ]);
  assert.deepEqual(changed.renames, [
    { id: "b", from: "Beta", to: "Delta" },
  ]);
});

test("assigns additions and reports removals without disturbing exact matches", () => {
  const previous: SourceItem[] = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
  ];
  const added = reconcileSourceItems(
    previous,
    ["Alpha", "Beta", "Gamma"],
    ids("c"),
  );
  assert.deepEqual(added.items, [
    ...previous,
    { id: "c", name: "Gamma" },
  ]);
  assert.deepEqual(added.addedIds, ["c"]);

  const removed = reconcileSourceItems(previous, ["Beta"], ids("unused"));
  assert.deepEqual(removed.items, [{ id: "b", name: "Beta" }]);
  assert.deepEqual(removed.removedIds, ["a"]);
});

test("matches duplicate names by nearest position before inferring rename", () => {
  const result = reconcileSourceItems(
    [
      { id: "x-1", name: "Same" },
      { id: "x-2", name: "Same" },
    ],
    ["Renamed", "Same"],
    ids("unused"),
  );
  assert.deepEqual(result.items, [
    { id: "x-1", name: "Renamed" },
    { id: "x-2", name: "Same" },
  ]);
});

test("does not recycle identities for ambiguous many-to-many replacement", () => {
  const result = reconcileSourceItems(
    [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
    ],
    ["Charlie", "Delta", "Echo"],
    ids("c", "d", "e"),
  );
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["c", "d", "e"],
  );
  assert.deepEqual(result.removedIds, ["a", "b"]);
  assert.equal(result.ambiguousReplacementCount, 2);
});

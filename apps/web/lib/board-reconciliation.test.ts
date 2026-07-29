import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileBoard,
  selectBenchItems,
} from "#tierzo/board-reconciliation";

test("preserves tier and relative order while pruning removed IDs", () => {
  const result = reconcileBoard(
    {
      s: ["a", "b", "missing"],
      a: ["c", "b"],
    },
    ["a", "b", "c", "new"],
  );

  assert.deepEqual(result.board, {
    s: ["a", "b"],
    a: ["c"],
  });
  assert.deepEqual(result.removedRankedIds, ["missing"]);
});

test("leaves new source items on the bench", () => {
  const items = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
    { id: "c", name: "Gamma" },
  ];
  assert.deepEqual(selectBenchItems(items, { s: ["b"] }), [
    items[0],
    items[2],
  ]);
});

import assert from "node:assert/strict";
import test from "node:test";

import { migrateWorkspaceState } from "#tierzo/workspace-migration";
import type { PackItem, PackResponse } from "#tierzo/types";

function makePackItem(id: string, name: string): PackItem {
  return {
    id,
    name,
    filename: `${id}.png`,
    image_url: `/packs/p/files/${id}.png`,
    asset_kind: "text-card",
    source_type: "input",
    source_value: null,
    source_url: null,
    confidence: null,
  };
}

function makePack(items: PackItem[]): PackResponse {
  return {
    pack_id: "p",
    status: "completed",
    created_at: "2026-07-29T12:00:00Z",
    expires_at: "2026-07-29T13:00:00Z",
    title: "Pack",
    description: null,
    row_labels: ["S", "A"],
    item_count: items.length,
    items,
    manifest_url: "/manifest",
    zip_url: "/zip",
    extension_url: "/extension",
    enrichment_status: "text",
    agent_plan: null,
  };
}

function sequentialIds() {
  let index = 0;
  return () => `stable-${++index}`;
}

test("migrates legacy snapshots by ordinal ID and preserves duplicate names", () => {
  const first = makePackItem("001", "Same");
  const second = makePackItem("002", "Same");
  const result = migrateWorkspaceState(
    {
      text: "Same\nSame",
      title: "Duplicates",
      tiers: [
        { id: "s", label: "S" },
        { id: "a", label: "A" },
      ],
      board: { s: [second], a: [first] },
      pack: makePack([first, second]),
    },
    sequentialIds(),
  );

  assert.equal(result.migrated, true);
  assert.deepEqual(result.state.sourceItems, [
    { id: "001", name: "Same" },
    { id: "002", name: "Same" },
  ]);
  assert.deepEqual(result.state.board, {
    s: ["002"],
    a: ["001"],
  });
  assert.deepEqual(
    result.state.pack?.items.map((item) => item.id),
    ["001", "002"],
  );
});

test("recovers ranked orphan snapshots instead of losing user work", () => {
  const orphan = makePackItem("009", "Recovered");
  const result = migrateWorkspaceState(
    { text: "", board: { s: [orphan] }, pack: null },
    sequentialIds(),
  );

  assert.deepEqual(result.state.sourceItems, [
    { id: "009", name: "Recovered" },
  ]);
  assert.deepEqual(result.state.board, { s: ["009"] });
  assert.match(result.warnings.join(" "), /Recovered ranked item/);
});

test("keeps ranked pack items that are absent from legacy text", () => {
  const kept = makePackItem("001", "Kept");
  const ranked = makePackItem("002", "Ranked but removed from text");
  const result = migrateWorkspaceState(
    {
      text: "Kept",
      board: { s: [ranked] },
      pack: makePack([kept, ranked]),
    },
    sequentialIds(),
  );

  assert.deepEqual(result.state.sourceItems, [
    { id: "001", name: "Kept" },
    { id: "002", name: "Ranked but removed from text" },
  ]);
  assert.deepEqual(result.state.board, { s: ["002"] });
  assert.match(result.warnings.join(" "), /missing from the saved text/);
});

test("keeps the legacy pack snapshot aligned with its artifact URLs", () => {
  const result = migrateWorkspaceState(
    {
      text: "Alpha",
      pack: makePack([
        makePackItem("001", "Alpha"),
        makePackItem("002", "Beta"),
      ]),
      board: {},
    },
    sequentialIds(),
  );

  assert.deepEqual(
    result.state.sourceItems.map((item) => item.name),
    ["Alpha"],
  );
  assert.deepEqual(
    result.state.pack?.items.map((item) => item.name),
    ["Alpha", "Beta"],
  );
});

test("migrates text-only legacy state and tolerates malformed fields", () => {
  const result = migrateWorkspaceState(
    {
      text: " Alpha \n\n Beta ",
      board: "broken",
      tiers: [{ id: "s", label: "S" }, { bad: true }],
      pack: { items: [] },
    },
    sequentialIds(),
  );

  assert.deepEqual(result.state.sourceItems, [
    { id: "stable-1", name: "Alpha" },
    { id: "stable-2", name: "Beta" },
  ]);
  assert.deepEqual(result.state.board, {});
  assert.deepEqual(result.state.tiers, [{ id: "s", label: "S" }]);
  assert.equal(result.state.pack, null);
});

test("sanitizes v3 state without remigrating it", () => {
  const result = migrateWorkspaceState({
    version: 3,
    sourceItems: [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
    ],
    board: { s: ["a", "missing"], a: ["b", "a"] },
    pack: null,
    migrationWarnings: [],
  });

  assert.equal(result.migrated, false);
  assert.deepEqual(result.state.board, { s: ["a"], a: ["b"] });
  assert.match(result.warnings.join(" "), /no longer have source items/);
});

test("preserves pre-lifecycle v3 pack snapshots for validation", () => {
  const currentPack = makePack([makePackItem("a", "Alpha")]);
  const {
    status: _status,
    created_at: _createdAt,
    expires_at: _expiresAt,
    ...legacyPack
  } = currentPack;

  const result = migrateWorkspaceState({
    version: 3,
    sourceItems: [{ id: "a", name: "Alpha" }],
    board: { s: ["a"] },
    pack: legacyPack,
    migrationWarnings: [],
  });

  assert.equal(result.state.pack?.pack_id, "p");
  assert.equal(result.state.pack?.manifest_url, "/manifest");
  assert.equal(result.state.pack?.zip_url, "/zip");
  assert.equal(result.state.pack?.extension_url, "/extension");
  assert.equal(result.state.pack?.status, "completed");
  assert.equal(result.state.pack?.created_at, null);
  assert.equal(result.state.pack?.expires_at, null);
});

test("reassigns restored IDs that the API would reject", () => {
  const result = migrateWorkspaceState(
    {
      version: 3,
      sourceItems: [{ id: "bad id", name: "Alpha" }],
      board: { s: ["bad id"] },
      pack: makePack([makePackItem("bad id", "Alpha")]),
    },
    sequentialIds(),
  );

  assert.equal(result.state.sourceItems[0].id, "stable-1");
  assert.deepEqual(result.state.board, { s: ["stable-1"] });
  assert.equal(result.state.pack, null);
  assert.match(result.warnings.join(" "), /invalid source item id/);
  assert.match(result.warnings.join(" "), /artifact links/);
});

test("v2 to v3 migration is idempotent", () => {
  const legacy = {
    text: "Same\nSame",
    board: { s: [makePackItem("002", "Same")] },
    pack: makePack([
      makePackItem("001", "Same"),
      makePackItem("002", "Same"),
    ]),
  };
  const first = migrateWorkspaceState(legacy, sequentialIds());
  const second = migrateWorkspaceState(first.state, sequentialIds());

  assert.equal(first.migrated, true);
  assert.equal(second.migrated, false);
  assert.deepEqual(second.state, first.state);
});

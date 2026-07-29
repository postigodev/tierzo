# Item Identity And Reconciliation

Tierzo treats an item ID as the identity of one list entry inside a saved
workspace. It is opaque, independent from the display name, and never used as
a filename or sort key.

## Chosen Model

The canonical API path accepts structured items:

```json
{
  "items": [
    { "id": "item-550e8400-e29b-41d4-a716-446655440000", "name": "Alien" }
  ]
}
```

The web app creates an ID when an entry first appears, persists it in the
workspace, and sends it back on every regeneration. Core rendering copies that
ID into the pack manifest and TierMaker extension payload.

The existing `text` API and Python `generate_pack(["Alien"])` path remain
supported. They adapt strings to the historical positional IDs (`001`, `002`,
and so on). That path is compatible, but it cannot preserve identity across a
rename or structural edit because the caller supplied no identity.

## Reconciliation Semantics

- Exact names preserve IDs across reorder.
- A clear one-for-one line replacement is treated as a rename and preserves ID.
  The workspace reports this inference so the user can review it.
- Duplicate names have separate IDs and can be ranked or overridden independently.
- New entries receive new IDs and appear on the unranked bench after generation.
- Removed IDs are pruned from assignments deterministically.
- Regeneration preserves the tier and relative order of surviving IDs while
  replacing their generated asset metadata.
- Ambiguous many-to-many replacements do not reuse IDs silently. Tierzo assigns
  new IDs and shows a warning.

The board stores arrays of item IDs, not snapshots of generated URLs. Match
overrides are also keyed by item ID.

## Legacy Workspace Migration

Tierzo reads the previous `tierzo.editor.v2` state and writes the new version to
`tierzo.editor.v3` without deleting the legacy value. Legacy pack order and
ordinal IDs are used to remap ranked snapshots, including duplicate names.
Ranked orphan entries are recovered rather than discarded. Invalid restored IDs
are replaced before the workspace is sent to the API. Valid legacy pack
snapshots and their URLs are kept unchanged; if IDs in a restored v3 snapshot
must be repaired, its artifact links are discarded because they no longer
describe the repaired identity contract.

## Non-Goals

This model is not cross-device identity, an entity database, semantic entity
resolution, alias history, workspace merging, or recognition of an item deleted
and recreated later. With a plain textarea, some compound edits are inherently
ambiguous; Tierzo preserves only identities it can justify.

import assert from "node:assert/strict";
import test from "node:test";

import { deriveWorkspacePhase } from "./workspace-view.ts";

const baseInput = {
  artifactState: "idle" as const,
  hasError: false,
  hasPack: false,
  isGenerating: false,
  itemCount: 0,
};

test("derives the visible workspace phase from existing product state", () => {
  assert.equal(deriveWorkspacePhase(baseInput), "empty");
  assert.equal(
    deriveWorkspacePhase({ ...baseInput, itemCount: 3 }),
    "ready",
  );
  assert.equal(
    deriveWorkspacePhase({
      ...baseInput,
      hasError: true,
      itemCount: 3,
    }),
    "failed",
  );
  assert.equal(
    deriveWorkspacePhase({
      ...baseInput,
      hasError: true,
      isGenerating: true,
      itemCount: 3,
    }),
    "generating",
  );
  assert.equal(
    deriveWorkspacePhase({
      ...baseInput,
      artifactState: "completed",
      hasPack: true,
      itemCount: 3,
    }),
    "generated",
  );
  assert.equal(
    deriveWorkspacePhase({
      ...baseInput,
      artifactState: "lost",
      hasError: true,
      itemCount: 3,
    }),
    "lost",
  );
  assert.equal(
    deriveWorkspacePhase({
      ...baseInput,
      artifactState: "expired",
      itemCount: 3,
    }),
    "expired",
  );
});

test("an existing usable pack remains board-first after a later error", () => {
  assert.equal(
    deriveWorkspacePhase({
      ...baseInput,
      artifactState: "completed",
      hasError: true,
      hasPack: true,
      itemCount: 3,
    }),
    "generated",
  );
});

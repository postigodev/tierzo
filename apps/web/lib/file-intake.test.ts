import assert from "node:assert/strict";
import test from "node:test";

import {
  LatestImportCoordinator,
  parseFileIntakeError,
  parseFileIntakeResponse,
} from "./file-intake.ts";

const validResponse = {
  schema_version: "tierzo.file-intake.v1",
  filename: "movies.csv",
  format: "csv",
  items: ["Alien", "Aliens", "Alien"],
  item_count: 3,
  interpretation: "Imported the first column.",
};

test("accepts the exact file intake v1 contract", () => {
  assert.deepEqual(parseFileIntakeResponse(validResponse), validResponse);
});

test("rejects malformed and internally inconsistent file intake responses", () => {
  assert.throws(() =>
    parseFileIntakeResponse({ ...validResponse, schema_version: "future" }),
  );
  assert.throws(() =>
    parseFileIntakeResponse({ ...validResponse, item_count: 2 }),
  );
  assert.throws(() =>
    parseFileIntakeResponse({ ...validResponse, items: ["Alien", ""] }),
  );
  assert.throws(() =>
    parseFileIntakeResponse({ ...validResponse, format: "json" }),
  );
});

test("extracts structured API errors without parsing error strings", () => {
  assert.equal(
    parseFileIntakeError(
      {
        detail: {
          code: "file_too_large",
          message: "File is too large; maximum is 5 bytes.",
          limit: 5,
        },
      },
      "Fallback",
    ),
    "File is too large; maximum is 5 bytes.",
  );
  assert.equal(parseFileIntakeError({ detail: "Legacy error" }, "Fallback"), "Legacy error");
  assert.equal(parseFileIntakeError({}, "Fallback"), "Fallback");
});

test("only the latest import token can apply a response", () => {
  const coordinator = new LatestImportCoordinator();
  const first = coordinator.start();
  const second = coordinator.start();

  assert.equal(first.signal.aborted, true);
  assert.equal(coordinator.isCurrent(first.token), false);
  assert.equal(coordinator.isCurrent(second.token), true);

  coordinator.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(coordinator.isCurrent(second.token), false);
});

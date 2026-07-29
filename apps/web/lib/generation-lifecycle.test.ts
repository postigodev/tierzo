import assert from "node:assert/strict";
import test from "node:test";

import {
  canControlSavedGeneration,
  ClientContractError,
  createLatestRequestGuard,
  parseCreateJobResponse,
  parseGenerationJob,
  pollGenerationJob,
  resolveCompletedJobArtifacts,
  resolvePollingTimeout,
  RetryablePollingError,
  validateRestoredPack,
  type LifecycleClock,
} from "#tierzo/generation-lifecycle";
import type {
  GenerationJob,
  PackLifecycleResponse,
  PackResponse,
  PersistedPackSnapshot,
  SavedWorkspaceState,
} from "#tierzo/types";

class FakeClock implements LifecycleClock {
  private nextId = 1;
  private tasks = new Map<
    number,
    { callback: () => void; runAt: number }
  >();
  private time = 0;

  now = () => this.time;

  setTimeout = (callback: () => void, delayMs: number): number => {
    const id = this.nextId++;
    this.tasks.set(id, {
      callback,
      runAt: this.time + Math.max(0, delayMs),
    });
    return id;
  };

  clearTimeout = (id: unknown): void => {
    if (typeof id === "number") {
      this.tasks.delete(id);
    }
  };

  async advanceBy(delayMs: number): Promise<void> {
    const target = this.time + delayMs;
    for (;;) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.runAt <= target)
        .sort((left, right) => left[1].runAt - right[1].runAt)[0];
      if (!next) {
        break;
      }
      const [id, task] = next;
      this.tasks.delete(id);
      this.time = task.runAt;
      task.callback();
      await flushPromises();
    }
    this.time = target;
    await flushPromises();
  }
}

function makeJob(
  status: GenerationJob["status"],
  overrides: Partial<GenerationJob> = {},
): GenerationJob {
  return {
    job_id: "job-1",
    status,
    created_at: "2026-07-29T12:00:00Z",
    updated_at: "2026-07-29T12:00:01Z",
    steps: [],
    pack: null,
    pack_status: null,
    error: null,
    ...overrides,
  };
}

function makePack(overrides: Partial<PackResponse> = {}): PackResponse {
  return {
    pack_id: "pack-1",
    status: "completed",
    created_at: "2026-07-29T12:00:00Z",
    expires_at: "2026-07-29T13:00:00Z",
    title: "Pack",
    description: null,
    row_labels: ["S"],
    item_count: 0,
    items: [],
    manifest_url: "/packs/pack-1/files/manifest.json",
    zip_url: "/packs/pack-1/zip",
    extension_url: "/packs/pack-1/tiermaker-extension.json",
    enrichment_status: "text",
    agent_plan: null,
    ...overrides,
  };
}

function makeSnapshot(
  overrides: Partial<PersistedPackSnapshot> = {},
): PersistedPackSnapshot {
  return {
    ...makePack(),
    ...overrides,
  };
}

function makeLifecycle(
  status: PackLifecycleResponse["status"],
): PackLifecycleResponse {
  return {
    pack_id: "pack-1",
    status,
    created_at:
      status === "lost"
        ? null
        : status === "expired"
          ? "2026-07-29T11:00:00Z"
          : "2026-07-29T12:00:00Z",
    expires_at:
      status === "lost"
        ? null
        : status === "expired"
          ? "2026-07-29T12:10:00Z"
          : "2026-07-29T13:00:00Z",
  };
}

test("latest request guard invalidates every older response token", () => {
  const guard = createLatestRequestGuard();
  const first = guard.begin();
  assert.equal(guard.isCurrent(first), true);

  const second = guard.begin();
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);

  guard.invalidate();
  assert.equal(guard.isCurrent(second), false);
});

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("resolves polling timeout with a safe 60-second default", () => {
  assert.equal(resolvePollingTimeout(undefined), 60_000);
  assert.equal(resolvePollingTimeout(""), 60_000);
  assert.equal(resolvePollingTimeout("not-a-number"), 60_000);
  assert.equal(resolvePollingTimeout("Infinity"), 60_000);
  assert.equal(resolvePollingTimeout("0"), 60_000);
  assert.equal(resolvePollingTimeout("-1"), 60_000);
  assert.equal(resolvePollingTimeout("1250"), 1_250);
});

test("returns completed, failed, and lost server outcomes", async (t) => {
  const pack = makePack();
  const cases: Array<{
    job: GenerationJob;
    expected: "completed" | "failed" | "lost";
  }> = [
    {
      job: makeJob("completed", {
        pack,
        pack_status: "completed",
      }),
      expected: "completed",
    },
    {
      job: makeJob("failed", { error: "renderer failed" }),
      expected: "failed",
    },
    {
      job: makeJob("lost", {
        created_at: null,
        updated_at: null,
      }),
      expected: "lost",
    },
  ];

  for (const { job, expected } of cases) {
    await t.test(expected, async () => {
      const outcome = await pollGenerationJob({
        jobId: job.job_id,
        fetchJob: async () => job,
      });

      assert.equal(outcome.status, expected);
      assert.equal(outcome.jobId, "job-1");
      assert.equal("job" in outcome && outcome.job, job);
    });
  }
});

test("uses bounded exponential backoff between pending requests", async () => {
  const clock = new FakeClock();
  const delays: number[] = [];
  const originalSetTimeout = clock.setTimeout;
  clock.setTimeout = (callback, delayMs) => {
    if (delayMs <= 2_000) {
      delays.push(delayMs);
    }
    return originalSetTimeout(callback, delayMs);
  };
  let requestCount = 0;
  const poll = pollGenerationJob({
    jobId: "job-1",
    timeoutMs: 60_000,
    clock,
    fetchJob: async () => {
      requestCount += 1;
      return requestCount === 5
        ? makeJob("completed", { pack: makePack() })
        : makeJob(requestCount === 1 ? "pending" : "running");
    },
  });

  await flushPromises();
  await clock.advanceBy(500);
  await clock.advanceBy(1_000);
  await clock.advanceBy(2_000);
  await clock.advanceBy(2_000);

  assert.equal((await poll).status, "completed");
  assert.equal(requestCount, 5);
  assert.deepEqual(delays, [500, 1_000, 2_000, 2_000]);
});

test("retries a transient fetch failure with the same bounded backoff", async () => {
  const clock = new FakeClock();
  let requestCount = 0;
  const poll = pollGenerationJob({
    jobId: "job-1",
    timeoutMs: 5_000,
    clock,
    fetchJob: async () => {
      requestCount += 1;
      if (requestCount === 1) {
        throw new RetryablePollingError("temporary network failure");
      }
      return makeJob("completed", { pack: makePack() });
    },
  }).catch((error: unknown) => ({ status: "threw" as const, error }));

  await flushPromises();
  assert.equal(requestCount, 1);
  await clock.advanceBy(499);
  assert.equal(requestCount, 1);
  await clock.advanceBy(1);

  const outcome = await poll;
  assert.equal(outcome.status, "completed");
  assert.equal(requestCount, 2);
});

test("repeated fetch failures time out without a post-deadline request", async () => {
  const clock = new FakeClock();
  let requestCount = 0;
  const poll = pollGenerationJob({
    jobId: "job-1",
    timeoutMs: 3_000,
    clock,
    fetchJob: async () => {
      requestCount += 1;
      throw new RetryablePollingError("offline");
    },
  }).catch((error: unknown) => ({ status: "threw" as const, error }));

  await flushPromises();
  assert.equal(requestCount, 1);
  await clock.advanceBy(500);
  assert.equal(requestCount, 2);
  await clock.advanceBy(1_000);
  assert.equal(requestCount, 3);
  await clock.advanceBy(1_499);
  assert.equal(requestCount, 3);
  await clock.advanceBy(1);

  assert.deepEqual(await poll, {
    status: "timed_out",
    jobId: "job-1",
  });
  assert.equal(requestCount, 3);
  await clock.advanceBy(10_000);
  assert.equal(requestCount, 3);
});

test("surfaces nonretryable adapter errors without claiming server failure", async () => {
  const clock = new FakeClock();
  const adapterError = new Error("invalid job response");
  let requestCount = 0;

  await assert.rejects(
    pollGenerationJob({
      jobId: "job-1",
      timeoutMs: 3_000,
      clock,
      fetchJob: async () => {
        requestCount += 1;
        throw adapterError;
      },
    }),
    (error: unknown) => error === adapterError,
  );

  assert.equal(requestCount, 1);
  await clock.advanceBy(10_000);
  assert.equal(requestCount, 1);
});

test("times out an in-flight request exactly at the deadline", async () => {
  const clock = new FakeClock();
  let requestCount = 0;
  let observedAbort = false;
  const poll = pollGenerationJob({
    jobId: "job-1",
    timeoutMs: 1_000,
    clock,
    fetchJob: async (_jobId, signal) => {
      requestCount += 1;
      return await new Promise<GenerationJob>(() => {
        signal.addEventListener(
          "abort",
          () => {
            observedAbort = true;
          },
          { once: true },
        );
      });
    },
  });

  await flushPromises();
  await clock.advanceBy(999);
  assert.equal(observedAbort, false);
  await clock.advanceBy(1);

  assert.deepEqual(await poll, {
    status: "timed_out",
    jobId: "job-1",
  });
  assert.equal(observedAbort, true);
  assert.equal(requestCount, 1);
  await clock.advanceBy(10_000);
  assert.equal(requestCount, 1);
});

test("does not start another request at or after the deadline", async () => {
  const clock = new FakeClock();
  let requestCount = 0;
  const poll = pollGenerationJob({
    jobId: "job-1",
    timeoutMs: 500,
    clock,
    fetchJob: async () => {
      requestCount += 1;
      return makeJob("pending");
    },
  });

  await flushPromises();
  await clock.advanceBy(500);

  assert.equal((await poll).status, "timed_out");
  assert.equal(requestCount, 1);
});

test("explicit cancellation is client-only and retains the job ID", async () => {
  const controller = new AbortController();
  let observedAbort = false;
  const poll = pollGenerationJob({
    jobId: "job-1",
    signal: controller.signal,
    fetchJob: async (_jobId, signal) =>
      await new Promise<GenerationJob>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            observedAbort = true;
            reject(new Error("aborted"));
          },
          { once: true },
        );
      }),
  });

  controller.abort();

  assert.deepEqual(await poll, {
    status: "cancelled",
    jobId: "job-1",
  });
  assert.equal(observedAbort, true);
});

test("polling can resume the same job ID after cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  const seenJobIds: string[] = [];

  const cancelled = await pollGenerationJob({
    jobId: "job-1",
    signal: controller.signal,
    fetchJob: async () => {
      throw new Error("cancelled polling must not fetch");
    },
  });
  const completed = await pollGenerationJob({
    jobId: "job-1",
    fetchJob: async (jobId) => {
      seenJobIds.push(jobId);
      return makeJob("completed", { pack: makePack() });
    },
  });

  assert.equal(cancelled.status, "cancelled");
  assert.equal(completed.status, "completed");
  assert.equal(completed.jobId, cancelled.jobId);
  assert.deepEqual(seenJobIds, ["job-1"]);
});

test("local expiration skips validation fetch and invalidates the snapshot", async () => {
  const pack = makePack({ expires_at: "2026-07-29T12:30:00Z" });
  let requestCount = 0;

  const outcome = await validateRestoredPack(pack, {
    now: () => Date.parse("2026-07-29T12:30:00Z"),
    fetchPackStatus: async () => {
      requestCount += 1;
      return makeLifecycle("completed");
    },
  });

  assert.deepEqual(outcome, { status: "expired", pack: null });
  assert.equal(requestCount, 0);
});

test("untrusted expiry formats fall through to server validation", async (t) => {
  const untrustedValues: Array<string | null> = [
    null,
    "2026-07-29 12:30:00Z",
    "2026-07-29T07:30:00-05:00",
    "2026-07-29T12:30:00z",
    "2026-02-30T12:30:00Z",
  ];

  for (const expiresAt of untrustedValues) {
    await t.test(String(expiresAt), async () => {
      const pack = makeSnapshot({ expires_at: expiresAt });
      let requestCount = 0;

      const outcome = await validateRestoredPack(pack, {
        now: () => Date.parse("2026-07-29T12:30:00Z"),
        fetchPackStatus: async () => {
          requestCount += 1;
          return makeLifecycle("completed");
        },
      });

      assert.deepEqual(outcome, {
        status: "completed",
        pack: {
          ...pack,
          created_at: "2026-07-29T12:00:00Z",
          expires_at: "2026-07-29T13:00:00Z",
        },
      });
      assert.equal(requestCount, 1);
    });
  }
});

test("hydrates a legacy snapshot from trusted completed lifecycle metadata", async () => {
  const snapshot = makeSnapshot({
    created_at: null,
    expires_at: null,
  });
  const before = structuredClone(snapshot);

  const outcome = await validateRestoredPack(snapshot, {
    fetchPackStatus: async () => ({
      pack_id: "pack-1",
      status: "completed",
      created_at: "2026-07-29T12:05:00.123Z",
      expires_at: "2026-07-29T13:05:00Z",
    }),
  });

  assert.deepEqual(outcome, {
    status: "completed",
    pack: {
      ...snapshot,
      created_at: "2026-07-29T12:05:00.123Z",
      expires_at: "2026-07-29T13:05:00Z",
    },
  });
  assert.notEqual(outcome.pack, snapshot);
  assert.deepEqual(snapshot, before);
});

test("does not promote completed lifecycle metadata with untrusted timestamps", async () => {
  const snapshot = makeSnapshot({
    created_at: null,
    expires_at: null,
  });

  const outcome = await validateRestoredPack(snapshot, {
    fetchPackStatus: async () => ({
      pack_id: "pack-1",
      status: "completed",
      created_at: null,
      expires_at: "2026-07-29T13:05:00-05:00",
    }),
  });

  assert.deepEqual(outcome, {
    status: "validation_unavailable",
    pack: snapshot,
  });
});

test("requires trustworthy server evidence before accepting expired", async (t) => {
  const snapshot = makeSnapshot({
    created_at: null,
    expires_at: null,
  });
  const now = () => Date.parse("2026-07-29T12:30:00Z");
  const invalidResponses: Array<{
    name: string;
    response: PackLifecycleResponse;
  }> = [
    {
      name: "mismatched pack id",
      response: {
        ...makeLifecycle("expired"),
        pack_id: "different-pack",
      },
    },
    {
      name: "null timestamp",
      response: {
        ...makeLifecycle("expired"),
        expires_at: null,
      },
    },
    {
      name: "malformed timestamp",
      response: {
        ...makeLifecycle("expired"),
        expires_at: "2026-07-29 12:10:00Z",
      },
    },
    {
      name: "future expiration",
      response: {
        ...makeLifecycle("expired"),
        expires_at: "2026-07-29T13:00:00Z",
      },
    },
    {
      name: "created after expiration",
      response: {
        ...makeLifecycle("expired"),
        created_at: "2026-07-29T12:20:00Z",
        expires_at: "2026-07-29T12:10:00Z",
      },
    },
  ];

  for (const { name, response } of invalidResponses) {
    await t.test(name, async () => {
      const outcome = await validateRestoredPack(snapshot, {
        now,
        fetchPackStatus: async () => response,
      });
      assert.deepEqual(outcome, {
        status: "validation_unavailable",
        pack: snapshot,
      });
    });
  }

  await t.test("valid expired evidence", async () => {
    const outcome = await validateRestoredPack(snapshot, {
      now,
      fetchPackStatus: async () => makeLifecycle("expired"),
    });
    assert.deepEqual(outcome, { status: "expired", pack: null });
  });
});

test("lost must echo the requested pack id", async () => {
  const snapshot = makeSnapshot({
    created_at: null,
    expires_at: null,
  });
  const outcome = await validateRestoredPack(snapshot, {
    fetchPackStatus: async () => ({
      ...makeLifecycle("lost"),
      pack_id: "different-pack",
    }),
  });

  assert.deepEqual(outcome, {
    status: "validation_unavailable",
    pack: snapshot,
  });
});

test("unknown restored pack status preserves the snapshot", async () => {
  const snapshot = makeSnapshot({
    created_at: null,
    expires_at: null,
  });
  const outcome = await validateRestoredPack(snapshot, {
    fetchPackStatus: async () =>
      ({
        ...makeLifecycle("lost"),
        status: "unknown",
      }) as unknown as PackLifecycleResponse,
  });

  assert.deepEqual(outcome, {
    status: "validation_unavailable",
    pack: snapshot,
  });
});

test("saved job controls wait until artifact restoration settles", () => {
  const base = {
    hasGenerationJob: false,
    hasLastJobId: true,
    isGenerating: false,
    pollingState: "idle" as const,
  };

  assert.equal(
    canControlSavedGeneration({ ...base, artifactState: "checking" }),
    false,
  );
  assert.equal(
    canControlSavedGeneration({
      ...base,
      artifactState: "validation_unavailable",
    }),
    true,
  );
  assert.equal(
    canControlSavedGeneration({
      ...base,
      artifactState: "completed",
      isGenerating: true,
    }),
    false,
  );
});

test("server lifecycle responses control restored snapshots", async (t) => {
  const pack = makePack();
  for (const status of ["completed", "expired", "lost"] as const) {
    await t.test(status, async () => {
      const outcome = await validateRestoredPack(pack, {
        now: () => Date.parse("2026-07-29T12:15:00Z"),
        fetchPackStatus: async (packId) => {
          assert.equal(packId, "pack-1");
          return makeLifecycle(status);
        },
      });

      assert.deepEqual(
        outcome,
        status === "completed"
          ? { status: "completed", pack }
          : { status, pack: null },
      );
    });
  }
});

test("offline restoration preserves the exact saved workspace", async () => {
  const pack = makeSnapshot({
    created_at: null,
    expires_at: null,
  });
  const workspace: SavedWorkspaceState = {
    version: 3,
    sourceItems: [{ id: "alpha", name: "Alpha" }],
    text: "Alpha",
    title: "Still editable",
    description: "Keep this",
    preset: "arcade",
    cardStyle: null,
    enrichmentMode: "text",
    tiers: [{ id: "s", label: "S" }],
    board: { s: ["alpha"] },
    pack,
    lastJobId: "job-restore",
    migrationWarnings: ["Keep this too"],
  };
  const before = structuredClone(workspace);

  const outcome = await validateRestoredPack(pack, {
    now: () => Date.parse("2026-07-29T12:15:00Z"),
    fetchPackStatus: async () => {
      throw new TypeError("offline");
    },
  });

  assert.equal(outcome.status, "validation_unavailable");
  assert.equal(outcome.pack, pack);
  assert.deepEqual(workspace, before);
});

test("completed job artifact status prevails over a retained pack snapshot", () => {
  const pack = makePack();

  assert.deepEqual(
    resolveCompletedJobArtifacts(
      makeJob("completed", { pack, pack_status: "completed" }),
    ),
    { status: "completed", pack },
  );
  assert.deepEqual(
    resolveCompletedJobArtifacts(
      makeJob("completed", { pack, pack_status: "expired" }),
    ),
    { status: "expired", pack: null },
  );
  assert.deepEqual(
    resolveCompletedJobArtifacts(
      makeJob("completed", { pack, pack_status: "lost" }),
    ),
    { status: "lost", pack: null },
  );
});

test("validates the job creation response before use", () => {
  assert.deepEqual(
    parseCreateJobResponse({ job_id: "job-1", status: "pending" }),
    { job_id: "job-1", status: "pending" },
  );

  for (const malformed of [
    null,
    {},
    { job_id: "", status: "pending" },
    { job_id: "job-1", status: "running" },
    { job_id: 42, status: "pending" },
  ]) {
    assert.throws(
      () => parseCreateJobResponse(malformed),
      ClientContractError,
    );
  }
});

test("validates a canonical generation job before polling can mutate state", () => {
  const pack = makePack({
    item_count: 1,
    items: [
      {
        id: "alpha",
        name: "Alpha",
        filename: "alpha.png",
        image_url: "/packs/pack-1/files/alpha.png",
        asset_kind: "text",
        source_type: "text",
        source_value: null,
        source_url: null,
        confidence: null,
      },
    ],
  });
  const job = makeJob("completed", {
    steps: [
      {
        id: "render",
        label: "Render cards",
        status: "done",
        detail: null,
      },
    ],
    pack,
    pack_status: "completed",
  });

  assert.deepEqual(parseGenerationJob(job, "job-1"), job);
});

test("rejects malformed generation jobs as client contract errors", async (t) => {
  const pack = makePack();
  const valid = makeJob("completed", {
    pack,
    pack_status: "completed",
  });
  const malformedCases: Array<[string, unknown]> = [
    ["mismatched job id", { ...valid, job_id: "job-other" }],
    ["unknown status", { ...valid, status: "expired" }],
    ["non-UTC timestamp", { ...valid, updated_at: "2026-07-29T07:00:01-05:00" }],
    ["missing known timestamp", { ...valid, created_at: null }],
    ["malformed steps", { ...valid, steps: [{ id: "", label: "Render", status: "done", detail: null }] }],
    ["unknown step status", { ...valid, steps: [{ id: "render", label: "Render", status: "complete", detail: null }] }],
    ["missing pack status", { ...valid, pack_status: null }],
    ["completed artifact without pack", { ...valid, pack: null }],
    ["invalid pack timestamps", { ...valid, pack: { ...pack, expires_at: "not-a-date" } }],
    ["item count mismatch", { ...valid, pack: { ...pack, item_count: 1 } }],
    ["unsafe artifact URL", { ...valid, pack: { ...pack, zip_url: "javascript:alert(1)" } }],
    ["duplicate item IDs", {
      ...valid,
      pack: {
        ...pack,
        item_count: 2,
        items: [
          {
            id: "duplicate",
            name: "One",
            filename: "one.png",
            image_url: "/packs/pack-1/files/one.png",
            asset_kind: "text",
            source_type: "text",
            source_value: null,
            source_url: null,
            confidence: null,
          },
          {
            id: "duplicate",
            name: "Two",
            filename: "two.png",
            image_url: "/packs/pack-1/files/two.png",
            asset_kind: "text",
            source_type: "text",
            source_value: null,
            source_url: null,
            confidence: null,
          },
        ],
      },
    }],
  ];

  for (const [name, malformed] of malformedCases) {
    await t.test(name, () => {
      assert.throws(
        () => parseGenerationJob(malformed, "job-1"),
        ClientContractError,
      );
    });
  }
});

test("accepts only the canonical null shape for an unknown lost job", () => {
  const lost = makeJob("lost", {
    created_at: null,
    updated_at: null,
  });
  assert.deepEqual(parseGenerationJob(lost, "job-1"), lost);

  assert.throws(
    () =>
      parseGenerationJob(
        { ...lost, created_at: "2026-07-29T12:00:00Z" },
        "job-1",
      ),
    ClientContractError,
  );
});

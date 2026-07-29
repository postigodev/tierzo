import assert from "node:assert/strict";
import test from "node:test";

import {
  pollGenerationJob,
  resolvePollingTimeout,
  validateRestoredPack,
  type LifecycleClock,
} from "#tierzo/generation-lifecycle";
import type {
  GenerationJob,
  PackLifecycleResponse,
  PackResponse,
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
    manifest_url: "/packs/pack-1/manifest",
    zip_url: "/packs/pack-1.zip",
    extension_url: "/packs/pack-1/extension",
    enrichment_status: "text",
    agent_plan: null,
    ...overrides,
  };
}

function makeLifecycle(
  status: PackLifecycleResponse["status"],
): PackLifecycleResponse {
  return {
    pack_id: "pack-1",
    status,
    created_at: status === "lost" ? null : "2026-07-29T12:00:00Z",
    expires_at: status === "lost" ? null : "2026-07-29T13:00:00Z",
  };
}

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

test("offline restoration preserves the exact input snapshot", async () => {
  const pack = makePack();
  const workspace = {
    sourceItems: [{ id: "alpha", name: "Alpha" }],
    board: { s: ["alpha"] },
    title: "Still editable",
    pack,
  };
  const before = structuredClone(workspace);

  const outcome = await validateRestoredPack(workspace.pack, {
    now: () => Date.parse("2026-07-29T12:15:00Z"),
    fetchPackStatus: async () => {
      throw new TypeError("offline");
    },
  });

  assert.equal(outcome.status, "validation_unavailable");
  assert.equal(outcome.pack, pack);
  assert.deepEqual(workspace, before);
});

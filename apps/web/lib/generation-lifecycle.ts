import type {
  GenerationJob,
  PackLifecycleResponse,
  PackResponse,
} from "#tierzo/types";

const DEFAULT_POLL_TIMEOUT_MS = 60_000;
const INITIAL_POLL_INTERVAL_MS = 500;
const MAX_POLL_INTERVAL_MS = 2_000;

export type LifecycleClock = {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type FetchGenerationJob = (
  jobId: string,
  signal: AbortSignal,
) => Promise<GenerationJob>;

export type PollGenerationJobOptions = {
  jobId: string;
  fetchJob: FetchGenerationJob;
  signal?: AbortSignal;
  timeoutMs?: number;
  clock?: LifecycleClock;
};

export type PollOutcome =
  | {
      status: "completed" | "failed" | "lost";
      jobId: string;
      job: GenerationJob;
    }
  | {
      status: "cancelled" | "timed_out";
      jobId: string;
    };

export type FetchPackStatus = (
  packId: string,
  signal?: AbortSignal,
) => Promise<PackLifecycleResponse>;

export type ValidateRestoredPackOptions = {
  fetchPackStatus: FetchPackStatus;
  now?: () => number;
  signal?: AbortSignal;
};

export type RestoreOutcome =
  | {
      status: "completed";
      pack: PackResponse;
    }
  | {
      status: "expired" | "lost";
      pack: null;
    }
  | {
      status: "validation_unavailable";
      pack: PackResponse;
    };

const systemClock: LifecycleClock = {
  now: () => globalThis.performance.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

export function resolvePollingTimeout(raw: unknown): number {
  const timeoutMs =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number(raw)
        : Number.NaN;
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_POLL_TIMEOUT_MS;
}

export async function pollGenerationJob({
  jobId,
  fetchJob,
  signal,
  timeoutMs,
  clock = systemClock,
}: PollGenerationJobOptions): Promise<PollOutcome> {
  const deadline =
    clock.now() + resolvePollingTimeout(timeoutMs);
  let intervalMs = INITIAL_POLL_INTERVAL_MS;

  for (;;) {
    if (signal?.aborted) {
      return { status: "cancelled", jobId };
    }
    if (clock.now() >= deadline) {
      return { status: "timed_out", jobId };
    }

    const request = await fetchBeforeDeadline({
      clock,
      deadline,
      fetchJob,
      jobId,
      signal,
    });
    if (request.status !== "received") {
      return { status: request.status, jobId };
    }

    if (signal?.aborted) {
      return { status: "cancelled", jobId };
    }
    if (clock.now() >= deadline) {
      return { status: "timed_out", jobId };
    }

    const job = request.job;
    if (
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "lost"
    ) {
      return { status: job.status, jobId, job };
    }

    const waitResult = await waitBeforeNextRequest({
      clock,
      deadline,
      delayMs: intervalMs,
      signal,
    });
    if (waitResult !== "ready") {
      return { status: waitResult, jobId };
    }
    intervalMs = Math.min(intervalMs * 2, MAX_POLL_INTERVAL_MS);
  }
}

export async function validateRestoredPack(
  pack: PackResponse,
  {
    fetchPackStatus,
    now = () => Date.now(),
    signal,
  }: ValidateRestoredPackOptions,
): Promise<RestoreOutcome> {
  const expiresAt = Date.parse(pack.expires_at);
  if (Number.isFinite(expiresAt) && expiresAt <= now()) {
    return { status: "expired", pack: null };
  }

  try {
    const lifecycle = await fetchPackStatus(pack.pack_id, signal);
    if (lifecycle.status === "completed") {
      return { status: "completed", pack };
    }
    return { status: lifecycle.status, pack: null };
  } catch {
    return { status: "validation_unavailable", pack };
  }
}

async function fetchBeforeDeadline({
  clock,
  deadline,
  fetchJob,
  jobId,
  signal,
}: {
  clock: LifecycleClock;
  deadline: number;
  fetchJob: FetchGenerationJob;
  jobId: string;
  signal?: AbortSignal;
}): Promise<
  | { status: "received"; job: GenerationJob }
  | { status: "cancelled" | "timed_out" }
> {
  const requestController = new AbortController();
  let deadlineReached = false;
  let resolveBoundary:
    | ((result: { status: "cancelled" | "timed_out" }) => void)
    | undefined;
  const boundary = new Promise<{
    status: "cancelled" | "timed_out";
  }>((resolve) => {
    resolveBoundary = resolve;
  });
  const cancelRequest = () => {
    requestController.abort(signal?.reason);
    resolveBoundary?.({ status: "cancelled" });
  };
  signal?.addEventListener("abort", cancelRequest, { once: true });
  const deadlineTimer = clock.setTimeout(() => {
    deadlineReached = true;
    requestController.abort(
      new DOMException("Polling deadline reached.", "TimeoutError"),
    );
    resolveBoundary?.({ status: "timed_out" });
  }, Math.max(0, deadline - clock.now()));

  try {
    const result = await Promise.race([
      fetchJob(jobId, requestController.signal).then((job) => ({
        status: "received" as const,
        job,
      })),
      boundary,
    ]);
    if (result.status !== "received") {
      return result;
    }
    if (signal?.aborted) {
      return { status: "cancelled" };
    }
    if (deadlineReached || clock.now() >= deadline) {
      return { status: "timed_out" };
    }
    return result;
  } catch (error) {
    if (signal?.aborted) {
      return { status: "cancelled" };
    }
    if (deadlineReached || clock.now() >= deadline) {
      return { status: "timed_out" };
    }
    throw error;
  } finally {
    clock.clearTimeout(deadlineTimer);
    signal?.removeEventListener("abort", cancelRequest);
  }
}

async function waitBeforeNextRequest({
  clock,
  deadline,
  delayMs,
  signal,
}: {
  clock: LifecycleClock;
  deadline: number;
  delayMs: number;
  signal?: AbortSignal;
}): Promise<"ready" | "cancelled" | "timed_out"> {
  if (signal?.aborted) {
    return "cancelled";
  }
  const remainingMs = deadline - clock.now();
  if (remainingMs <= 0) {
    return "timed_out";
  }

  const waitMs = Math.min(delayMs, remainingMs);
  const waitResult = await new Promise<"ready" | "cancelled">((resolve) => {
    let timer: unknown;
    const cancelWait = () => {
      clock.clearTimeout(timer);
      resolve("cancelled");
    };
    signal?.addEventListener("abort", cancelWait, { once: true });
    timer = clock.setTimeout(() => {
      signal?.removeEventListener("abort", cancelWait);
      resolve("ready");
    }, waitMs);
  });

  if (waitResult === "cancelled") {
    return "cancelled";
  }
  return clock.now() >= deadline ? "timed_out" : "ready";
}

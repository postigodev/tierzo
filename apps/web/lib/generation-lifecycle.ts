import type {
  ArtifactState,
  GenerationJob,
  PackLifecycleResponse,
  PackResponse,
  PersistedPackSnapshot,
  PollingState,
} from "#tierzo/types";

const DEFAULT_POLL_TIMEOUT_MS = 60_000;
const INITIAL_POLL_INTERVAL_MS = 500;
const MAX_POLL_INTERVAL_MS = 2_000;

export class ClientContractError extends Error {
  override readonly name = "ClientContractError";

  constructor(message = "Tierzo received an invalid generation response.") {
    super(message);
  }
}

export type CreateJobResponse = {
  job_id: string;
  status: "pending";
};

export type CompletedJobArtifacts =
  | { status: "completed"; pack: PackResponse }
  | { status: "expired" | "lost"; pack: null };

export function parseCreateJobResponse(value: unknown): CreateJobResponse {
  const record = requireRecord(value);
  if (!isNonEmptyString(record.job_id) || record.status !== "pending") {
    throw new ClientContractError();
  }
  return {
    job_id: record.job_id,
    status: record.status,
  };
}

export function parseGenerationJob(
  value: unknown,
  expectedJobId: string,
): GenerationJob {
  const job = requireRecord(value);
  if (
    !isNonEmptyString(expectedJobId) ||
    job.job_id !== expectedJobId ||
    !isJobStatus(job.status) ||
    !Array.isArray(job.steps) ||
    !job.steps.every(isJobStep) ||
    !isNullableString(job.error)
  ) {
    throw new ClientContractError();
  }

  if (job.status === "lost") {
    if (
      job.created_at !== null ||
      job.updated_at !== null ||
      job.steps.length !== 0 ||
      job.pack !== null ||
      job.pack_status !== null ||
      job.error !== null
    ) {
      throw new ClientContractError();
    }
    return job as GenerationJob;
  }

  const createdAt = parseTrustedUtcTimestamp(
    typeof job.created_at === "string" ? job.created_at : null,
  );
  const updatedAt = parseTrustedUtcTimestamp(
    typeof job.updated_at === "string" ? job.updated_at : null,
  );
  if (
    createdAt === null ||
    updatedAt === null ||
    createdAt > updatedAt
  ) {
    throw new ClientContractError();
  }

  if (job.status === "completed") {
    if (
      !isPackLifecycleStatus(job.pack_status) ||
      !isCanonicalPack(job.pack) ||
      job.error !== null
    ) {
      throw new ClientContractError();
    }
  } else if (
    job.pack !== null ||
    job.pack_status !== null ||
    (job.status !== "failed" && job.error !== null)
  ) {
    throw new ClientContractError();
  }

  return job as GenerationJob;
}

export function resolveCompletedJobArtifacts(
  job: GenerationJob,
): CompletedJobArtifacts {
  if (job.status !== "completed" || job.pack === null) {
    throw new ClientContractError();
  }
  if (job.pack_status === "expired" || job.pack_status === "lost") {
    return { status: job.pack_status, pack: null };
  }
  if (job.pack_status !== "completed") {
    throw new ClientContractError();
  }
  return { status: "completed", pack: job.pack };
}

export type LatestRequestGuard = {
  begin: () => number;
  invalidate: () => void;
  isCurrent: (token: number) => boolean;
};

export function createLatestRequestGuard(): LatestRequestGuard {
  let currentToken = 0;
  return {
    begin: () => ++currentToken,
    invalidate: () => {
      currentToken += 1;
    },
    isCurrent: (token) => token === currentToken,
  };
}

export function canControlSavedGeneration({
  artifactState,
  hasGenerationJob,
  hasLastJobId,
  isGenerating,
  pollingState,
}: {
  artifactState: ArtifactState;
  hasGenerationJob: boolean;
  hasLastJobId: boolean;
  isGenerating: boolean;
  pollingState: PollingState;
}): boolean {
  if (
    artifactState === "checking" ||
    hasGenerationJob ||
    !hasLastJobId
  ) {
    return false;
  }
  if (pollingState === "polling") {
    return isGenerating;
  }
  return (
    !isGenerating &&
    (pollingState === "idle" ||
      pollingState === "cancelled" ||
      pollingState === "timed_out")
  );
}

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

/**
 * Marks a fetch-adapter failure as safe to retry. Other thrown errors surface
 * to the caller unchanged and are never converted into server job outcomes.
 */
export class RetryablePollingError extends Error {
  override readonly name = "RetryablePollingError";
}

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
      pack: PersistedPackSnapshot;
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
  const deadline = clock.now() + resolvePollingTimeout(timeoutMs);
  let intervalMs = INITIAL_POLL_INTERVAL_MS;

  for (;;) {
    if (signal?.aborted) {
      return { status: "cancelled", jobId };
    }
    if (clock.now() >= deadline) {
      return { status: "timed_out", jobId };
    }

    let request:
      | Awaited<ReturnType<typeof fetchBeforeDeadline>>
      | null = null;
    try {
      request = await fetchBeforeDeadline({
        clock,
        deadline,
        fetchJob,
        jobId,
        signal,
      });
    } catch (error) {
      if (!(error instanceof RetryablePollingError)) {
        throw error;
      }
    }

    if (request !== null) {
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
  pack: PersistedPackSnapshot,
  {
    fetchPackStatus,
    now = () => Date.now(),
    signal,
  }: ValidateRestoredPackOptions,
): Promise<RestoreOutcome> {
  const expiresAt = parseTrustedUtcTimestamp(pack.expires_at);
  if (expiresAt !== null && expiresAt <= now()) {
    return { status: "expired", pack: null };
  }

  try {
    const lifecycle = await fetchPackStatus(pack.pack_id, signal);
    if (lifecycle.pack_id !== pack.pack_id) {
      return { status: "validation_unavailable", pack };
    }
    if (lifecycle.status === "completed") {
      if (
        typeof lifecycle.created_at !== "string" ||
        typeof lifecycle.expires_at !== "string"
      ) {
        return { status: "validation_unavailable", pack };
      }
      const createdAt = parseTrustedUtcTimestamp(lifecycle.created_at);
      const expiresAt = parseTrustedUtcTimestamp(lifecycle.expires_at);
      if (
        createdAt === null ||
        expiresAt === null ||
        createdAt > expiresAt
      ) {
        return { status: "validation_unavailable", pack };
      }
      return {
        status: "completed",
        pack: {
          ...pack,
          created_at: lifecycle.created_at,
          expires_at: lifecycle.expires_at,
        },
      };
    }
    if (lifecycle.status === "expired") {
      const createdAt = parseTrustedUtcTimestamp(lifecycle.created_at);
      const expiresAt = parseTrustedUtcTimestamp(lifecycle.expires_at);
      if (
        createdAt === null ||
        expiresAt === null ||
        createdAt > expiresAt ||
        expiresAt > now()
      ) {
        return { status: "validation_unavailable", pack };
      }
      return { status: "expired", pack: null };
    }
    if (lifecycle.status === "lost") {
      return { status: "lost", pack: null };
    }
    return { status: "validation_unavailable", pack };
  } catch {
    return { status: "validation_unavailable", pack };
  }
}

function parseTrustedUtcTimestamp(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/.exec(
      value,
    );
  if (!match) {
    return null;
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw] =
    match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeapYear =
      year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return isLeapYear ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11
    ? 30
    : 31;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ClientContractError();
  }
  return value as Record<string, unknown>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isJobStatus(value: unknown): value is GenerationJob["status"] {
  return (
    value === "pending" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "lost"
  );
}

function isPackLifecycleStatus(
  value: unknown,
): value is GenerationJob["pack_status"] & string {
  return value === "completed" || value === "expired" || value === "lost";
}

function isJobStep(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const step = value as Record<string, unknown>;
  return (
    isNonEmptyString(step.id) &&
    isNonEmptyString(step.label) &&
    (step.status === "pending" ||
      step.status === "running" ||
      step.status === "done" ||
      step.status === "warning" ||
      step.status === "error") &&
    isNullableString(step.detail)
  );
}

function isCanonicalPack(value: unknown): value is PackResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const pack = value as Record<string, unknown>;
  const createdAt = parseTrustedUtcTimestamp(
    typeof pack.created_at === "string" ? pack.created_at : null,
  );
  const expiresAt = parseTrustedUtcTimestamp(
    typeof pack.expires_at === "string" ? pack.expires_at : null,
  );
  if (
    !isSafePathSegment(pack.pack_id) ||
    pack.status !== "completed" ||
    createdAt === null ||
    expiresAt === null ||
    createdAt > expiresAt ||
    typeof pack.title !== "string" ||
    !isNullableString(pack.description) ||
    !Array.isArray(pack.row_labels) ||
    !pack.row_labels.every((label) => typeof label === "string") ||
    !Number.isInteger(pack.item_count) ||
    (pack.item_count as number) < 0 ||
    !Array.isArray(pack.items) ||
    pack.item_count !== pack.items.length ||
    !pack.items.every(isPackItem) ||
    pack.manifest_url !== `/packs/${pack.pack_id}/files/manifest.json` ||
    pack.zip_url !== `/packs/${pack.pack_id}/zip` ||
    pack.extension_url !==
      `/packs/${pack.pack_id}/tiermaker-extension.json` ||
    !isNonEmptyString(pack.enrichment_status) ||
    !isAgentPlan(pack.agent_plan)
  ) {
    return false;
  }

  const itemIds = new Set<string>();
  const filenames = new Set<string>();
  for (const itemValue of pack.items) {
    const item = itemValue as Record<string, unknown>;
    if (
      itemIds.has(item.id as string) ||
      filenames.has(item.filename as string) ||
      item.image_url !==
        `/packs/${pack.pack_id}/files/${item.filename as string}`
    ) {
      return false;
    }
    itemIds.add(item.id as string);
    filenames.add(item.filename as string);
  }
  return true;
}

function isPackItem(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    isNonEmptyString(item.id) &&
    isNonEmptyString(item.name) &&
    isSafeFilename(item.filename) &&
    typeof item.image_url === "string" &&
    isNonEmptyString(item.asset_kind) &&
    isNonEmptyString(item.source_type) &&
    isNullableString(item.source_value) &&
    isNullableHttpUrl(item.source_url) &&
    (item.confidence === null ||
      (typeof item.confidence === "number" &&
        Number.isFinite(item.confidence) &&
        item.confidence >= 0 &&
        item.confidence <= 1))
  );
}

function isSafePathSegment(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    !value.includes("/") &&
    !value.includes("\\") &&
    value !== "." &&
    value !== ".."
  );
}

function isSafeFilename(value: unknown): value is string {
  return isSafePathSegment(value);
}

function isNullableHttpUrl(value: unknown): value is string | null {
  if (value === null) {
    return true;
  }
  if (
    typeof value !== "string" ||
    !/^https?:\/\//i.test(value)
  ) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function isAgentPlan(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const plan = value as Record<string, unknown>;
  return (
    isNonEmptyString(plan.domain) &&
    isNonEmptyString(plan.tool) &&
    typeof plan.confidence === "number" &&
    Number.isFinite(plan.confidence) &&
    plan.confidence >= 0 &&
    plan.confidence <= 1 &&
    isNonEmptyString(plan.source) &&
    typeof plan.cache_hit === "boolean"
  );
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

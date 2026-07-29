import { useCallback, useEffect, useRef, useState } from "react";

import { apiUrl } from "../lib/api";
import {
  ClientContractError,
  createLatestRequestGuard,
  parseCreateJobResponse,
  parseGenerationJob,
  pollGenerationJob,
  resolveCompletedJobArtifacts,
  resolvePollingTimeout,
  RetryablePollingError,
  validateRestoredPack,
} from "../lib/generation-lifecycle";
import type {
  ArtifactState,
  GenerationJob,
  MatchOverrides,
  PackLifecycleResponse,
  PackResponse,
  PersistedPackSnapshot,
  PollingState,
} from "../lib/types";

export type { ArtifactState, PollingState } from "../lib/types";

type UsePackGenerationOptions = {
  buildPayload: (overrides?: MatchOverrides) => unknown;
  initialPack?: PersistedPackSnapshot | null;
  initialLastJobId?: string | null;
  onPackGenerated?: (pack: PackResponse) => void;
  shouldShowMatchesOnGenerate?: () => boolean;
};

function responseError(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "detail" in body
  ) {
    const detail = body.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (
      typeof detail === "object" &&
      detail !== null &&
      "message" in detail &&
      typeof detail.message === "string"
    ) {
      return detail.message;
    }
  }
  return fallback;
}

async function readContractJson(
  response: Response,
  resource: string,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ClientContractError(
      `Tierzo received an invalid ${resource} response.`,
    );
  }
}

export function usePackGeneration({
  buildPayload,
  initialPack = null,
  initialLastJobId = null,
  onPackGenerated,
  shouldShowMatchesOnGenerate,
}: UsePackGenerationOptions) {
  const [pack, setPackState] = useState<PersistedPackSnapshot | null>(
    initialPack,
  );
  const [lastJobId, setLastJobId] = useState<string | null>(initialLastJobId);
  const [artifactState, setArtifactState] = useState<ArtifactState>(
    initialPack ? "checking" : "idle",
  );
  const [pollingState, setPollingState] = useState<PollingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [matchOverrides, setMatchOverrides] = useState<MatchOverrides>({});
  const [generationJob, setGenerationJob] = useState<GenerationJob | null>(
    null,
  );
  const [requestGuard] = useState(createLatestRequestGuard);
  const operationController = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const isCurrent = useCallback(
    (token: number) => mounted.current && requestGuard.isCurrent(token),
    [requestGuard],
  );

  const beginOperation = useCallback(() => {
    operationController.current?.abort();
    const controller = new AbortController();
    operationController.current = controller;
    const token = requestGuard.begin();
    return { controller, token };
  }, [requestGuard]);

  const clearOperation = useCallback(
    (controller: AbortController) => {
      if (operationController.current === controller) {
        operationController.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestGuard.invalidate();
      operationController.current?.abort();
      operationController.current = null;
    };
  }, [requestGuard]);

  useEffect(() => {
    if (!initialPack) {
      return;
    }

    const { controller, token } = beginOperation();

    void validateRestoredPack(initialPack, {
      signal: controller.signal,
      fetchPackStatus: async (packId, signal) => {
        const response = await fetch(apiUrl(`/packs/${packId}/status`), {
          signal,
        });
        if (!response.ok) {
          throw new Error("Tierzo could not validate this restored pack.");
        }
        return (await response.json()) as PackLifecycleResponse;
      },
    }).then((outcome) => {
      if (!isCurrent(token)) {
        return;
      }
      setArtifactState(outcome.status);
      if (outcome.status === "completed") {
        setPackState(outcome.pack);
      } else if (outcome.status === "expired" || outcome.status === "lost") {
        setPackState(null);
        setShowMatches(false);
      }
      clearOperation(controller);
    });

    return () => {
      if (operationController.current === controller) {
        requestGuard.invalidate();
        operationController.current = null;
        controller.abort();
      }
    };
  }, [
    beginOperation,
    clearOperation,
    initialPack,
    isCurrent,
    requestGuard,
  ]);

  const pollJob = useCallback(
    async (
      jobId: string,
      token: number,
      controller: AbortController,
    ): Promise<PackResponse | null> => {
      try {
        const outcome = await pollGenerationJob({
          jobId,
          signal: controller.signal,
          timeoutMs: resolvePollingTimeout(
            process.env.NEXT_PUBLIC_JOB_POLL_TIMEOUT_MS,
          ),
          fetchJob: async (nextJobId, signal) => {
            let response: Response;
            try {
              response = await fetch(apiUrl(`/jobs/${nextJobId}`), { signal });
            } catch (caught) {
              if (signal.aborted) {
                throw caught;
              }
              throw new RetryablePollingError(
                caught instanceof Error
                  ? caught.message
                  : "Tierzo could not reach the generation service.",
              );
            }

            if (!response.ok) {
              const body = await response.json().catch(() => null);
              throw new Error(
                responseError(body, "Tierzo lost this generation job."),
              );
            }
            const nextJob = parseGenerationJob(
              await readContractJson(response, "generation job"),
              nextJobId,
            );
            if (isCurrent(token)) {
              setGenerationJob(nextJob);
            }
            return nextJob;
          },
        });

        if (!isCurrent(token)) {
          return null;
        }

        setIsGenerating(false);
        if (outcome.status === "timed_out") {
          setPollingState("timed_out");
          return null;
        }
        if (outcome.status === "cancelled") {
          setPollingState("cancelled");
          return null;
        }
        if (!("job" in outcome)) {
          return null;
        }

        setGenerationJob(outcome.job);
        if (outcome.status === "failed") {
          setPollingState("failed");
          setError(
            outcome.job.error ?? "Tierzo could not generate this pack.",
          );
          return null;
        }
        if (outcome.status === "lost") {
          setPollingState("lost");
          return null;
        }

        setPollingState("completed");
        const artifacts = resolveCompletedJobArtifacts(outcome.job);
        if (artifacts.status !== "completed") {
          setPackState(null);
          setArtifactState(artifacts.status);
          setShowMatches(false);
          return null;
        }

        const nextPack = artifacts.pack;
        setPackState(nextPack);
        setArtifactState("completed");
        setShowMatches(shouldShowMatchesOnGenerate?.() ?? true);
        setMatchOverrides({});
        onPackGenerated?.(nextPack);
        return nextPack;
      } catch (caught) {
        if (!isCurrent(token) || controller.signal.aborted) {
          return null;
        }
        setIsGenerating(false);
        setPollingState("idle");
        setError(
          caught instanceof Error ? caught.message : "Unknown generation error.",
        );
        return null;
      } finally {
        if (isCurrent(token)) {
          clearOperation(controller);
        }
      }
    },
    [
      clearOperation,
      isCurrent,
      onPackGenerated,
      shouldShowMatchesOnGenerate,
    ],
  );

  async function generatePack(
    overrides: MatchOverrides = {},
  ): Promise<PackResponse | null> {
    const { controller, token } = beginOperation();
    setError(null);
    setPollingState("polling");
    setIsGenerating(true);
    setArtifactState((current) =>
      current === "checking" ? "validation_unavailable" : current,
    );

    try {
      const response = await fetch(apiUrl("/jobs"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(overrides)),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          responseError(body, "Tierzo could not generate this pack."),
        );
      }

      const createdJob = parseCreateJobResponse(
        await readContractJson(response, "job creation"),
      );
      if (!isCurrent(token)) {
        return null;
      }

      setLastJobId(createdJob.job_id);
      setGenerationJob({
        job_id: createdJob.job_id,
        status: createdJob.status,
        created_at: null,
        updated_at: null,
        steps: [],
        pack: null,
        pack_status: null,
        error: null,
      });
      return await pollJob(createdJob.job_id, token, controller);
    } catch (caught) {
      if (!isCurrent(token) || controller.signal.aborted) {
        return null;
      }
      setIsGenerating(false);
      setPollingState("idle");
      setError(
        caught instanceof Error ? caught.message : "Unknown generation error.",
      );
      clearOperation(controller);
      return null;
    }
  }

  function cancelPolling() {
    if (!isGenerating || !operationController.current) {
      return;
    }
    setPollingState("cancelled");
    setIsGenerating(false);
    requestGuard.invalidate();
    operationController.current.abort();
    operationController.current = null;
  }

  function resumePolling() {
    if (!lastJobId || isGenerating) {
      return;
    }
    const { controller, token } = beginOperation();
    setError(null);
    setPollingState("polling");
    setIsGenerating(true);
    void pollJob(lastJobId, token, controller);
  }

  function setPack(nextPack: PersistedPackSnapshot | null) {
    requestGuard.invalidate();
    operationController.current?.abort();
    operationController.current = null;
    setPackState(nextPack);
    setArtifactState(nextPack ? "completed" : "idle");
    setIsGenerating(false);
    setPollingState("idle");
    setGenerationJob(null);
    if (!nextPack) {
      setShowMatches(false);
    }
  }

  function updateMatchOverride(itemId: string, action: "keep" | "text") {
    setMatchOverrides((current) => {
      const next = { ...current };
      if (action === "keep") {
        delete next[itemId];
      } else {
        next[itemId] = { action: "text" };
      }
      return next;
    });
  }

  function applyMatchOverrides() {
    void generatePack(matchOverrides);
  }

  function retainMatchOverrides(itemIds: string[]) {
    const validIds = new Set(itemIds);
    setMatchOverrides((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([itemId]) => validIds.has(itemId)),
      ),
    );
  }

  return {
    applyMatchOverrides,
    artifactState,
    cancelPolling,
    error,
    generatePack,
    generationJob,
    isGenerating,
    lastJobId,
    matchOverrides,
    pack,
    pollingState,
    resumePolling,
    retainMatchOverrides,
    setError,
    setPack,
    setShowMatches,
    showMatches,
    updateMatchOverride,
  };
}

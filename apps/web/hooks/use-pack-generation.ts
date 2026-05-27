import { useState } from "react";

import { apiUrl } from "../lib/api";
import type { GenerationJob, MatchOverrides, PackResponse } from "../lib/types";

type UsePackGenerationOptions = {
  buildPayload: (overrides?: MatchOverrides) => unknown;
  initialPack?: PackResponse | null;
  onPackGenerated?: (pack: PackResponse) => void;
  shouldShowMatchesOnGenerate?: () => boolean;
};

export function usePackGeneration({
  buildPayload,
  initialPack = null,
  onPackGenerated,
  shouldShowMatchesOnGenerate,
}: UsePackGenerationOptions) {
  const [pack, setPack] = useState<PackResponse | null>(initialPack);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [matchOverrides, setMatchOverrides] = useState<MatchOverrides>({});
  const [generationJob, setGenerationJob] = useState<GenerationJob | null>(
    null,
  );

  async function pollGenerationJob(jobId: string) {
    for (;;) {
      const response = await fetch(apiUrl(`/jobs/${jobId}`));
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? "Tierzo lost this generation job.");
      }

      const nextJob = (await response.json()) as GenerationJob;
      setGenerationJob(nextJob);

      if (nextJob.status === "completed" && nextJob.pack) {
        return nextJob.pack;
      }

      if (nextJob.status === "failed") {
        throw new Error(nextJob.error ?? "Tierzo could not generate this pack.");
      }

      await new Promise((resolve) => window.setTimeout(resolve, 650));
    }
  }

  async function generatePack(overrides: MatchOverrides = {}) {
    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch(apiUrl("/jobs"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(overrides)),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? "Tierzo could not generate this pack.");
      }

      const createdJob = (await response.json()) as {
        job_id: string;
        status: GenerationJob["status"];
      };
      setGenerationJob({
        job_id: createdJob.job_id,
        status: createdJob.status,
        steps: [],
        pack: null,
        error: null,
      });

      const nextPack = await pollGenerationJob(createdJob.job_id);
      setPack(nextPack);
      setShowMatches(shouldShowMatchesOnGenerate?.() ?? true);
      setMatchOverrides({});
      onPackGenerated?.(nextPack);
      return nextPack;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unknown generation error.",
      );
      return null;
    } finally {
      setIsGenerating(false);
    }
  }

  function updateMatchOverride(
    itemName: string,
    action: "keep" | "text" | "image_url",
    value?: string,
  ) {
    setMatchOverrides((current) => {
      const next = { ...current };
      if (action === "keep") {
        delete next[itemName];
      } else if (action === "text") {
        next[itemName] = "text";
      } else if (value?.trim()) {
        next[itemName] = `image_url:${value.trim()}`;
      }
      return next;
    });
  }

  function applyMatchOverrides() {
    void generatePack(matchOverrides);
  }

  return {
    applyMatchOverrides,
    error,
    generatePack,
    generationJob,
    isGenerating,
    matchOverrides,
    pack,
    setError,
    setPack,
    setShowMatches,
    showMatches,
    updateMatchOverride,
  };
}

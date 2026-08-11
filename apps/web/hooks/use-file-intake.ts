"use client";

import { useEffect, useRef, useState } from "react";

import { apiUrl } from "../lib/api";
import {
  LatestImportCoordinator,
  parseFileIntakeError,
  parseFileIntakeResponse,
  type FileIntakeResponse,
} from "../lib/file-intake";

const FALLBACK_ERROR = "Tierzo could not import that file.";

export function useFileIntake() {
  const coordinator = useRef<LatestImportCoordinator | null>(null);
  if (coordinator.current === null) {
    coordinator.current = new LatestImportCoordinator();
  }
  const [isImporting, setIsImporting] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      coordinator.current?.cancel();
    },
    [],
  );

  async function importFile(file: File): Promise<FileIntakeResponse | null> {
    const request = coordinator.current!.start();
    setIsImporting(true);
    setSummary(null);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(apiUrl("/intakes/files"), {
        method: "POST",
        body: form,
        signal: request.signal,
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new Error(FALLBACK_ERROR);
      }
      if (!response.ok) {
        throw new Error(parseFileIntakeError(body, FALLBACK_ERROR));
      }
      const intake = parseFileIntakeResponse(body);
      if (!coordinator.current?.isCurrent(request.token)) {
        return null;
      }
      setSummary(
        `Imported ${intake.item_count} item${intake.item_count === 1 ? "" : "s"} from ${intake.filename}. ${intake.interpretation}`,
      );
      return intake;
    } catch (caught) {
      if (
        request.signal.aborted ||
        !coordinator.current?.isCurrent(request.token)
      ) {
        return null;
      }
      setError(caught instanceof Error ? caught.message : FALLBACK_ERROR);
      return null;
    } finally {
      if (coordinator.current?.isCurrent(request.token)) {
        setIsImporting(false);
      }
    }
  }

  function clearFeedback() {
    setSummary(null);
    setError(null);
  }

  return {
    clearFeedback,
    error,
    importFile,
    isImporting,
    summary,
  };
}

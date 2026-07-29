"use client";

import { useEffect, useState } from "react";

import { apiUrl } from "../lib/api";
import {
  parseCapabilities,
  unavailableCapabilities,
} from "../lib/capabilities";
import type { CapabilitiesResponse } from "../lib/types";

export type CapabilityState = "loading" | "ready" | "unavailable";

export function useCapabilities(): {
  capabilities: CapabilitiesResponse;
  state: CapabilityState;
} {
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse>(
    unavailableCapabilities,
  );
  const [state, setState] = useState<CapabilityState>("loading");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCapabilities() {
      try {
        const response = await fetch(apiUrl("/capabilities"), {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Capability discovery failed.");
        }
        const body = await response.json();
        setCapabilities(parseCapabilities(body));
        setState("ready");
      } catch (caught) {
        if (controller.signal.aborted) {
          return;
        }
        setCapabilities(unavailableCapabilities);
        setState("unavailable");
      }
    }

    void loadCapabilities();
    return () => controller.abort();
  }, []);

  return { capabilities, state };
}

import type { ArtifactState } from "./types";

export type WorkspacePhase =
  | "empty"
  | "ready"
  | "generating"
  | "failed"
  | "generated"
  | "lost"
  | "expired";

export function deriveWorkspacePhase({
  artifactState,
  hasError,
  hasPack,
  isGenerating,
  itemCount,
}: {
  artifactState: ArtifactState;
  hasError: boolean;
  hasPack: boolean;
  isGenerating: boolean;
  itemCount: number;
}): WorkspacePhase {
  if (isGenerating) {
    return "generating";
  }
  if (artifactState === "lost" || artifactState === "expired") {
    return artifactState;
  }
  if (artifactState === "completed" && hasPack) {
    return "generated";
  }
  if (hasError) {
    return "failed";
  }
  return itemCount > 0 ? "ready" : "empty";
}

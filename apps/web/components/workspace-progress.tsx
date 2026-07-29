import type { WorkspacePhase } from "../lib/workspace-view";

const STEPS = ["Input", "Generate", "Rank", "Export"] as const;

function activeStep(phase: WorkspacePhase): number {
  if (phase === "empty" || phase === "ready" || phase === "failed") {
    return 0;
  }
  if (phase === "generating") {
    return 1;
  }
  return 2;
}

export function WorkspaceProgress({ phase }: { phase: WorkspacePhase }) {
  const currentStep = activeStep(phase);

  return (
    <ol className="workspace-progress" aria-label="Tier pack progress">
      {STEPS.map((step, index) => (
        <li
          className={
            index < currentStep
              ? "complete"
              : index === currentStep
                ? "active"
                : ""
          }
          key={step}
        >
          <span aria-hidden="true">{index < currentStep ? "✓" : index + 1}</span>
          {step}
        </li>
      ))}
    </ol>
  );
}

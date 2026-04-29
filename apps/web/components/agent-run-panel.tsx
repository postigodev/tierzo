"use client";

import { formatJobStatus, formatStepIcon } from "../lib/formatters";
import type { GenerationJob } from "../lib/types";

export function AgentRunPanel({ job }: { job: GenerationJob }) {
  const steps = job.steps.length > 0 ? job.steps : [];

  return (
    <section className="agent-run" aria-live="polite">
      <div className="agent-run-head">
        <div>
          <strong>Tierzo is building your pack</strong>
          <span>{formatJobStatus(job.status)}</span>
        </div>
        <span className="agent-run-loop" aria-hidden="true">
          {"\u21bb"}
        </span>
      </div>
      <ol className="agent-run-steps">
        {steps.length > 0 ? (
          steps.map((step) => (
            <li className={`agent-step ${step.status}`} key={step.id}>
              <span className="agent-step-icon" aria-hidden="true">
                {formatStepIcon(step.status)}
              </span>
              <span>
                <strong>{step.label}</strong>
                {step.detail ? <small>{step.detail}</small> : null}
              </span>
            </li>
          ))
        ) : (
          <li className="agent-step running">
            <span className="agent-step-icon" aria-hidden="true">
              {"\u21bb"}
            </span>
            <span>
              <strong>Queued generation</strong>
              <small>Preparing the run...</small>
            </span>
          </li>
        )}
      </ol>
    </section>
  );
}

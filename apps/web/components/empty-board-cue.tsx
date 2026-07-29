import type { TierRow } from "../lib/types";

export function EmptyBoardCue({ tiers }: { tiers: TierRow[] }) {
  const visibleTiers = tiers.slice(0, 3);

  return (
    <div className="empty-board-cue" aria-hidden="true">
      <div className="empty-board-copy">
        <strong>Your board is ready for a pack</strong>
        <span>Generated cards will land on the bench for ranking.</span>
      </div>
      <div className="empty-board-rows">
        {visibleTiers.map((tier, index) => (
          <div className="empty-board-row" key={tier.id}>
            <b data-tier-index={index}>{tier.label || "-"}</b>
            <span>{index === 0 ? "Cards arrive after generation" : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

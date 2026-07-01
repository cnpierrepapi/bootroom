// Stage-1 settlement: resolve a goals-market punt to hit/miss/push from the
// fixture's FINAL goals (the scores feed / br_fixtures). This scores the strat
// immediately at full time; the on-chain validate_stat proof (Stage 2, the cron)
// runs later when the daily Merkle root posts and only then unlocks withdrawal.
import { settlePick, type MarketKind, type Pick } from "./markets";

// The subset of a br_punts row Stage-1 settlement needs.
export type PuntRow = {
  id: number;
  market: MarketKind;
  line: number | string | null;
  pick: Pick;
  resolved: "hit" | "miss" | "push" | null;
};

export type Resolution = { puntId: number; resolved: "hit" | "miss" | "push" };

// Resolve one punt against the fixture's final goals (p1g, p2g).
export function resolvePunt(p: PuntRow, p1g: number, p2g: number): Resolution {
  const line = p.line == null ? null : Number(p.line);
  return { puntId: p.id, resolved: settlePick(p.market, line, p.pick, p1g, p2g) };
}

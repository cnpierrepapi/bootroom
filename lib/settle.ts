// Settlement resolution: turn a punt into a hit/miss + observed count + a proof,
// from the captured replay feed (Phase-1 ground truth). resolveLink already
// produces the proof in the shape validate_stat will fill in Phase 2 (statKeys +
// receipt), so this code does not change when we go live on the on-chain feed.
import { resolveLink, type Prop } from "./props";
import { fixtureById, type StatKind } from "./replay";
import type { Scope, Side } from "./props";

// The subset of a br_punts row settlement needs.
export type PuntRow = {
  id: number;
  fixture_id: number;
  side: Side;
  team_code: string | null;
  stat: StatKind;
  threshold: number;
  scope: Scope;
  resolved: "hit" | "miss" | null;
};

export type Resolution = {
  puntId: number;
  resolved: "hit" | "miss";
  observed: number;
  proof: ReturnType<typeof resolveLink>["proof"];
};

// Resolve one punt against the feed. Returns null if the fixture isn't in the
// feed (can't settle it) — br_finalize_strat then treats it as a non-contributor.
export function resolvePunt(p: PuntRow): Resolution | null {
  if (!fixtureById(p.fixture_id)) return null;
  const prop: Prop = {
    fixtureId: p.fixture_id, side: p.side, teamCode: p.team_code ?? "",
    stat: p.stat, n: p.threshold, scope: p.scope,
  };
  const { hit, observed, proof } = resolveLink(prop);
  return { puntId: p.id, resolved: hit ? "hit" : "miss", observed, proof };
}

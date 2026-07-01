// Strat domain: the shared vocabulary between the server routes and the UI.
// The DATABASE is the source of truth for scoring and BOOTS gating (see the
// br_* RPCs in supabase/migrations). The helpers here are PURE mirrors used for
// optimistic display only — never for settlement.
import type { Scope, Side } from "./props";
import type { StatKind } from "./replay";

// A strat is up to 3 free punts; the 4th+ costs 500 BOOTS (enforced in br_add_punt).
export const FREE_PUNTS = 3;
export const EXTRA_PUNT_BOOTS = 500;

// One punt (row shape mirrors public.br_punts, camelCased for the client).
export type Punt = {
  id: number;
  slot: number;
  fixtureId: number;
  side: Side;
  teamCode: string | null;
  stat: StatKind;
  threshold: number;
  scope: Scope;
  odds: number;          // frozen TxLINE decimal odds, snapshotted at add-time
  bootsPaid: number;     // 0 for slots 1-3, 500 for extras
  resolved: "hit" | "miss" | null;
  observed: number | null;
};

// A user's single strat for a given day (mirrors public.br_strats + its punts).
export type Strat = {
  id: number;
  deviceId: string;
  gameDay: string;       // YYYY-MM-DD
  score: number;         // final signed-odds score, floored 0 (0 until settled)
  settled: boolean;
  punts: Punt[];
};

// The competition day a strat belongs to (UTC). Matches the game_day the reward
// pool is keyed on, so "today's strat" and "today's pool" line up.
export function todayGameDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Optimistic score mirror of br_finalize_strat: SUM(win odds) - SUM(lose odds),
// FLOORED at 0. Unresolved punts contribute nothing. Rounded to 4dp like the DB.
export function scoreStrat(punts: Pick<Punt, "odds" | "resolved">[]): number {
  const raw = punts.reduce((acc, p) => {
    if (p.resolved === "hit") return acc + p.odds;
    if (p.resolved === "miss") return acc - p.odds;
    return acc;
  }, 0);
  return Math.max(0, Math.round(raw * 1e4) / 1e4);
}

// The BOOTS cost to add the next punt at a given current punt count.
export function nextPuntCost(currentCount: number): number {
  return currentCount >= FREE_PUNTS ? EXTRA_PUNT_BOOTS : 0;
}

// Map a raw br_punts row (snake_case from PostgREST) into a Punt.
export function rowToPunt(r: {
  id: number; slot: number; fixture_id: number; side: Side; team_code: string | null;
  stat: StatKind; threshold: number; scope: Scope; odds: number | string; boots_paid: number;
  resolved: "hit" | "miss" | null; observed: number | null;
}): Punt {
  return {
    id: r.id, slot: r.slot, fixtureId: r.fixture_id, side: r.side, teamCode: r.team_code,
    stat: r.stat, threshold: r.threshold, scope: r.scope, odds: Number(r.odds),
    bootsPaid: r.boots_paid, resolved: r.resolved, observed: r.observed,
  };
}

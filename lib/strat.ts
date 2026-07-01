// Strat domain: the shared vocabulary between the server routes and the UI.
// The DATABASE is the source of truth for pricing (br_add_punt reads the real
// br_odds book), scoring, and BOOTS gating. The helpers here are PURE mirrors for
// optimistic display only — never for settlement.
import type { MarketKind, Pick as MarketPick } from "./markets";

// A strat is up to 3 free punts; the 4th+ costs 500 BOOTS (enforced in br_add_punt).
export const FREE_PUNTS = 3;
export const EXTRA_PUNT_BOOTS = 500;

// One punt on a goals market (mirrors public.br_punts, camelCased for the client).
export type Punt = {
  id: number;
  slot: number;
  fixtureId: number;
  market: MarketKind;
  line: number | null;       // e.g. 2.5, -0.5; null for 1X2
  pick: MarketPick;           // over/under | part1/part2 | home/draw/away
  odds: number;              // frozen demargined decimal odds at add-time
  bootsPaid: number;         // 0 for slots 1-3, 500 for extras
  resolved: "hit" | "miss" | "push" | null;
  proofStatus: "pending" | "verified" | "unprovable";
  proofTx: string | null;    // landed validate_stat tx (explorer receipt) once verified
};

// A user's single strat for a given day (mirrors public.br_strats + its punts).
export type Strat = {
  id: number;
  deviceId: string;
  gameDay: string;           // YYYY-MM-DD
  score: number;             // signed-odds score, floored 0 (0 until settled)
  settled: boolean;
  punts: Punt[];
};

// The competition day a strat belongs to (UTC), keyed to the reward pool's day.
export function todayGameDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Optimistic score mirror of br_finalize_strat: SUM(win odds) - SUM(lose odds),
// FLOORED at 0. Unresolved and pushed punts contribute nothing. Rounded to 4dp.
export function scoreStrat(punts: Pick<Punt, "odds" | "resolved">[]): number {
  const raw = punts.reduce((acc, p) => {
    if (p.resolved === "hit") return acc + p.odds;
    if (p.resolved === "miss") return acc - p.odds;
    return acc;                                  // push / unresolved = 0
  }, 0);
  return Math.max(0, Math.round(raw * 1e4) / 1e4);
}

// The BOOTS cost to add the next punt at a given current punt count.
export function nextPuntCost(currentCount: number): number {
  return currentCount >= FREE_PUNTS ? EXTRA_PUNT_BOOTS : 0;
}

// Map a raw br_punts row (snake_case from PostgREST) into a Punt.
export function rowToPunt(r: {
  id: number; slot: number; fixture_id: number; market: MarketKind; line: number | string | null;
  pick: MarketPick; odds: number | string; boots_paid: number;
  resolved: "hit" | "miss" | "push" | null; proof_status: "pending" | "verified" | "unprovable";
  proof_tx: string | null;
}): Punt {
  return {
    id: r.id, slot: r.slot, fixtureId: r.fixture_id, market: r.market,
    line: r.line == null ? null : Number(r.line), pick: r.pick, odds: Number(r.odds),
    bootsPaid: r.boots_paid, resolved: r.resolved, proofStatus: r.proof_status, proofTx: r.proof_tx,
  };
}

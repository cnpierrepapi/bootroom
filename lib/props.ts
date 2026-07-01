// ── Prop grammar + link weighting + resolution ──
// A LINK is one predicate over a TxLINE on-chain stat. Vocabulary is restricted
// to the 8 anchored stats so every link is provable via `validate_stat`.

import { REPLAY, fixtureById, fixtureLabel, countStat, statKey, type StatKind, type Period } from "./replay";

export type Scope = "1H" | "2H" | "FT";
export type Side = "home" | "away";

export type Prop = {
  fixtureId: number;
  side: Side; // resolved relative to the fixture
  teamCode: string; // the team this prop is about (for display)
  stat: StatKind;
  n: number; // threshold ("at least n")
  scope: Scope;
};

export const STAT_LABEL: Record<StatKind, string> = {
  goal: "goals",
  corner: "corners",
  yellow: "yellow cards",
  red: "red cards",
};

export function propLabel(p: Prop): string {
  return `${p.teamCode} ${STAT_LABEL[p.stat]} ≥ ${p.n} · ${p.scope}`;
}

// Each fixture exposes both teams as pickable subjects.
export type Subject = { fixtureId: number; fixtureLabel: string; side: Side; teamCode: string };
export function subjects(): Subject[] {
  const out: Subject[] = [];
  for (const f of REPLAY) {
    out.push({ fixtureId: f.fixtureId, fixtureLabel: fixtureLabel(f), side: "home", teamCode: f.home });
    out.push({ fixtureId: f.fixtureId, fixtureLabel: fixtureLabel(f), side: "away", teamCode: f.away });
  }
  return out;
}

// ── Implied probability (Phase-1 stub) ──
// Replaced in Phase 2 by the live TxLINE ODDS feed read at add-time. Base rates
// are rough per-team-per-match priors, discounted for a half and for harder
// thresholds, so a longshot ("a red card") is worth more than a near-certainty.
const BASE_RATE: Record<StatKind, number> = { goal: 0.78, corner: 0.92, yellow: 0.9, red: 0.13 };
const STEP: Record<StatKind, number> = { goal: 0.45, corner: 0.16, yellow: 0.5, red: 0.6 };

export function impliedProb(p: Prop): number {
  let prob = BASE_RATE[p.stat];
  for (let k = 1; k < p.n; k++) prob *= STEP[p.stat]; // each extra unit is less likely
  if (p.scope !== "FT") prob *= 0.55; // a single half is less likely than full-time
  return Math.min(0.97, Math.max(0.02, prob));
}

// Longshot bonus: rarer predictions carry more points.
export function weight(p: Prop): number {
  return Math.round((1 / impliedProb(p)) * 100) / 100;
}

// ── Resolution (Phase 1 = replay; Phase 2 = validate_stat) ──
export type Proof = {
  fixtureId: number;
  statKeys: number[]; // (period*1000)+base — what validate_stat would prove
  observed: number;
  threshold: number;
  // Phase 1: a synthetic receipt hash. Phase 2: the real Merkle proof root.
  receipt: string;
};

export function resolveLink(p: Prop): { hit: boolean; observed: number; proof: Proof } {
  const f = fixtureById(p.fixtureId)!;
  const observed = countStat(f, p.side, p.stat, p.scope);
  const hit = observed >= p.n;
  const periods: Period[] = p.scope === "FT" ? ["1H", "2H"] : [p.scope];
  const statKeys = periods.map((per) => statKey(p.stat, p.side, per));
  const receipt = `rcpt_${p.fixtureId}_${statKeys.join("-")}_v${observed}`;
  return { hit, observed, proof: { fixtureId: p.fixtureId, statKeys, observed, threshold: p.n, receipt } };
}

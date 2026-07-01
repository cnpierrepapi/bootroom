// ── Captured matchday replay (Phase 1 ground truth) ──
// A deterministic, final stat line for one matchday, shaped like what TxLINE
// anchors on-chain: the 8 stats (goals / corners / yellow / red, per side),
// split by period (1H / 2H) so period-scoped props resolve cleanly.
//
// In Phase 2 this object is REPLACED by live reads of `scores/snapshot/{fid}`
// and each value is confirmed with a `validate_stat` Merkle proof. The shape is
// kept identical so the resolver code does not change when we go live.

export type StatKind = "goal" | "corner" | "yellow" | "red";
export type Period = "1H" | "2H";

// statKey encoding mirrors TxLINE: (period*1000) + base, base 1..8.
// base: 1/2 goals, 3/4 yellow, 5/6 red, 7/8 corner  (odd = home, even = away)
const BASE: Record<StatKind, number> = { goal: 1, yellow: 3, red: 5, corner: 7 };
export function statKey(stat: StatKind, side: "home" | "away", period: Period): number {
  const periodIdx = period === "1H" ? 1 : 2;
  return periodIdx * 1000 + BASE[stat] + (side === "away" ? 1 : 0);
}

type SideLine = Record<StatKind, Record<Period, number>>;
export type Fixture = {
  fixtureId: number;
  home: string; // team code
  away: string;
  home_line: SideLine;
  away_line: SideLine;
};

const line = (g: [number, number], c: [number, number], y: [number, number], r: [number, number]): SideLine => ({
  goal: { "1H": g[0], "2H": g[1] },
  corner: { "1H": c[0], "2H": c[1] },
  yellow: { "1H": y[0], "2H": y[1] },
  red: { "1H": r[0], "2H": r[1] },
});

// One matchday, three fixtures. Final lines are fixed (a "captured" result).
export const REPLAY: Fixture[] = [
  {
    fixtureId: 7201,
    home: "BRA",
    away: "JPN",
    //          goals    corners   yellow    red
    home_line: line([1, 2], [4, 3], [1, 0], [0, 0]), // BRA 3, 7 corners, 1 yellow
    away_line: line([0, 1], [2, 1], [1, 1], [0, 1]), // JPN 1, 3 corners, 2 yellow, 1 red (2H)
  },
  {
    fixtureId: 7202,
    home: "GER",
    away: "ESP",
    home_line: line([0, 1], [3, 4], [2, 1], [0, 0]), // GER 1, 7 corners, 3 yellow
    away_line: line([1, 1], [2, 3], [0, 1], [0, 0]), // ESP 2, 5 corners, 1 yellow
  },
  {
    fixtureId: 7203,
    home: "ENG",
    away: "FRA",
    home_line: line([0, 0], [1, 2], [1, 1], [0, 0]), // ENG 0, 3 corners, 2 yellow
    away_line: line([1, 1], [3, 2], [0, 0], [0, 0]), // FRA 2, 5 corners
  },
];

export const fixtureById = (id: number) => REPLAY.find((f) => f.fixtureId === id);
export const fixtureLabel = (f: Fixture) => `${f.home} v ${f.away}`;

// Count for one side/stat over a scope (sum periods for FT).
export function countStat(f: Fixture, side: "home" | "away", stat: StatKind, scope: "1H" | "2H" | "FT"): number {
  const sl = side === "home" ? f.home_line : f.away_line;
  if (scope === "FT") return sl[stat]["1H"] + sl[stat]["2H"];
  return sl[stat][scope];
}

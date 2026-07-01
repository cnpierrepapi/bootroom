// Goals-only market model — the ONLY markets TxLINE's demargined book prices
// (OVERUNDER / ASIANHANDICAP / 1X2, all on goals). Corners/cards carry no odds
// anywhere in the feed, so Bootroom punts live entirely on goals markets. Every
// one of these settles from the two on-chain goals stats (key 1 = P1, key 2 = P2)
// via validate_stat, so a punt is both fairly priced AND on-chain provable.

export type MarketKind = "OU" | "AH" | "1X2";

// A pick within a market. OU: over/under (match total). AH: part1/part2 (P1
// handicap). 1X2: home/draw/away (match result).
export type Pick = "over" | "under" | "part1" | "part2" | "home" | "draw" | "away";

export const MARKET_LABEL: Record<MarketKind, string> = {
  OU: "Total goals", AH: "Handicap", "1X2": "Match result",
};

// Map a TxLINE SuperOddsType to our kind (null = a market we don't offer).
export function kindOf(superOddsType: string): MarketKind | null {
  if (superOddsType.startsWith("OVERUNDER")) return "OU";
  if (superOddsType.startsWith("ASIANHANDICAP")) return "AH";
  if (superOddsType.startsWith("1X2")) return "1X2";
  return null;
}

// Parse "line=2.25" → 2.25 (null when absent, e.g. 1X2).
export function parseLine(marketParameters: string | null): number | null {
  if (!marketParameters) return null;
  const m = /line=(-?\d+(?:\.\d+)?)/.exec(marketParameters);
  return m ? Number(m[1]) : null;
}

// Normalise a raw TxLINE PriceName to our Pick vocabulary. 1X2 arrives as
// part1/draw/part2 → home/draw/away; OU and AH names pass through.
export function normalizePick(kind: MarketKind, priceName: string): Pick {
  if (kind === "1X2") {
    if (priceName === "part1") return "home";
    if (priceName === "part2") return "away";
    return "draw";
  }
  return priceName as Pick;
}

// One priced market snapshot at a moment in time. `prices` maps each pick to its
// decimal odds (TxLINE Prices are integers ×1000 → 1957 = 1.957).
export type OddsSnapshot = {
  fixtureId: number;
  ts: number;         // epoch ms
  kind: MarketKind;
  line: number | null;
  prices: Partial<Record<Pick, number>>;
};

// A raw demargined odds frame from the capture / SSE stream.
export type OddsFrame = {
  FixtureId: number;
  Ts: number;
  SuperOddsType: string;
  MarketParameters: string | null;
  PriceNames: string[];
  Prices: number[];
  InRunning?: boolean;
};

// Convert a raw frame to a snapshot, or null if it's a market we don't offer or
// the prices are unusable (collapsed to 0/1 near settlement).
export function frameToSnapshot(f: OddsFrame): OddsSnapshot | null {
  const kind = kindOf(f.SuperOddsType);
  if (!kind || !Array.isArray(f.Prices) || !Array.isArray(f.PriceNames)) return null;
  const prices: Partial<Record<Pick, number>> = {};
  for (let i = 0; i < f.PriceNames.length; i++) {
    const dec = f.Prices[i] / 1000;
    if (!(dec > 1.001) || dec > 1000) continue;         // skip collapsed/garbage prices
    prices[normalizePick(kind, f.PriceNames[i])] = Math.round(dec * 1000) / 1000;
  }
  if (Object.keys(prices).length === 0) return null;
  return { fixtureId: f.FixtureId, ts: f.Ts, kind, line: parseLine(f.MarketParameters), prices };
}

// A market key groups snapshots of the same market over time.
export function marketKey(kind: MarketKind, line: number | null): string {
  return line == null ? kind : `${kind}@${line}`;
}

// The curated set of markets Bootroom surfaces in the punt builder. Any priced
// market resolves, but these are the clean, familiar lines shown by default.
export const OFFERED: { kind: MarketKind; line: number | null; picks: Pick[]; label: string }[] = [
  { kind: "OU", line: 1.5, picks: ["over", "under"], label: "Total goals 1.5" },
  { kind: "OU", line: 2.5, picks: ["over", "under"], label: "Total goals 2.5" },
  { kind: "OU", line: 3.5, picks: ["over", "under"], label: "Total goals 3.5" },
  { kind: "1X2", line: null, picks: ["home", "draw", "away"], label: "Match result" },
  { kind: "AH", line: -0.5, picks: ["part1", "part2"], label: "Handicap −0.5" },
  { kind: "AH", line: 0.5, picks: ["part1", "part2"], label: "Handicap +0.5" },
];

// Settle a pick against final goals (p1g, p2g). Returns hit/miss, or "push" for
// stakes-back lines (whole-number handicaps / OU on an integer total).
export function settlePick(
  kind: MarketKind, line: number | null, pick: Pick, p1g: number, p2g: number
): "hit" | "miss" | "push" {
  if (kind === "OU") {
    const total = p1g + p2g;
    if (line != null && total === line) return "push";
    const over = total > (line ?? 0);
    return (pick === "over" ? over : !over) ? "hit" : "miss";
  }
  if (kind === "1X2") {
    const res = p1g > p2g ? "home" : p1g < p2g ? "away" : "draw";
    return pick === res ? "hit" : "miss";
  }
  // AH: line applies to P1's goals. part1 wins if p1g + line > p2g.
  const adj = p1g + (line ?? 0);
  if (adj === p2g) return "push";
  const p1Covers = adj > p2g;
  return (pick === "part1" ? p1Covers : !p1Covers) ? "hit" : "miss";
}

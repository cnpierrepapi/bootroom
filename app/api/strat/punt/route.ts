// Add a punt to a strat on a goals market. Slots 1-3 are free; the 4th+ costs 500
// BOOTS, debited atomically in br_add_punt (rejects with insufficient_boots).
//
// The client picks a market (kind + line + pick) — NEVER odds. br_add_punt reads
// the real demargined price from the br_odds book server-side and freezes it onto
// the row, so odds can't be tampered with.
import { supaReady, supaRpc } from "@/lib/supa";
import { EXTRA_PUNT_BOOTS } from "@/lib/strat";
import type { MarketKind, Pick } from "@/lib/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MARKETS: MarketKind[] = ["OU", "AH", "1X2"];
const PICKS: Pick[] = ["over", "under", "part1", "part2", "home", "draw", "away"];

// Which picks are valid for each market kind.
const VALID: Record<MarketKind, Pick[]> = {
  OU: ["over", "under"],
  AH: ["part1", "part2"],
  "1X2": ["home", "draw", "away"],
};

export async function POST(req: Request) {
  let b: { device_id?: string; strat_id?: number; fixture_id?: number; market?: MarketKind; line?: number | null; pick?: Pick };
  try { b = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }

  const { device_id, strat_id, fixture_id, market, pick } = b;
  const line = b.line ?? null;
  if (!device_id || !strat_id || fixture_id == null || !market || !pick) {
    return Response.json({ ok: false, error: "missing fields" }, { status: 400 });
  }
  if (!MARKETS.includes(market) || !PICKS.includes(pick) || !VALID[market].includes(pick)) {
    return Response.json({ ok: false, error: "invalid market/pick" }, { status: 400 });
  }
  if (market === "1X2" ? line !== null : typeof line !== "number") {
    return Response.json({ ok: false, error: "bad line for market" }, { status: 400 });
  }
  if (!supaReady()) return Response.json({ ok: false, error: "backend not configured" }, { status: 503 });

  try {
    const res = await supaRpc<{
      ok: boolean; error?: string; punt_id?: number; slot?: number;
      market?: string; line?: number | null; pick?: string; odds?: number;
      boots_paid?: number; boots_balance?: number;
    }>("br_add_punt", {
      p_device: device_id, p_strat_id: strat_id, p_fixture: fixture_id,
      p_market: market, p_line: line, p_pick: pick, p_extra_cost: EXTRA_PUNT_BOOTS,
    });
    if (!res?.ok) {
      const status = res?.error === "insufficient_boots" ? 402
        : res?.error === "no_market" || res?.error === "no_price" ? 409 : 400;
      return Response.json({ ok: false, error: res?.error || "add_failed", boots_balance: res?.boots_balance }, { status });
    }
    return Response.json({ ok: true, punt: res });
  } catch {
    return Response.json({ ok: false, error: "add_failed" }, { status: 500 });
  }
}

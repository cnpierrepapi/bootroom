// Add a punt to a strat. Slots 1-3 are free; the 4th+ costs 500 BOOTS, debited
// atomically inside br_add_punt (which rejects with insufficient_boots if short).
//
// Odds are computed SERVER-SIDE from the prop and frozen onto the row — the client
// never supplies its own odds (anti-tamper). This is the seam where the live
// TxLINE decimal-odds feed will replace the impliedProb-derived placeholder.
import { supaReady, supaRpc } from "@/lib/supa";
import { impliedProb, type Prop, type Scope, type Side } from "@/lib/props";
import { EXTRA_PUNT_BOOTS } from "@/lib/strat";
import type { StatKind } from "@/lib/replay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATS: StatKind[] = ["goal", "corner", "yellow", "red"];
const SCOPES: Scope[] = ["1H", "2H", "FT"];
const SIDES: Side[] = ["home", "away"];

// Decimal odds frozen at add-time. Placeholder: 1 / implied probability, clamped
// to a sane band. Swap the body for the TxLINE odds read when that feed is wired.
function oddsFor(p: Prop): number {
  const odds = 1 / impliedProb(p);
  return Math.min(15, Math.max(1.02, Math.round(odds * 1000) / 1000));
}

export async function POST(req: Request) {
  let b: {
    device_id?: string; strat_id?: number; fixture_id?: number; side?: Side;
    team_code?: string; stat?: StatKind; threshold?: number; scope?: Scope;
  };
  try { b = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }

  const { device_id, strat_id, fixture_id, side, team_code = "", stat, threshold, scope } = b;
  if (!device_id || !strat_id || fixture_id == null || !side || !stat || threshold == null || !scope) {
    return Response.json({ ok: false, error: "missing fields" }, { status: 400 });
  }
  if (!SIDES.includes(side) || !STATS.includes(stat) || !SCOPES.includes(scope) || threshold < 1) {
    return Response.json({ ok: false, error: "invalid prop" }, { status: 400 });
  }
  if (!supaReady()) return Response.json({ ok: false, error: "backend not configured" }, { status: 503 });

  const prop: Prop = { fixtureId: fixture_id, side, teamCode: team_code, stat, n: threshold, scope };
  const odds = oddsFor(prop);

  try {
    const res = await supaRpc<{
      ok: boolean; error?: string; punt_id?: number; slot?: number;
      boots_paid?: number; boots_balance?: number;
    }>("br_add_punt", {
      p_device: device_id, p_strat_id: strat_id, p_fixture: fixture_id, p_side: side,
      p_team: team_code, p_stat: stat, p_threshold: threshold, p_scope: scope,
      p_odds: odds, p_extra_cost: EXTRA_PUNT_BOOTS,
    });
    if (!res?.ok) {
      const status = res?.error === "insufficient_boots" ? 402 : 400;
      return Response.json({ ok: false, error: res?.error || "add_failed", boots_balance: res?.boots_balance }, { status });
    }
    return Response.json({ ok: true, punt: { ...res, odds } });
  } catch {
    return Response.json({ ok: false, error: "add_failed" }, { status: 500 });
  }
}

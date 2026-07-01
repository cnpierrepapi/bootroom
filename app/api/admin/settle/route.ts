// Stage-1 settlement: resolve a day's strats from FINAL goals and score them
// immediately. proof_status stays 'pending' — the Stage-2 cron (validate_stat
// .rpc) verifies against the on-chain Merkle root later and only then unlocks
// withdrawal. Admin-gated with the shared x-admin-password header. Idempotent:
// re-running only touches punts still unresolved.
import { supaReady, supaGet, supaPatch, supaRpc } from "@/lib/supa";
import { resolvePunt } from "@/lib/settle";
import { todayGameDay } from "@/lib/strat";
import type { MarketKind, Pick } from "@/lib/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN = process.env.ADMIN_PASSWORD || "";

type PuntRow = {
  id: number; fixture_id: number; market: MarketKind; line: number | string | null;
  pick: Pick; resolved: "hit" | "miss" | "push" | null;
};
type FixtureFinals = { fixture_id: number; final_p1_goals: number | null; final_p2_goals: number | null };

export async function POST(req: Request) {
  if (!ADMIN) return Response.json({ ok: false, error: "admin not configured" }, { status: 503 });
  if (req.headers.get("x-admin-password") !== ADMIN) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!supaReady()) return Response.json({ ok: false, error: "backend not configured" }, { status: 503 });

  let b: { day?: string };
  try { b = await req.json(); } catch { b = {}; }
  const day = b.day || todayGameDay();

  try {
    const strats = await supaGet<{ id: number }[]>(
      `br_strats?game_day=eq.${day}&settled=eq.false&select=id`
    );

    // Fixture finals cache (only fixtures whose match has a final score can settle).
    const finalsRows = await supaGet<FixtureFinals[]>(
      `br_fixtures?select=fixture_id,final_p1_goals,final_p2_goals`
    );
    const finals = new Map(finalsRows.map((f) => [f.fixture_id, f]));

    let puntsResolved = 0;
    const results: { stratId: number; score: number; resolved: number }[] = [];

    for (const s of strats) {
      const punts = await supaGet<PuntRow[]>(
        `br_punts?strat_id=eq.${s.id}&select=id,fixture_id,market,line,pick,resolved`
      );
      let n = 0;
      for (const p of punts) {
        if (p.resolved) continue;
        const f = finals.get(p.fixture_id);
        if (!f || f.final_p1_goals == null || f.final_p2_goals == null) continue;  // not final yet
        const r = resolvePunt(p, f.final_p1_goals, f.final_p2_goals);
        await supaPatch(`br_punts?id=eq.${r.puntId}`, { resolved: r.resolved });
        n++; puntsResolved++;
      }
      const score = await supaRpc<number>("br_finalize_strat", { p_strat_id: s.id });
      results.push({ stratId: s.id, score: Number(score), resolved: n });
    }

    return Response.json({ ok: true, day, strats: strats.length, puntsResolved, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: "settle_failed", detail: msg.slice(0, 200) }, { status: 500 });
  }
}

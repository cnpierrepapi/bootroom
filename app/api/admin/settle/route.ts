// Settle a day's strats: resolve every unresolved punt from the feed, stamp
// resolved/observed/proof_json onto the row, then br_finalize_strat computes the
// signed-odds score (Σ win − Σ lose, floored 0) and marks the strat settled.
//
// Admin-gated with the shared x-admin-password header (upgraded to wallet-sig auth
// when the full admin surface lands). Idempotent: re-running only touches punts
// still null and re-finalizes to the same score.
import { supaReady, supaGet, supaPatch, supaRpc } from "@/lib/supa";
import { resolvePunt, type PuntRow } from "@/lib/settle";
import { todayGameDay } from "@/lib/strat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN = process.env.ADMIN_PASSWORD || "";

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

    let puntsResolved = 0;
    const results: { stratId: number; score: number; resolved: number }[] = [];

    for (const s of strats) {
      const punts = await supaGet<PuntRow[]>(
        `br_punts?strat_id=eq.${s.id}&select=id,fixture_id,side,team_code,stat,threshold,scope,resolved`
      );
      let n = 0;
      for (const p of punts) {
        if (p.resolved) continue;              // already resolved (idempotent re-run)
        const r = resolvePunt(p);
        if (!r) continue;                       // fixture not in feed — leave null
        await supaPatch(`br_punts?id=eq.${r.puntId}`, {
          resolved: r.resolved, observed: r.observed, proof_json: r.proof,
        });
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

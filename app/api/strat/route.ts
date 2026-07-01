// The user's single strat for a day (1 per user per day, enforced by the
// unique(device_id, game_day) constraint via br_get_or_create_strat).
//   POST → get-or-create today's strat, return it with its punts
//   GET  ?device=...&day=YYYY-MM-DD → load an existing strat (+ punts), or null
import { supaReady, supaRpc, supaGet } from "@/lib/supa";
import { rowToPunt, todayGameDay, type Punt } from "@/lib/strat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Raw br_strats row from an RPC / PostgREST read.
type StratRow = { id: number; device_id: string; game_day: string; score: number | string; settled: boolean };

async function loadPunts(stratId: number): Promise<Punt[]> {
  const rows = await supaGet<Parameters<typeof rowToPunt>[0][]>(
    `br_punts?strat_id=eq.${stratId}&order=slot.asc&select=id,slot,fixture_id,market,line,pick,odds,boots_paid,resolved,proof_status,proof_tx`
  );
  return rows.map(rowToPunt);
}

function shapeStrat(s: StratRow, punts: Punt[]) {
  return {
    id: s.id, deviceId: s.device_id, gameDay: s.game_day,
    score: Number(s.score), settled: s.settled, punts,
  };
}

export async function POST(req: Request) {
  let b: { device_id?: string; day?: string };
  try { b = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }
  if (!b.device_id) return Response.json({ ok: false, error: "missing device_id" }, { status: 400 });
  if (!supaReady()) return Response.json({ ok: false, error: "backend not configured" }, { status: 503 });

  const day = b.day || todayGameDay();
  try {
    // Ensure the identity row exists first — br_strats.device_id is FK'd to
    // br_users, so creating a strat for an unregistered device would violate it.
    // Idempotent, so it's safe even when the client already called /api/user.
    await supaRpc("br_upsert_user", { p_device: b.device_id, p_username: "", p_wallet: "" });
    const rows = await supaRpc<StratRow[]>("br_get_or_create_strat", { p_device: b.device_id, p_day: day });
    const s = Array.isArray(rows) ? rows[0] : rows;
    const punts = await loadPunts(s.id);
    return Response.json({ ok: true, strat: shapeStrat(s, punts) });
  } catch {
    return Response.json({ ok: false, error: "strat_failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const device = url.searchParams.get("device");
  const day = url.searchParams.get("day") || todayGameDay();
  if (!device) return Response.json({ ok: false, error: "missing device" }, { status: 400 });
  if (!supaReady()) return Response.json({ ok: false, error: "backend not configured" }, { status: 503 });

  try {
    const rows = await supaGet<StratRow[]>(
      `br_strats?device_id=eq.${encodeURIComponent(device)}&game_day=eq.${day}&select=id,device_id,game_day,score,settled`
    );
    if (!rows.length) return Response.json({ ok: true, strat: null });
    const punts = await loadPunts(rows[0].id);
    return Response.json({ ok: true, strat: shapeStrat(rows[0], punts) });
  } catch {
    return Response.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}

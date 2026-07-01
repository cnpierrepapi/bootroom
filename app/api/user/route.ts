// Upsert a device-keyed user (anon identity, foil/spikelines pattern). Optionally
// claims a username and links a wallet (wallet is only ever set, never blanked).
import { supaReady, supaRpc } from "@/lib/supa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let b: { device_id?: string; username?: string; wallet?: string };
  try { b = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }
  const { device_id, username = "", wallet = "" } = b;
  if (!device_id) return Response.json({ ok: false, error: "missing device_id" }, { status: 400 });
  if (!supaReady()) return Response.json({ ok: false, error: "backend not configured" }, { status: 503 });

  try {
    const rows = await supaRpc<{ device_id: string; username: string; wallet: string; boots_balance: number; reward_owed_usdc: number }[]>(
      "br_upsert_user",
      { p_device: device_id, p_username: username, p_wallet: wallet }
    );
    const user = Array.isArray(rows) ? rows[0] : rows;
    return Response.json({ ok: true, user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Case-insensitive username unique index → name already taken.
    if (/br_users_username_uniq|duplicate key|23505/.test(msg)) {
      return Response.json({ ok: false, error: "username_taken" }, { status: 409 });
    }
    return Response.json({ ok: false, error: "upsert_failed" }, { status: 500 });
  }
}

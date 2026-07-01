// Stage-2 auto-verify sweep: for each settled fixture whose proof is still pending,
// land the two validate_stat txs on MAINNET and record the receipt. Verified
// fixtures flip all their punts to verified and let that day's pool distribute
// (the withdrawal unlock). Respects the PROOF_SPEND_CAP_SOL ceiling and a bounded
// per-run batch (Vercel's 60s function cap). Cron- or admin-triggerable.
import { supaReady, supaGet, supaRpc } from "@/lib/supa";
import { proveFixtureGoals, proofConfigured } from "@/lib/proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADMIN = process.env.ADMIN_PASSWORD || "";
const CAP_LAMPORTS = Math.round(Number(process.env.PROOF_SPEND_CAP_SOL || "1.4") * 1e9);
const PER_FIXTURE_LAMPORTS = 10_000;   // two validate_stat txs (~5000 each)
const BATCH = 5;                        // fixtures per run, so we stay under 60s

const CRON_SECRET = process.env.CRON_SECRET || "";

// Authorized either by the admin password (manual) or the Vercel cron bearer.
function authed(req: Request): boolean {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const pw = req.headers.get("x-admin-password");
  return (!!ADMIN && (pw === ADMIN || bearer === ADMIN)) || (!!CRON_SECRET && bearer === CRON_SECRET);
}

// Vercel Cron fires a GET; manual triggers use POST. Same sweep either way.
export async function GET(req: Request) { return sweep(req); }
export async function POST(req: Request) { return sweep(req); }

async function sweep(req: Request) {
  if (!authed(req)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!supaReady()) return Response.json({ ok: false, error: "backend not configured" }, { status: 503 });
  if (!proofConfigured()) return Response.json({ ok: false, error: "proof not configured (TXLINE_API_TOKEN / signer)" }, { status: 503 });

  // Settled fixtures still awaiting a proof (final goals known, proof pending).
  const pending = await supaGet<{ fixture_id: number }[]>(
    `br_fixtures?proof_status=eq.pending&final_p1_goals=not.is.null&select=fixture_id&limit=${BATCH}`
  );
  let spent = Number(await supaRpc<number>("br_proof_spent_lamports", {}));
  const results: { fixtureId: number; status: string; detail: string; p1Tx?: string | null; p2Tx?: string | null }[] = [];

  for (const f of pending) {
    if (spent + PER_FIXTURE_LAMPORTS > CAP_LAMPORTS) {
      results.push({ fixtureId: f.fixture_id, status: "skipped", detail: "spend cap reached" });
      break;
    }
    const p = await proveFixtureGoals(f.fixture_id);
    if (p.status === "verified") {
      await supaRpc("br_verify_fixture", {
        p_fid: f.fixture_id, p_seq: null, p_root: p.root, p_tx1: p.p1Tx, p_tx2: p.p2Tx,
        p_p1: p.p1Goals, p_p2: p.p2Goals, p_lamports: PER_FIXTURE_LAMPORTS,
      });
      spent += PER_FIXTURE_LAMPORTS;
    } else {
      await supaRpc("br_mark_fixture_proof", { p_fid: f.fixture_id, p_status: p.status, p_detail: p.detail });
    }
    results.push({ fixtureId: f.fixture_id, status: p.status, detail: p.detail, p1Tx: p.p1Tx, p2Tx: p.p2Tx });
  }

  return Response.json({
    ok: true, swept: results.length, spentSol: spent / 1e9, capSol: CAP_LAMPORTS / 1e9, results,
  });
}

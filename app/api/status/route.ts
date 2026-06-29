// Pipeline health check for the on-chain settlement data path, per cluster:
//   fixtures → a started match with anchored score records → a valid stat-validation proof.
// If "proof" goes green, the validate_stat round-trip works end-to-end and it's
// safe to deploy the settlement program to that cluster. Polled by /status.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WC = 72;
const LIVE_WINDOW_MS = 2.5 * 60 * 60 * 1000;

type Stage = { ok: boolean | null; detail: string };
type ClusterReport = {
  configured: boolean;
  fixtures: Stage;
  liveScores: Stage;
  proof: Stage;
  nextKickoffMin: number | null;
  provenStat?: string;
};

async function jget(base: string, path: string, jwt: string, token: string) {
  const r = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": token },
    cache: "no-store",
  });
  const t = await r.text();
  let j: any = null;
  try { j = JSON.parse(t); } catch {}
  return { status: r.status, j, t };
}
const arr = (j: any): any[] => (Array.isArray(j) ? j : j?.fixtures || j?.records || j?.data || []);

async function checkCluster(base?: string, jwt?: string, token?: string): Promise<ClusterReport> {
  const blank = (d: string): Stage => ({ ok: null, detail: d });
  if (!base || !jwt || !token)
    return { configured: false, fixtures: blank("not configured"), liveScores: blank("—"), proof: blank("—"), nextKickoffMin: null };

  const now = Date.now();
  const rep: ClusterReport = {
    configured: true,
    fixtures: blank("…"),
    liveScores: blank("…"),
    proof: blank("…"),
    nextKickoffMin: null,
  };

  // 1) fixtures
  const fx = await jget(base, "/api/fixtures/snapshot", jwt, token);
  const wc = arr(fx.j).filter((f) => f.CompetitionId === WC);
  if (fx.status !== 200) { rep.fixtures = { ok: false, detail: `http ${fx.status}` }; return rep; }
  rep.fixtures = { ok: wc.length > 0, detail: `${wc.length} WC fixtures` };
  const upcoming = wc.filter((f) => f.StartTime > now).sort((a, b) => a.StartTime - b.StartTime);
  rep.nextKickoffMin = upcoming.length ? Math.round((upcoming[0].StartTime - now) / 60000) : null;

  // 2) a started match with score records
  const started = wc.filter((f) => f.StartTime <= now).sort((a, b) => b.StartTime - a.StartTime);
  let live: any = null;
  let seqs: number[] = [];
  for (const f of started.slice(0, 8)) {
    const recs = arr((await jget(base, `/api/scores/updates/${f.FixtureId}`, jwt, token)).j);
    const s = [...new Set(recs.map((r) => r.Seq).filter((x) => x != null))] as number[];
    if (s.length) { live = f; seqs = s; break; }
  }
  if (!live) {
    rep.liveScores = {
      ok: false,
      detail: started.length
        ? `${started.length} started, none with anchored score records yet`
        : rep.nextKickoffMin != null
          ? `no live match — next kickoff in ${rep.nextKickoffMin} min`
          : "no live match",
    };
    rep.proof = { ok: null, detail: "waiting for a live match with scores" };
    return rep;
  }
  rep.liveScores = { ok: true, detail: `${live.Participant1} v ${live.Participant2} · ${seqs.length} score updates` };

  // 3) stat-validation proof round-trip
  for (const seq of [seqs[seqs.length - 1], seqs[Math.floor(seqs.length / 2)]]) {
    const r = await jget(base, `/api/scores/stat-validation?fixtureId=${live.FixtureId}&seq=${seq}&statKey=1&statKey2=2`, jwt, token);
    if (r.j && r.j.statToProve) {
      rep.proof = { ok: true, detail: `proven at seq ${seq}` };
      rep.provenStat = JSON.stringify(r.j.statToProve);
      return rep;
    }
    rep.proof = { ok: false, detail: `http ${r.status}: ${r.t.slice(0, 90)}` };
  }
  return rep;
}

export async function GET() {
  const [devnet, mainnet] = await Promise.all([
    checkCluster(process.env.TXLINE_DEVNET_BASE, process.env.TXLINE_DEVNET_JWT, process.env.TXLINE_DEVNET_API_TOKEN),
    checkCluster(process.env.TXLINE_API_BASE, process.env.TXLINE_JWT, process.env.TXLINE_API_TOKEN),
  ]);
  return Response.json({ checkedAt: Date.now(), devnet, mainnet });
}

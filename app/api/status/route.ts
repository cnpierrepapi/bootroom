// Pipeline health check for the on-chain settlement data path, per cluster:
//   fixtures → a live match with anchored stats → a valid stat-validation proof.
// If "proof" goes green, the validate_stat round-trip works end-to-end and it's
// safe to deploy the settlement program to that cluster. Polled by /status.
//
// IMPORTANT endpoint facts (learned the hard way, Jun 29):
//   - Read live scores from `/api/scores/snapshot/{fid}` — it returns a clean JSON
//     ARRAY. `/api/scores/updates/{fid}` returns SSE-FRAMED TEXT ("data: {…}") and
//     `/api/scores/stream` yields 0 bytes inside a serverless function (the platform
//     buffers streaming bodies) — neither is usable here.
//   - GameState stays "scheduled" even mid-match; the live signal is stat-bearing
//     records (records whose `Stats` map is non-empty), not GameState.
//   - stat-validation needs a real seq that CARRIES stats (seq 0 = empty → 404).
//     Stat encoding: key (period*1000)+base, base 1..8 = Goals/Yellow/Red/Corners ×2.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WC = 72;

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

const hasStats = (r: any) => r?.Stats && Object.keys(r.Stats).length > 0;

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

  // 2) find a started fixture whose score snapshot carries stats (the live signal).
  const started = wc.filter((f) => f.StartTime <= now).sort((a, b) => b.StartTime - a.StartTime);
  let live: any = null;
  let statRecs: any[] = [];
  for (const f of started.slice(0, 8)) {
    const recs = arr((await jget(base, `/api/scores/snapshot/${f.FixtureId}`, jwt, token)).j);
    const s = recs.filter(hasStats);
    if (s.length) { live = f; statRecs = s; break; }
  }

  if (!live) {
    rep.liveScores = {
      ok: false,
      detail: started.length
        ? `${started.length} started, no anchored stats yet`
        : rep.nextKickoffMin != null
          ? `no live match — next kickoff in ${rep.nextKickoffMin} min`
          : "no live match",
    };
    rep.proof = { ok: null, detail: "waiting for a live match with scores" };
    return rep;
  }

  // newest stat record → current score (base keys 1 & 2 = goals per side, period 0).
  const latest = statRecs.reduce((a, b) => ((b.Seq ?? 0) > (a.Seq ?? 0) ? b : a), statRecs[0]);
  const g1 = latest.Stats?.["1"] ?? 0;
  const g2 = latest.Stats?.["2"] ?? 0;
  rep.liveScores = {
    ok: true,
    detail: `${live.Participant1} ${g1}–${g2} ${live.Participant2} · ${statRecs.length} stat updates`,
  };

  // 3) stat-validation proof round-trip. The freshest seqs stream live but aren't
  //    Merkle-anchored yet (404 "not a processed record"), so walk recent
  //    stat-bearing seqs newest→oldest and take the first that's been processed.
  const seqs = statRecs
    .map((r) => r.Seq)
    .filter((x) => x != null)
    .sort((a, b) => b - a)
    .slice(0, 10);
  for (const seq of seqs) {
    const r = await jget(base, `/api/scores/stat-validation?fixtureId=${live.FixtureId}&seq=${seq}&statKey=1&statKey2=2`, jwt, token);
    if (r.j && r.j.statToProve) {
      rep.proof = { ok: true, detail: `proven at seq ${seq}` };
      rep.provenStat = JSON.stringify(r.j.statToProve);
      return rep;
    }
    rep.proof = { ok: false, detail: `seq ${seq}: ${(r.j?.error || r.t).slice(0, 70)}` };
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

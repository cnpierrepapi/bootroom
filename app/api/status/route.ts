// Pipeline health check for the on-chain settlement data path, per cluster:
//   fixtures → a live match with score data → a valid stat-validation proof.
// If "proof" goes green, the validate_stat round-trip works end-to-end and it's
// safe to deploy the settlement program to that cluster. Polled by /status.
//
// Scores can surface two ways and we check BOTH, because during a live match the
// REST `/updates` snapshot can lag or stay empty while data flows over SSE:
//   1. REST `/api/scores/updates/{fixtureId}` for every WC fixture (any StartTime —
//      the devnet replay can stream a fixture whose GameState is still 'scheduled').
//   2. A short tap of the SSE `/api/scores/stream` to catch the currently-live fixture.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WC = 72;
const SSE_TAP_MS = 6000;

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

// Tap the SSE scores stream for a few seconds; return the fixture seen with the
// most updates plus its sequence numbers (the live one), or null if silent.
async function sseLiveFixture(base: string, jwt: string, token: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SSE_TAP_MS);
  const seen: Record<string, { seqs: Set<number>; count: number }> = {};
  try {
    const r = await fetch(`${base}/api/scores/stream`, {
      headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": token, Accept: "text/event-stream" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!r.ok || !r.body) { clearTimeout(timer); return null; }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const blocks = buf.split("\n\n");
      buf = blocks.pop() || "";
      for (const b of blocks) {
        const line = b.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        try {
          const d = JSON.parse(line.slice(5).trim());
          const rec = d.data || d;
          const fid = String(rec.FixtureId ?? rec.fixtureId ?? "");
          if (!fid) continue;
          const s = (seen[fid] ||= { seqs: new Set(), count: 0 });
          s.count++;
          const seq = rec.Seq ?? rec.seq;
          if (seq != null) s.seqs.add(seq);
        } catch {}
      }
    }
  } catch {
    /* AbortError on timeout is expected */
  } finally {
    clearTimeout(timer);
  }
  const best = Object.entries(seen).sort((a, b) => b[1].count - a[1].count)[0];
  if (!best) return null;
  return { fixtureId: best[0], seqs: [...best[1].seqs] };
}

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

  // 2) find a fixture with score data. REST first (started fixtures, then any),
  //    then fall back to a short SSE tap for the live match.
  const byRecency = [...wc].sort((a, b) => b.StartTime - a.StartTime);
  const ordered = [
    ...byRecency.filter((f) => f.StartTime <= now),
    ...byRecency.filter((f) => f.StartTime > now),
  ];
  let liveId: string | null = null;
  let liveLabel = "";
  let seqs: number[] = [];

  for (const f of ordered.slice(0, 12)) {
    const recs = arr((await jget(base, `/api/scores/updates/${f.FixtureId}`, jwt, token)).j);
    const s = [...new Set(recs.map((r) => r.Seq).filter((x) => x != null))] as number[];
    if (s.length) {
      liveId = String(f.FixtureId);
      liveLabel = `${f.Participant1} v ${f.Participant2}`;
      seqs = s;
      break;
    }
  }

  if (!liveId) {
    const sse = await sseLiveFixture(base, jwt, token);
    if (sse && sse.seqs.length) {
      liveId = sse.fixtureId;
      seqs = sse.seqs;
      const f = wc.find((x) => String(x.FixtureId) === sse.fixtureId);
      liveLabel = f ? `${f.Participant1} v ${f.Participant2}` : `fixture ${sse.fixtureId}`;
    }
  }

  const started = wc.filter((f) => f.StartTime <= now);
  if (!liveId) {
    rep.liveScores = {
      ok: false,
      detail: started.length
        ? `${started.length} started, no score data on REST or SSE yet`
        : rep.nextKickoffMin != null
          ? `no live match — next kickoff in ${rep.nextKickoffMin} min`
          : "no live match",
    };
    rep.proof = { ok: null, detail: "waiting for a live match with scores" };
    return rep;
  }
  rep.liveScores = { ok: true, detail: `${liveLabel} · ${seqs.length} score updates` };

  // 3) stat-validation proof round-trip
  const probe = [seqs[seqs.length - 1], seqs[Math.floor(seqs.length / 2)]].filter((x) => x != null);
  for (const seq of probe) {
    const r = await jget(base, `/api/scores/stat-validation?fixtureId=${liveId}&seq=${seq}&statKey=1&statKey2=2`, jwt, token);
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

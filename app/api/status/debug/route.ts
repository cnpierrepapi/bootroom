// TEMPORARY diagnostic for the settlement pipeline. Observes the real devnet
// feed from inside a deployed function (env vars are Vercel "Sensitive" → cannot
// be read locally). Tells us whether "no proof" is a dead feed or a checker bug:
//   - lists competitions + which WC fixtures actually have REST score records
//     (regardless of StartTime), and
//   - taps the SSE scores stream for a few seconds to catch the replay fixture.
// Remove once /api/status is fixed.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WC = 72;

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

async function sseTap(base: string, jwt: string, token: string, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const seen: Record<string, { actions: Set<string>; seqs: Set<number>; count: number }> = {};
  let bytes = 0;
  let err: string | null = null;
  try {
    const r = await fetch(`${base}/api/scores/stream`, {
      headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": token, Accept: "text/event-stream" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!r.ok || !r.body) { err = `http ${r.status}`; clearTimeout(timer); return { err, seen: [] as any[], bytes }; }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value?.length ?? 0;
      buf += dec.decode(value, { stream: true });
      const blocks = buf.split("\n\n");
      buf = blocks.pop() || "";
      for (const b of blocks) {
        const dataLine = b.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        try {
          const rec = JSON.parse(dataLine.slice(5).trim());
          const d = rec.data || rec;
          const fid = String(d.FixtureId ?? d.fixtureId ?? "?");
          const s = (seen[fid] ||= { actions: new Set(), seqs: new Set(), count: 0 });
          s.count++;
          if (d.Action ?? d.action) s.actions.add(d.Action ?? d.action);
          const seq = d.Seq ?? d.seq;
          if (seq != null) s.seqs.add(seq);
        } catch {}
      }
    }
  } catch (e: any) {
    if (e?.name !== "AbortError") err = String(e);
  } finally {
    clearTimeout(timer);
  }
  return {
    err,
    bytes,
    seen: Object.entries(seen).map(([fid, v]) => ({
      fid,
      records: v.count,
      seqs: [...v.seqs].slice(-5),
      actions: [...v.actions],
    })),
  };
}

async function diagnose(base?: string, jwt?: string, token?: string) {
  if (!base || !jwt || !token) return { configured: false };

  const fx = await jget(base, "/api/fixtures/snapshot", jwt, token);
  const all = arr(fx.j);
  const now = Date.now();
  const comps = [...new Set(all.map((f) => f.CompetitionId))];
  const wc = all.filter((f) => f.CompetitionId === WC);

  // REST score-record scan across ALL WC fixtures, ignoring StartTime.
  const restHits: any[] = [];
  for (const f of wc) {
    const s = await jget(base, `/api/scores/updates/${f.FixtureId}`, jwt, token);
    const recs = arr(s.j);
    if (recs.length || s.status !== 200) {
      const seqs = [...new Set(recs.map((r) => r.Seq).filter((x) => x != null))];
      restHits.push({
        fid: f.FixtureId,
        teams: `${f.Participant1} v ${f.Participant2}`,
        startsInMin: Math.round((f.StartTime - now) / 60000),
        status: s.status,
        records: recs.length,
        seqs: seqs.length,
        sample: recs[0] ? JSON.stringify(recs[0]).slice(0, 200) : s.t.slice(0, 120),
      });
    }
  }

  const sse = await sseTap(base, jwt, token, 7000);

  return {
    configured: true,
    fixtures: { status: fx.status, total: all.length, comps, wc: wc.length },
    wcSample: wc.slice(0, 3).map((f) => ({
      fid: f.FixtureId,
      teams: `${f.Participant1} v ${f.Participant2}`,
      startsInMin: Math.round((f.StartTime - now) / 60000),
      gameState: f.GameState ?? null,
    })),
    restScoreHits: restHits,
    sse,
  };
}

export async function GET() {
  const [devnet, mainnet] = await Promise.all([
    diagnose(process.env.TXLINE_DEVNET_BASE, process.env.TXLINE_DEVNET_JWT, process.env.TXLINE_DEVNET_API_TOKEN),
    diagnose(process.env.TXLINE_API_BASE, process.env.TXLINE_JWT, process.env.TXLINE_API_TOKEN),
  ]);
  return Response.json({ checkedAt: Date.now(), devnet, mainnet });
}

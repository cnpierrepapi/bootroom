// TEMPORARY deep probe for ONE fixture across every scores/odds endpoint, to find
// why a LIVE match yields no score data. Usage: /api/status/probe?fid=18172469
// Returns raw status + body snippets so we can tell "no data anchored yet" from
// "wrong endpoint" from "auth/subscription problem". Remove once resolved.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

async function jget(base: string, path: string, jwt: string, token: string) {
  try {
    const r = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": token },
      cache: "no-store",
    });
    const t = await r.text();
    return { path, status: r.status, len: t.length, body: t.slice(0, 400) };
  } catch (e: any) {
    return { path, status: -1, len: 0, body: String(e).slice(0, 200) };
  }
}

// Raw SSE capture: record the first bytes exactly as they arrive.
async function sseRaw(base: string, jwt: string, token: string, path: string, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  let bytes = 0, chunks = 0, first = "", status = 0, ok = false;
  try {
    const r = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": token, Accept: "text/event-stream" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    status = r.status; ok = r.ok;
    if (r.ok && r.body) {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks++;
        bytes += value?.length ?? 0;
        if (first.length < 500) first += dec.decode(value, { stream: true });
      }
    } else {
      first = (await r.text()).slice(0, 300);
    }
  } catch (e: any) {
    if (e?.name !== "AbortError") first = `ERR ${String(e).slice(0, 150)}`;
  } finally {
    clearTimeout(timer);
  }
  return { path, status, ok, bytes, chunks, first: first.slice(0, 500) };
}

async function rawget(base: string, path: string, jwt: string, token: string) {
  const r = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": token },
    cache: "no-store",
  });
  return { status: r.status, text: await r.text() };
}

async function probe(base?: string, jwt?: string, token?: string, fid?: string) {
  if (!base || !jwt || !token) return { configured: false };
  const f = fid || "18172469";

  // The snapshot endpoint returns a clean JSON array (unlike /updates which is SSE text).
  const snap = await rawget(base, `/api/scores/snapshot/${f}`, jwt, token);
  let recs: any[] = [];
  try { recs = JSON.parse(snap.text); } catch {}

  // Records that actually carry encoded stats (the validate_stat inputs).
  const withStats = recs
    .filter((r) => r.Stats && Object.keys(r.Stats).length > 0)
    .map((r) => ({ seq: r.Seq, action: r.Action, statKeys: Object.keys(r.Stats), stats: r.Stats }));

  const allSeqs = [...new Set(recs.map((r) => r.Seq).filter((x) => x != null))] as number[];
  const maxSeq = allSeqs.length ? Math.max(...allSeqs) : null;

  // Try stat-validation against real seqs that carry stats, sweeping a couple of
  // stat-key pairs (base 1 = goals p1, base 2 = goals p2 per the encoding).
  const seqsToTry = withStats.slice(-3).map((r) => r.seq);
  const validations: any[] = [];
  for (const seq of seqsToTry) {
    for (const [k1, k2] of [["1", "2"], ["7", "8"]]) {
      const v = await jget(base, `/api/scores/stat-validation?fixtureId=${f}&seq=${seq}&statKey=${k1}&statKey2=${k2}`, jwt, token);
      validations.push({ seq, k1, k2, status: v.status, body: v.body.slice(0, 200) });
    }
  }

  return {
    configured: true,
    fixture: f,
    snapshot: { status: snap.status, totalRecords: recs.length, maxSeq, withStatsCount: withStats.length },
    sampleStatRecords: withStats.slice(-4),
    validations,
  };
}

export async function GET(req: Request) {
  const fid = new URL(req.url).searchParams.get("fid") || "18172469";
  const [devnet, mainnet] = await Promise.all([
    probe(process.env.TXLINE_DEVNET_BASE, process.env.TXLINE_DEVNET_JWT, process.env.TXLINE_DEVNET_API_TOKEN, fid),
    probe(process.env.TXLINE_API_BASE, process.env.TXLINE_JWT, process.env.TXLINE_API_TOKEN, fid),
  ]);
  return Response.json({ nowISO: new Date().toISOString(), fid, devnet, mainnet });
}

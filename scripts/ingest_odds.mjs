// Ingest a TxLINE capture (odds + scores) into br_odds / br_fixtures.
// Usage: node scripts/ingest_odds.mjs captures/18172469.json
// Idempotent: clears the fixture's existing odds first. Source of truth for the
// demargined price a punt is quoted at add-time, and the final goals it settles on.
import { readFileSync } from "node:fs";

// --- load SUPABASE_URL / SERVICE_ROLE_KEY from .env.local (no dotenv dep) ---
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2];
}
const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("missing SUPABASE_URL / SERVICE_ROLE_KEY in .env.local"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// --- parse one demargined odds frame → a br_odds row (mirrors lib/markets.ts) ---
function frameToRow(f) {
  const t = f.SuperOddsType || "";
  const kind = t.startsWith("OVERUNDER") ? "OU" : t.startsWith("ASIANHANDICAP") ? "AH" : t.startsWith("1X2") ? "1X2" : null;
  if (!kind || !Array.isArray(f.Prices) || !Array.isArray(f.PriceNames)) return null;
  const prices = {};
  for (let i = 0; i < f.PriceNames.length; i++) {
    const dec = f.Prices[i] / 1000;
    if (!(dec > 1.001) || dec > 1000) continue;
    let pn = f.PriceNames[i];
    if (kind === "1X2") pn = pn === "part1" ? "home" : pn === "part2" ? "away" : "draw";
    prices[pn] = Math.round(dec * 1000) / 1000;
  }
  if (Object.keys(prices).length === 0) return null;
  let line = null; const m = /line=(-?\d+(?:\.\d+)?)/.exec(f.MarketParameters || "");
  if (m) line = Number(m[1]);
  return { fixture_id: f.FixtureId, ts: f.Ts, kind, line, prices };
}

async function main() {
  const path = process.argv[2];
  if (!path) { console.error("usage: node scripts/ingest_odds.mjs <capture.json>"); process.exit(1); }
  const cap = JSON.parse(readFileSync(path, "utf8"));
  const fid = cap.fid;
  console.log(`ingesting ${cap.p1} v ${cap.p2} (#${fid}) — ${cap.odds.length} odds / ${cap.scores.length} scores`);

  // final goals = last scores frame carrying a Total (honours VAR rollback: latest wins)
  let fp1 = null, fp2 = null;
  for (const s of cap.scores) {
    const sc = s.Score;
    const g1 = sc?.Participant1?.Total?.Goals, g2 = sc?.Participant2?.Total?.Goals;
    if (typeof g1 === "number") fp1 = g1;
    if (typeof g2 === "number") fp2 = g2;
  }

  const rows = cap.odds.map(frameToRow).filter(Boolean);
  const tss = rows.map((r) => r.ts);
  const minTs = Math.min(...tss), maxTs = Math.max(...tss);
  console.log(`  parsed ${rows.length} priced snapshots; final goals ${fp1}-${fp2}`);

  // fixtures upsert
  await fetch(`${URL}/rest/v1/br_fixtures?on_conflict=fixture_id`, {
    method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ fixture_id: fid, p1: cap.p1, p2: cap.p2, min_ts: minTs, max_ts: maxTs,
      kickoff_ts: minTs, final_p1_goals: fp1, final_p2_goals: fp2, source: "replay" }]),
  }).then((r) => { if (!r.ok) throw new Error("fixtures upsert " + r.status); });

  // clear then bulk-insert odds
  await fetch(`${URL}/rest/v1/br_odds?fixture_id=eq.${fid}`, { method: "DELETE", headers: H });
  let done = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const r = await fetch(`${URL}/rest/v1/br_odds`, {
      method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(chunk),
    });
    if (!r.ok) { console.error("insert failed", r.status, await r.text()); process.exit(1); }
    done += chunk.length;
    process.stdout.write(`\r  inserted ${done}/${rows.length}`);
  }
  console.log(`\n✓ ingested #${fid}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

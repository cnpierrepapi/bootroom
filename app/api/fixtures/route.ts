// TxLINE fixtures → which national teams are still in the World Cup, plus the
// live/upcoming matches (used to gate team selection and to show live matches
// on an expanded basket). Server-held token; falls back gracefully if unset.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WC = 72; // World Cup competition id
const AHEAD_MS = 3 * 24 * 60 * 60 * 1000;
const BEHIND_MS = 2.5 * 60 * 60 * 1000;

const norm = (s: string) => (s || "").toLowerCase().trim();

export async function GET() {
  const base = process.env.TXLINE_API_BASE;
  const jwt = process.env.TXLINE_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!base || !jwt || !apiToken) return Response.json({ configured: false, activeTeams: [], matches: [] });

  try {
    const res = await fetch(`${base}/api/fixtures/snapshot`, {
      headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
      cache: "no-store",
    });
    if (!res.ok) return Response.json({ configured: true, activeTeams: [], matches: [], error: res.status });

    const j: any = await res.json();
    const arr: any[] = Array.isArray(j) ? j : j.fixtures || j.data || [];
    const now = Date.now();

    const inWindow = arr.filter(
      (f) => f.CompetitionId === WC && f.StartTime >= now - BEHIND_MS && f.StartTime <= now + AHEAD_MS,
    );

    const matches = inWindow
      .map((f) => ({
        fid: f.FixtureId as number,
        p1: f.Participant1 as string,
        p2: f.Participant2 as string,
        startTime: f.StartTime as number,
        live: f.StartTime <= now,
      }))
      .sort((a, b) => Number(b.live) - Number(a.live) || a.startTime - b.startTime);

    // A team is "still in" if it has a live or upcoming fixture in the window.
    const activeTeams = Array.from(new Set(inWindow.flatMap((f) => [norm(f.Participant1), norm(f.Participant2)]))).filter(Boolean);

    return Response.json({ configured: true, activeTeams, matches });
  } catch (e) {
    return Response.json({ configured: true, activeTeams: [], matches: [], error: String(e) });
  }
}

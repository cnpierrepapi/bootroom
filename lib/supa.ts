// Tiny server-side Supabase (PostgREST) client. Lives in the shared foil project
// but only ever touches the isolated `br_*` (Bootroom) tables. Uses the
// service-role key, so it MUST stay server-only (API routes) and must never be
// imported into a client bundle. All br_* RPCs are revoked from anon/authenticated
// (see migration 0002), so the service-role key is the ONLY way to call them.
const URL = process.env.SUPABASE_URL || "https://mohbmvajroqizlfaarjk.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function supaReady(): boolean {
  return !!KEY;
}

function headers(extra?: Record<string, string>) {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...extra };
}

export async function supaGet<T = unknown>(pathAndQuery: string): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/${pathAndQuery}`, { headers: headers(), cache: "no-store" });
  if (!r.ok) throw new Error(`supabase GET ${r.status}: ${await r.text()}`);
  return r.json();
}

// Call a Postgres function. Every money/state mutation goes through an RPC so the
// logic (balance guards, idempotency, scoring) is atomic inside the database.
export async function supaRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: headers(), body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`supabase RPC ${fn} ${r.status}: ${await r.text()}`);
  return r.json();
}

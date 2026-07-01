// SERVER-ONLY. Proves a fixture's FINAL goals on-chain against TxLINE's Solana-
// anchored scores Merkle root, via the txoracle `validate_stat` instruction —
// landing a REAL tx (the explorer-linkable receipt). Goals-market punts settle
// from (p1 goals, p2 goals), so proving both stats at the final seq verifies the
// whole fixture; every punt on it is then deterministically settled.
//
// MAINNET by default (devnet's WC replay roots don't reconcile for recent
// fixtures; mainnet anchors real data — verified Jul 2026). A guest JWT is minted
// per call; the durable apiToken comes from env.
import { Connection, PublicKey, Keypair, ComputeBudgetProgram } from "@solana/web3.js";
import { AnchorProvider, Program, BN, type Idl } from "@coral-xyz/anchor";
import bs58 from "bs58";
import rawIdl from "./txline/idl/txoracle.json";

const RPC = process.env.TXORACLE_RPC_URL || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const PROGRAM_ID = new PublicKey(process.env.TXORACLE_PROGRAM_ID || "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
const BASE = process.env.TXLINE_API_BASE || "https://txline.txodds.com";
const API_TOKEN = process.env.TXLINE_API_TOKEN || "";
const DAY_MS = 86_400_000;
// Funded signer for the landed tx (treasury). Only the secret can .rpc().
const SIGNER_SECRET = process.env.SOLANA_SIM_PAYER_SECRET || process.env.TREASURY_SECRET_KEY || "";

const ERR_BY_CODE: Record<number, string> = Object.fromEntries(
  ((rawIdl as { errors?: { code: number; name: string }[] }).errors ?? []).map((e) => [e.code, e.name]),
);
const MISMATCH = ["TimestampMismatch", "TimeSlotMismatch", "InvalidStatProof", "InvalidSubTreeProof", "InvalidFixtureSubTreeProof", "InvalidMainTreeProof"];

export type FixtureProof = {
  status: "verified" | "unprovable" | "pending";
  p1Goals: number | null;
  p2Goals: number | null;
  p1Tx: string | null;
  p2Tx: string | null;
  root: string | null;
  detail: string;
};

export function proofConfigured(): boolean {
  return !!(API_TOKEN && SIGNER_SECRET);
}

async function guestJwt(): Promise<string> {
  const r = await fetch(`${BASE}/auth/guest/start`, { method: "POST" });
  if (!r.ok) throw new Error(`guest/start ${r.status}`);
  return (await r.json()).token;
}

function headers(jwt: string) {
  return { Authorization: `Bearer ${jwt}`, "X-Api-Token": API_TOKEN };
}

// Final feed seq for a fixture (last score update).
async function finalSeq(fid: number, jwt: string): Promise<number | null> {
  const r = await fetch(`${BASE}/api/scores/updates/${fid}`, { headers: headers(jwt), cache: "no-store" });
  if (!r.ok) return null;
  const seqs: number[] = [];
  for (const l of (await r.text()).split("\n")) {
    if (!l.startsWith("data:")) continue;
    try { const o = JSON.parse(l.slice(5).trim()); if (typeof o.Seq === "number") seqs.push(o.Seq); } catch {}
  }
  return seqs.length ? [...new Set(seqs)].sort((a, b) => a - b).at(-1)! : null;
}

type Bundle = {
  statToProve: { key: number; value: number; period: number };
  eventStatRoot: number[] | string;
  summary: { fixtureId: number; updateStats: { updateCount: number; minTimestamp: number; maxTimestamp: number }; eventStatsSubTreeRoot: number[] | string };
  statProof: { hash: number[] | string; isRightSibling: boolean }[];
  subTreeProof: { hash: number[] | string; isRightSibling: boolean }[];
  mainTreeProof: { hash: number[] | string; isRightSibling: boolean }[];
};
async function statValidation(fid: number, seq: number, statKey: number, jwt: string): Promise<Bundle | null> {
  const r = await fetch(`${BASE}/api/scores/stat-validation?fixtureId=${fid}&seq=${seq}&statKey=${statKey}`, { headers: headers(jwt), cache: "no-store" });
  if (!r.ok) return null;                            // 404 = interval root not posted yet
  const b = await r.json();
  return b?.statToProve ? b : null;
}

const toBytes = (v: number[] | string): number[] => (Array.isArray(v) ? v : Array.from(Buffer.from(v, "base64")));
const toNodes = (ns: { hash: number[] | string; isRightSibling: boolean }[]) => ns.map((n) => ({ hash: toBytes(n.hash), isRightSibling: n.isRightSibling }));

let _program: Program | null = null;
function program(): Program {
  if (_program) return _program;
  const idl = JSON.parse(JSON.stringify(rawIdl)) as Idl & { address: string; instructions: { name: string; returns?: unknown }[] };
  idl.address = PROGRAM_ID.toBase58();
  const vs = idl.instructions.find((i) => i.name === "validate_stat");
  if (vs && !vs.returns) vs.returns = "bool";
  const kp = Keypair.fromSecretKey(bs58.decode(SIGNER_SECRET.trim()));
  const sign = (tx: { partialSign?: (k: Keypair) => void }) => { try { tx.partialSign?.(kp); } catch {} return tx; };
  const wallet = { publicKey: kp.publicKey, payer: kp, signTransaction: async (t: unknown) => sign(t as never), signAllTransactions: async (ts: unknown[]) => (ts as never[]).map((t) => sign(t)) } as never;
  _program = new Program(idl as Idl, new AnchorProvider(new Connection(RPC, "confirmed"), wallet, { commitment: "confirmed" }));
  return _program;
}

function extractErr(e: unknown): string {
  const any = e as { simulationResponse?: { logs?: string[]; err?: unknown }; logs?: string[]; message?: string };
  const logs = any.simulationResponse?.logs ?? any.logs ?? [];
  const fromLogs = logs.join("\n").match(/Error Code:\s*(\w+)/)?.[1];
  const hex = String(any.message ?? "").match(/custom program error:\s*0x([0-9a-f]+)/i)?.[1];
  return fromLogs ?? (hex ? ERR_BY_CODE[parseInt(hex, 16)] : undefined) ?? String(any.message ?? e).slice(0, 120);
}

// Land one stat proof as a real tx. Returns {sig} on success, {error} otherwise.
async function landStat(b: Bundle): Promise<{ sig?: string; root: string; error?: string }> {
  const minTs = b.summary.updateStats.minTimestamp;
  const day = Buffer.alloc(2); day.writeUInt16LE(Math.floor(minTs / DAY_MS), 0);
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("daily_scores_roots"), day], PROGRAM_ID);
  const statA = { statToProve: b.statToProve, eventStatRoot: toBytes(b.eventStatRoot), statProof: toNodes(b.statProof) };
  const fsum = { fixtureId: new BN(b.summary.fixtureId), updateStats: { updateCount: b.summary.updateStats.updateCount, minTimestamp: new BN(minTs), maxTimestamp: new BN(b.summary.updateStats.maxTimestamp) }, eventsSubTreeRoot: toBytes(b.summary.eventStatsSubTreeRoot) };
  const predicate = { threshold: b.statToProve.value, comparison: { equalTo: {} } };
  const cu = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
  try {
    const sig = await (program().methods as Record<string, (...a: unknown[]) => { accounts: (x: unknown) => { preInstructions: (ix: unknown[]) => { rpc: (o?: unknown) => Promise<string> } } }>)
      .validateStat(new BN(minTs), fsum, toNodes(b.subTreeProof), toNodes(b.mainTreeProof), predicate, statA, null, null)
      .accounts({ dailyScoresMerkleRoots: pda }).preInstructions([cu]).rpc({ commitment: "confirmed" });
    return { sig, root: pda.toBase58() };
  } catch (e) {
    return { root: pda.toBase58(), error: extractErr(e) };
  }
}

// Prove a fixture's final goals on-chain (statKey 1 = P1, 2 = P2). Lands two real
// txs. `verified` iff both reconcile; `pending` if the root isn't posted yet
// (retry later); `unprovable` if the root is posted but won't reconcile.
export async function proveFixtureGoals(fid: number): Promise<FixtureProof> {
  const base: FixtureProof = { status: "pending", p1Goals: null, p2Goals: null, p1Tx: null, p2Tx: null, root: null, detail: "" };
  if (!proofConfigured()) return { ...base, detail: "proof not configured (TXLINE_API_TOKEN / signer)" };
  try {
    const jwt = await guestJwt();
    const seq = await finalSeq(fid, jwt);
    if (seq == null) return { ...base, detail: "no feed seq for fixture" };
    const [b1, b2] = await Promise.all([statValidation(fid, seq, 1, jwt), statValidation(fid, seq, 2, jwt)]);
    if (!b1 || !b2) return { ...base, detail: "stat-validation not available yet (root not posted)" };
    const p1Goals = b1.statToProve.value, p2Goals = b2.statToProve.value;
    const r1 = await landStat(b1);
    const r2 = await landStat(b2);
    const root = r1.root;
    if (r1.sig && r2.sig) {
      return { status: "verified", p1Goals, p2Goals, p1Tx: r1.sig, p2Tx: r2.sig, root, detail: "validate_stat ✓ both goals anchored" };
    }
    const err = r1.error ?? r2.error ?? "";
    if (MISMATCH.includes(err)) return { ...base, p1Goals, p2Goals, root, status: "unprovable", detail: `root doesn't reconcile (${err})` };
    return { ...base, p1Goals, p2Goals, root, status: "pending", p1Tx: r1.sig ?? null, p2Tx: r2.sig ?? null, detail: `retry (${err})` };
  } catch (e) {
    return { ...base, detail: String((e as Error)?.message ?? e).slice(0, 140) };
  }
}

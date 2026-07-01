// Land a REAL validate_stat tx on MAINNET for a fixture's final goals (statKey 1),
// signed by the treasury wallet. Proves Bootroom's on-chain settlement receipt.
// Reuses the stable mainnet apiToken (only a fresh guest JWT per run — no re-subscribe).
import { readFileSync } from "node:fs";
import { Connection, PublicKey, Keypair, ComputeBudgetProgram } from "@solana/web3.js";
import anchor from "@coral-xyz/anchor";
import bs58 from "bs58";
const { AnchorProvider, Program, BN } = anchor;

const PROGRAM = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
const BASE = "https://txline.txodds.com";
const API_TOKEN = "txoracle_api_d7e408bb255a4df1876e4bd72701e478";
const FID = Number(process.argv[2] || 18172469), STATKEY = Number(process.argv[3] || 1);

const jwt = (await (await fetch(`${BASE}/auth/guest/start`, { method: "POST" })).json()).token;
const H = { Authorization: `Bearer ${jwt}`, "X-Api-Token": API_TOKEN };

// reusability check
const upd = await fetch(`${BASE}/api/scores/updates/${FID}`, { headers: H });
console.log("stat feed reachable with reused token:", upd.status);
if (!upd.ok) { console.log("token NOT reusable — re-subscribe needed"); process.exit(1); }
const seqs = []; for (const l of (await upd.text()).split("\n")) { if (l.startsWith("data:")) { try { const o = JSON.parse(l.slice(5).trim()); if (typeof o.Seq === "number") seqs.push(o.Seq); } catch {} } }
const seq = [...new Set(seqs)].sort((a, b) => a - b).at(-1);   // final seq
console.log(`fid ${FID} final seq ${seq}`);

const b = await (await fetch(`${BASE}/api/scores/stat-validation?fixtureId=${FID}&seq=${seq}&statKey=${STATKEY}`, { headers: H })).json();
if (!b?.statToProve) { console.log("no statToProve:", JSON.stringify(b).slice(0, 120)); process.exit(1); }

const kp = Keypair.fromSecretKey(bs58.decode(readFileSync("C:/Users/HP/Downloads/env.txt", "utf8").trim()));
const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const idl = JSON.parse(readFileSync(new URL("../lib/txline/idl/txoracle.json", import.meta.url), "utf8"));
idl.address = PROGRAM.toBase58();
const vs = idl.instructions.find((i) => i.name === "validate_stat"); if (vs && !vs.returns) vs.returns = "bool";
const sign = (tx) => { try { tx.partialSign(kp); } catch {} return tx; };
const program = new Program(idl, new AnchorProvider(conn, { publicKey: kp.publicKey, payer: kp, signTransaction: async (t) => sign(t), signAllTransactions: async (ts) => ts.map(sign) }, { commitment: "confirmed" }));
const toBytes = (v) => (Array.isArray(v) ? v : Array.from(Buffer.from(v, "base64")));
const toNodes = (ns) => ns.map((n) => ({ hash: toBytes(n.hash), isRightSibling: n.isRightSibling }));

const minTs = b.summary.updateStats.minTimestamp;
const day = Buffer.alloc(2); day.writeUInt16LE(Math.floor(minTs / 86_400_000), 0);
const [pda] = PublicKey.findProgramAddressSync([Buffer.from("daily_scores_roots"), day], PROGRAM);
const statA = { statToProve: b.statToProve, eventStatRoot: toBytes(b.eventStatRoot), statProof: toNodes(b.statProof) };
const fsum = { fixtureId: new BN(b.summary.fixtureId), updateStats: { updateCount: b.summary.updateStats.updateCount, minTimestamp: new BN(minTs), maxTimestamp: new BN(b.summary.updateStats.maxTimestamp) }, eventsSubTreeRoot: toBytes(b.summary.eventStatsSubTreeRoot) };
const predicate = { threshold: b.statToProve.value, comparison: { equalTo: {} } };
const cu = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });

console.log(`landing validate_stat .rpc(): statKey ${STATKEY} value=${b.statToProve.value} (final goals for P${STATKEY})…`);
try {
  const sig = await program.methods.validateStat(new BN(minTs), fsum, toNodes(b.subTreeProof), toNodes(b.mainTreeProof), predicate, statA, null, null).accounts({ dailyScoresMerkleRoots: pda }).preInstructions([cu]).rpc({ commitment: "confirmed" });
  console.log(`\n✅ LANDED ON MAINNET: ${sig}`);
  console.log(`   https://explorer.solana.com/tx/${sig}`);
} catch (e) {
  const log = (e?.simulationResponse?.logs || e?.logs || []).find((l) => /Error (Message|Code):/.test(l)) || e?.message;
  console.log("✗ land failed:", String(log).slice(0, 200));
}

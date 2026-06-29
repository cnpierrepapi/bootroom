"use client";

import { useCallback, useEffect, useState } from "react";

const POLL_MS = 180_000; // every 3 minutes

type Stage = { ok: boolean | null; detail: string };
type Cluster = {
  configured: boolean;
  fixtures: Stage;
  liveScores: Stage;
  proof: Stage;
  nextKickoffMin: number | null;
  provenStat?: string;
};
type Status = { checkedAt: number; devnet: Cluster; mainnet: Cluster };

function dot(s: Stage) {
  if (s.ok === true) return { c: "var(--color-success)", t: "✓" };
  if (s.ok === null) return { c: "var(--color-muted)", t: "○" };
  if (s.detail.startsWith("http")) return { c: "var(--color-destructive)", t: "✕" };
  return { c: "var(--color-primary)", t: "⏳" }; // waiting
}

function ClusterCard({ name, c, paper }: { name: string; c: Cluster; paper: string }) {
  const ready = c.proof.ok === true;
  const rows: [string, Stage][] = [
    ["Fixtures feed", c.fixtures],
    ["Live match + anchored scores", c.liveScores],
    ["validate_stat proof round-trip", c.proof],
  ];
  return (
    <article className={`postit ${paper} rot-3 w-full sm:w-96 p-6 pt-7`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-3xl font-bold">{name}</h2>
        <span className="val-chip text-base" style={{ color: ready ? "var(--color-success)" : "var(--color-foreground)" }}>
          {ready ? "READY ✓" : c.configured ? "waiting" : "not configured"}
        </span>
      </div>
      <div className="ink-panel mt-4 p-4 flex flex-col gap-3.5">
        {rows.map(([label, s]) => {
          const d = dot(s);
          return (
            <div key={label} className="flex items-start gap-2.5">
              <span style={{ color: d.c }} className="text-xl leading-none mt-0.5 font-bold">{d.t}</span>
              <div className="min-w-0">
                <div className="font-bold text-base leading-snug" style={{ fontFamily: "var(--font-geist-sans)" }}>{label}</div>
                <div className="text-sm opacity-80 break-words" style={{ fontFamily: "var(--font-geist-sans)" }}>{s.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
      {c.nextKickoffMin != null && (
        <div className="mt-3 text-base font-semibold opacity-80">next kickoff in ~{c.nextKickoffMin} min</div>
      )}
      {c.provenStat && (
        <div className="ink-panel mt-2 text-sm font-mono px-3 py-2 break-words" style={{ color: "var(--color-success)" }}>{c.provenStat}</div>
      )}
    </article>
  );
}

export default function StatusPage() {
  const [data, setData] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [secsToNext, setSecsToNext] = useState(POLL_MS / 1000);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => { setLoading(false); setSecsToNext(POLL_MS / 1000); });
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setSecsToNext((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [load]);

  const devReady = data?.devnet.proof.ok === true;
  const mainReady = data?.mainnet.proof.ok === true;

  return (
    <main className="app-container py-8 sm:py-12">
      <header className="mb-7">
        <div className="chalk-faint chalk text-base">Bootroom · pipeline status</div>
        <h1 className="chalk text-4xl sm:text-5xl font-bold leading-none">Settlement Pipeline</h1>
        <p className="chalk chalk-faint text-xl mt-2">
          Is the full <span className="chalk-yellow">fixtures → live scores → validate_stat proof</span> round-trip working?
          Don&apos;t deploy the on-chain program until a cluster reads <span className="chalk-yellow">READY</span>.
        </p>
      </header>

      {/* overall banner */}
      <div className="board-frame p-5 sm:p-7 mb-7">
        <div className="chalk text-2xl">
          {!data ? (
            "checking…"
          ) : devReady || mainReady ? (
            <span style={{ color: "var(--color-success)" }}>
              ✅ PIPELINE READY on {[devReady && "devnet", mainReady && "mainnet"].filter(Boolean).join(" + ")} — safe to deploy the settlement program there.
            </span>
          ) : (
            <span className="chalk-yellow">
              ⏳ NOT READY — no live match with an anchored proof yet. Do NOT deploy (would waste SOL). This page re-checks automatically.
            </span>
          )}
        </div>
        <div className="chalk chalk-faint text-base mt-3 flex flex-wrap gap-x-6 gap-y-1">
          <span>{data ? `last checked ${new Date(data.checkedAt).toLocaleTimeString()}` : ""}</span>
          <span>re-checks every 3 min · next in {Math.floor(secsToNext / 60)}:{String(secsToNext % 60).padStart(2, "0")}</span>
          <button onClick={load} disabled={loading} className="chalk-yellow underline disabled:opacity-40">
            {loading ? "checking…" : "check now"}
          </button>
        </div>
      </div>

      {data && (
        <section className="flex flex-wrap gap-8 justify-center sm:justify-start">
          <ClusterCard name="Devnet (Anchor target)" c={data.devnet} paper="paper-blue" />
          <ClusterCard name="Mainnet" c={data.mainnet} paper="paper-green" />
        </section>
      )}

      <footer className="chalk chalk-faint text-lg mt-8">
        ✓ working · ⏳ waiting for a live match · ✕ error · ○ pending. The proof row going ✓ means the
        on-chain <span className="chalk-yellow">validate_stat</span> settlement can resolve trustlessly.
      </footer>
    </main>
  );
}

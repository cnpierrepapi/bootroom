"use client";

import Link from "next/link";
import ChalkCursor from "@/components/ChalkCursor";
import Reveal from "@/components/Reveal";

// Scrolling ticker of the goal markets Bootroom actually prices.
const MARKETS = [
  "Over 2.5 goals", "Match result", "Handicap −0.5", "Under 1.5 goals",
  "1X2", "Total goals 3.5", "Over 1.5 goals", "Draw", "Handicap +0.5", "Under 2.5",
];

const STEPS = [
  { n: "1", t: "Build", paper: "paper-green", rot: "rot-1", d: "Pick up to three punts on goal markets — over/under, handicap, match result. Each is priced from the live TxLINE demargined book the moment you add it." },
  { n: "2", t: "Score", paper: "paper-blue", rot: "rot-3", d: "At full time your strat scores Σ(winning odds) − Σ(losing odds), floored at zero. The day's pool splits by score." },
  { n: "3", t: "Verify", paper: "paper-yellow", rot: "rot-4", d: "A real validate_stat transaction anchors the goals on Solana mainnet — an explorer-linkable receipt. Then the reward unlocks." },
];

export default function Landing() {
  return (
    <>
      <ChalkCursor />
      <main className="relative z-10">
        {/* ── HERO ── */}
        <section className="app-container min-h-[92vh] flex flex-col justify-center py-16">
          <div className="chalk chalk-faint text-lg mb-3">Bootroom · TxLINE World Cup · Solana</div>
          <h1 className="chalk text-6xl sm:text-8xl font-bold leading-[0.92]">The Bootroom</h1>
          <p className="chalk text-2xl sm:text-3xl mt-5 max-w-2xl">
            Build a <span className="chalk-yellow">strat</span>. Call the goals.{" "}
            <span className="chalk-yellow">Prove it on-chain.</span>
          </p>
          <p className="chalk chalk-faint text-lg mt-3 max-w-xl leading-snug">
            Up to three punts on real TxLINE goal markets — priced with the live demargined book,
            settled with a real <span className="font-mono">validate_stat</span> transaction on Solana.
          </p>
          <div className="flex flex-wrap items-center gap-4 mt-9">
            <Link href="/play" className="postit paper-yellow rot-2 px-7 py-4 text-2xl font-bold gold-glow">Build your strat →</Link>
            <a href="#how" className="chalk text-xl rounded-lg border-2 border-dashed border-[rgba(238,243,236,0.35)] px-6 py-4 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition">How it works</a>
          </div>
          <div className="mt-14 text-4xl select-none ball-roll" aria-hidden="true">⚽</div>
        </section>

        {/* ── MARKET TICKER ── */}
        <section className="ticker-wrap py-4 border-y border-[rgba(238,243,236,0.12)]" aria-hidden="true">
          <div className="ticker">
            {[...MARKETS, ...MARKETS].map((m, i) => (
              <span key={i} className="chalk chalk-faint text-xl mx-8">✦ {m}</span>
            ))}
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section id="how" className="app-container py-24">
          <Reveal><h2 className="chalk text-4xl sm:text-5xl mb-12">How a strat plays</h2></Reveal>
          <div className="flex flex-wrap gap-8 justify-center sm:justify-start">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 120} className="tilt">
                <div className={`postit ${s.paper} ${s.rot} w-80 p-6 min-h-[248px]`}>
                  <div className="text-6xl font-bold leading-none">{s.n}</div>
                  <div className="text-3xl font-bold mt-2">{s.t}</div>
                  <div className="text-lg mt-3 leading-snug">{s.d}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── REAL ODDS / REAL PROOF ── */}
        <section className="app-container pb-6">
          <div className="grid sm:grid-cols-2 gap-8">
            <Reveal className="float-a">
              <div className="ink-panel p-8 rounded-2xl h-full">
                <div className="chalk chalk-yellow text-3xl font-bold">Real odds. No made-up numbers.</div>
                <p className="chalk chalk-faint text-lg mt-3 leading-snug">
                  Every punt is priced from TxLINE&apos;s demargined &ldquo;stable price&rdquo; book — the fair,
                  no-vig line the market sees. Your add-time odds are frozen onto the punt.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120} className="float-b">
              <div className="ink-panel p-8 rounded-2xl h-full">
                <div className="chalk chalk-yellow text-3xl font-bold">Proven on-chain, not on trust.</div>
                <p className="chalk chalk-faint text-lg mt-3 leading-snug">
                  TxLINE anchors every World Cup score as a Merkle root on Solana. Bootroom lands a real
                  <span className="font-mono"> validate_stat</span> tx — an explorer-linkable receipt, win or lose.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── WHY GOALS ONLY ── */}
        <section className="app-container py-20">
          <Reveal>
            <div className="board-frame p-8 sm:p-12">
              <div className="chalk text-3xl sm:text-4xl">Why goals only?</div>
              <p className="chalk chalk-faint text-xl mt-4 max-w-3xl leading-relaxed">
                TxLINE prices exactly one family of markets — <span className="chalk-yellow">goals</span> (over/under,
                handicap, match result) — and those same goals are what&apos;s anchored on-chain. So goals are the only
                market that is <span className="chalk-yellow">both fairly priced and provable</span>. We don&apos;t fake the rest.
              </p>
            </div>
          </Reveal>
        </section>

        {/* ── CLOSING CTA ── */}
        <section className="app-container py-24 text-center">
          <Reveal>
            <h2 className="chalk text-5xl sm:text-6xl">Chalk it up.</h2>
            <p className="chalk chalk-faint text-xl mt-3">Three punts. Real odds. An on-chain receipt.</p>
            <div className="mt-9">
              <Link href="/play" className="postit paper-yellow rot-2 inline-block px-8 py-4 text-2xl font-bold gold-glow">Enter the Bootroom →</Link>
            </div>
          </Reveal>
          <div className="chalk chalk-faint text-base mt-14 flex flex-wrap gap-x-8 gap-y-2 justify-center">
            <span>every punt = a TxLINE goal market</span>
            <span className="chalk-yellow">settled by validate_stat on Solana</span>
            <span>BOOTS buy extra punts</span>
          </div>
        </section>
      </main>
    </>
  );
}

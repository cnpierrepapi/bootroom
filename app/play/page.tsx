import Link from "next/link";
import { OFFERED } from "@/lib/markets";

// Placeholder entry for the punt builder (the full strat UI is the next phase).
// Shows the goal markets on offer so the page is real, not empty.
export default function Play() {
  return (
    <main className="app-container py-16 min-h-[80vh]">
      <Link href="/" className="chalk chalk-faint text-lg hover:text-[var(--color-primary)]">← the bootroom</Link>
      <h1 className="chalk text-5xl sm:text-6xl font-bold mt-4">Build your strat</h1>
      <p className="chalk chalk-faint text-xl mt-3 max-w-xl leading-snug">
        Up to three punts on the goal markets below — each priced live from the TxLINE demargined book.
        The interactive builder is being wired next.
      </p>

      <div className="board-frame p-6 sm:p-9 mt-9">
        <div className="chalk text-2xl mb-5">Markets on offer</div>
        <div className="flex flex-wrap gap-6">
          {OFFERED.map((m, i) => (
            <div key={m.label} className={`postit ${["paper-yellow", "paper-green", "paper-blue", "paper-pink", "paper-cream"][i % 5]} ${["rot-1", "rot-2", "rot-3", "rot-4", "rot-5"][i % 5]} w-56 p-5`}>
              <div className="text-2xl font-bold">{m.label}</div>
              <div className="text-base mt-2 opacity-80">{m.picks.join(" · ")}</div>
            </div>
          ))}
        </div>
      </div>

      <p className="chalk chalk-faint text-lg mt-8">
        Score = Σ(winning odds) − Σ(losing odds), floored at 0 · 4th punt onward costs 500 BOOTS.
      </p>
    </main>
  );
}

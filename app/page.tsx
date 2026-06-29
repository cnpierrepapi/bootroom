"use client";

import { useCallback, useEffect, useState } from "react";
import TeamPickerModal from "@/components/TeamPickerModal";
import {
  getUsdc,
  getBaskets,
  getMatchday,
  createBasket,
  settleMatchday,
  cashOut,
  rollOver,
  type Basket,
} from "@/lib/store";
import type { Team } from "@/lib/teams";

function pnl(value: number, deposit: number) {
  const diff = value - deposit;
  const pct = deposit ? (diff / deposit) * 100 : 0;
  const up = diff >= 0;
  return { up, label: `${up ? "▲ +" : "▼ "}${pct.toFixed(1)}%`, color: up ? "var(--color-success)" : "var(--color-destructive)" };
}

export default function Home() {
  const [usdc, setUsdcState] = useState(0);
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [matchday, setMatchday] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [rollId, setRollId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setUsdcState(getUsdc());
    setBaskets(getBaskets());
    setMatchday(getMatchday());
  }, []);

  useEffect(() => {
    refresh();
    setMounted(true);
  }, [refresh]);

  const lockedCount = baskets.filter((b) => b.status === "locked").length;
  const rollTarget = baskets.find((b) => b.id === rollId) ?? null;

  return (
    <main className="app-container py-6 sm:py-10">
      {/* nav */}
      <nav className="flex items-center justify-between flex-wrap gap-3 mb-7">
        <div>
          <div className="chalk-faint chalk text-base">Bootroom · TxLINE World Cup</div>
          <div className="chalk text-4xl sm:text-5xl font-bold leading-none">The Bootroom</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="chalk chalk-yellow text-2xl font-bold">
            💵 {mounted ? `$${usdc.toFixed(2)}` : "…"} <span className="chalk-faint text-base font-normal">USDC</span>
          </div>
          <button
            onClick={() => {
              settleMatchday();
              refresh();
            }}
            disabled={lockedCount === 0}
            className="chalk text-lg rounded-lg border-2 border-dashed border-[rgba(238,243,236,0.35)] px-3 py-1.5 disabled:opacity-30 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition"
            title="Simulated until live TxLINE scoring is wired"
          >
            ⏱ End matchday {matchday} (sim)
          </button>
        </div>
      </nav>

      {/* the blackboard */}
      <section className="board-frame p-5 sm:p-9">
        <div className="flex items-end justify-between mb-7 px-1">
          <div>
            <div className="chalk text-3xl">The Board</div>
            <div className="chalk chalk-faint text-xl">
              {mounted ? `${baskets.length} baskets · ${lockedCount} locked` : "loading…"}
            </div>
          </div>
          <div className="chalk chalk-faint text-xl hidden sm:block">scored by ⌀ mean points</div>
        </div>

        <div className="flex flex-wrap gap-8 sm:gap-10 justify-center sm:justify-start">
          {mounted &&
            baskets.map((b) => {
              const p = pnl(b.value, b.deposit);
              const settled = b.status === "settled";
              return (
                <article
                  key={b.id}
                  className={`postit ${b.paper} ${b.rot} ${b.pin === "tape" ? "postit-tape" : "postit-pin"} w-60 p-5 pt-6`}
                >
                  <h2 className="text-2xl font-bold leading-tight">{b.name}</h2>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3">
                    {b.teams.map((t) => (
                      <span key={t.code} className="flex items-center gap-1">
                        <span className="text-xl leading-none">{t.flag}</span>
                        <span className="text-xs font-semibold opacity-70">{t.code}</span>
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <div className="text-3xl font-bold font-mono">${b.value.toFixed(2)}</div>
                      <div className="text-sm opacity-60">from ${b.deposit.toFixed(2)}</div>
                    </div>
                    {settled && (
                      <div className="text-lg font-bold" style={{ color: p.color }}>
                        {p.label}
                      </div>
                    )}
                  </div>

                  {settled ? (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => {
                          cashOut(b.id);
                          refresh();
                        }}
                        className="flex-1 py-2 rounded-lg bg-black text-[var(--postit-yellow)] font-black text-sm"
                      >
                        Cash out ${b.value.toFixed(0)}
                      </button>
                      <button
                        onClick={() => setRollId(b.id)}
                        className="flex-1 py-2 rounded-lg bg-black/10 font-bold text-sm hover:bg-black/20"
                      >
                        Roll over 🔁
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 text-sm font-semibold opacity-70">🔒 locked · ends at full-time</div>
                  )}
                </article>
              );
            })}

          {/* pin a new basket */}
          <button
            onClick={() => setCreating(true)}
            className="postit postit-empty rot-2 w-60 p-5 flex flex-col items-center justify-center text-center min-h-[210px]"
          >
            <div className="text-5xl leading-none">+</div>
            <div className="text-2xl font-bold mt-2">pin a new basket</div>
            <div className="text-sm mt-1 opacity-70">pick teams · deposit · lock</div>
          </button>
        </div>
      </section>

      {/* chalk legend */}
      <footer className="chalk chalk-faint text-xl mt-7 flex flex-wrap gap-x-8 gap-y-2 justify-center">
        <span>🔒 locked till full-time</span>
        <span>cash out your share, or roll the value into new teams</span>
        <span className="chalk-yellow">▲ value moves with real on-chain goals · corners · cards</span>
      </footer>

      {creating && (
        <TeamPickerModal
          mode="create"
          usdc={usdc}
          onClose={() => setCreating(false)}
          onConfirm={({ name, teams, deposit }) => {
            const r = createBasket(name, teams, deposit);
            if (!r.ok) return r.error;
            setCreating(false);
            refresh();
          }}
        />
      )}

      {rollTarget && (
        <TeamPickerModal
          mode="rollover"
          usdc={usdc}
          carryValue={rollTarget.value}
          onClose={() => setRollId(null)}
          onConfirm={({ teams }: { teams: Team[] }) => {
            const r = rollOver(rollTarget.id, teams);
            if (!r.ok) return r.error;
            setRollId(null);
            refresh();
          }}
        />
      )}
    </main>
  );
}

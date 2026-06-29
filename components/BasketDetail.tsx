"use client";

import { useState } from "react";
import type { Basket } from "@/lib/store";

export type Match = { fid: number; p1: string; p2: string; startTime: number; live: boolean };

const norm = (s: string) => (s || "").toLowerCase().trim();

function kickoff(ms: number) {
  const d = ms - Date.now();
  if (d <= 0) return "live";
  const h = Math.floor(d / 3_600_000);
  return h < 1 ? `in ${Math.ceil(d / 60_000)}m` : h < 24 ? `in ${h}h` : `in ${Math.floor(h / 24)}d`;
}

type Props = {
  basket: Basket;
  matches: Match[];
  onClose: () => void;
  onRename: (name: string) => void;
};

export default function BasketDetail({ basket, matches, onClose, onRename }: Props) {
  const [name, setName] = useState(basket.name);
  const teamKeys = new Set(basket.teams.flatMap((t) => [norm(t.name), norm(t.code)]));
  const related = matches.filter((m) => teamKeys.has(norm(m.p1)) || teamKeys.has(norm(m.p2)));

  const diff = basket.value - basket.deposit;
  const pct = basket.deposit ? (diff / basket.deposit) * 100 : 0;
  const up = diff >= 0;
  const settled = basket.status === "settled";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-8 overflow-y-auto"
      onClick={onClose}
    >
      <div className={`postit ${basket.paper} w-full max-w-lg p-6 sm:p-7 animate-pop`} onClick={(e) => e.stopPropagation()}>
        {/* editable name */}
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== basket.name && onRename(name)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="flex-1 bg-black/10 rounded-lg px-3 py-1.5 text-3xl font-bold outline-none focus:bg-black/15"
          />
          <span className="text-sm opacity-50">✎ edit</span>
        </div>

        {/* teams */}
        <div className="mt-4">
          <div className="text-sm font-semibold opacity-60 mb-1">Teams ({basket.teams.length}) · ⌀ mean-scored</div>
          <div className="flex flex-wrap gap-2">
            {basket.teams.map((t) => (
              <span key={t.code} className="flex items-center gap-1.5 bg-black/10 rounded-lg px-2.5 py-1 font-bold">
                <span className="text-lg leading-none">{t.flag}</span>
                {t.name}
              </span>
            ))}
          </div>
        </div>

        {/* stats */}
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="bg-black/10 rounded-lg py-2">
            <div className="text-xs opacity-60">deposit</div>
            <div className="text-xl font-bold font-mono">${basket.deposit.toFixed(2)}</div>
          </div>
          <div className="bg-black/10 rounded-lg py-2">
            <div className="text-xs opacity-60">value</div>
            <div className="text-xl font-bold font-mono">${basket.value.toFixed(2)}</div>
          </div>
          <div className="bg-black/10 rounded-lg py-2">
            <div className="text-xs opacity-60">P&amp;L</div>
            <div className="text-xl font-bold" style={{ color: up ? "var(--color-success)" : "var(--color-destructive)" }}>
              {settled ? `${up ? "+" : ""}${pct.toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>
        <div className="mt-2 text-sm font-semibold opacity-70">
          {settled ? "✓ settled — cash out or roll over from the board" : `🔒 locked · matchday ${basket.matchday} · ends at full-time`}
        </div>

        {/* live matches for these teams */}
        <div className="mt-5">
          <div className="text-sm font-semibold opacity-60 mb-2">Matches for your teams</div>
          {related.length === 0 ? (
            <div className="text-sm opacity-60 bg-black/5 rounded-lg px-3 py-2">No live or upcoming matches in the window.</div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
              {related.map((m) => (
                <div key={m.fid} className="flex items-center justify-between bg-black/10 rounded-lg px-3 py-1.5 text-sm font-semibold">
                  <span>{m.p1} <span className="opacity-50">v</span> {m.p2}</span>
                  <span className={m.live ? "text-[#b3261e] font-black" : "opacity-60"}>{m.live ? "● LIVE" : kickoff(m.startTime)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={onClose} className="mt-6 w-full py-2.5 rounded-xl bg-black text-[var(--postit-yellow)] font-black">
          Close
        </button>
      </div>
    </div>
  );
}

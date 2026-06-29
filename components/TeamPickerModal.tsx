"use client";

import { useState } from "react";
import { TEAMS, type Team } from "@/lib/teams";

const MAX_TEAMS = 6;
const MIN_TEAMS = 2;

type Props = {
  mode: "create" | "rollover";
  usdc: number;
  /** roll-over carries this realized value forward as the stake (read-only) */
  carryValue?: number;
  /** normalised names of teams still in the World Cup (empty = no filter) */
  activeNames?: string[];
  onClose: () => void;
  onConfirm: (args: { name: string; teams: Team[]; deposit: number }) => string | void;
};

const norm = (s: string) => s.toLowerCase().trim();

export default function TeamPickerModal({ mode, usdc, carryValue = 0, activeNames = [], onClose, onConfirm }: Props) {
  // Only teams still in the World Cup; fall back to all if the feed is unavailable.
  const pool = (() => {
    if (!activeNames.length) return TEAMS;
    const set = new Set(activeNames);
    const f = TEAMS.filter((t) => set.has(norm(t.name)) || set.has(norm(t.code)));
    return f.length >= 2 ? f : TEAMS;
  })();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Team[]>([]);
  const [deposit, setDeposit] = useState<number>(Math.min(50, usdc));
  const [error, setError] = useState<string | null>(null);

  const isCreate = mode === "create";

  function toggle(t: Team) {
    setError(null);
    setPicked((cur) => {
      if (cur.find((x) => x.code === t.code)) return cur.filter((x) => x.code !== t.code);
      if (cur.length >= MAX_TEAMS) {
        setError(`Up to ${MAX_TEAMS} teams — more teams dilute your mean.`);
        return cur;
      }
      return [...cur, t];
    });
  }

  function submit() {
    if (picked.length < MIN_TEAMS) return setError(`Pick at least ${MIN_TEAMS} teams.`);
    if (isCreate && (deposit <= 0 || deposit > usdc)) return setError("Enter a deposit within your USDC.");
    const err = onConfirm({ name, teams: picked, deposit: isCreate ? deposit : carryValue });
    if (typeof err === "string") setError(err);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="postit paper-yellow w-full max-w-lg p-6 sm:p-7 animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-3xl font-bold leading-tight">
          {isCreate ? "Pin a new basket" : "Roll over — re-pick your teams"}
        </h2>
        <p className="text-base opacity-70 mt-1">
          {isCreate
            ? "Name it, pick your teams, deposit USDC. It locks till the matchday ends."
            : `Your $${carryValue.toFixed(2)} rolls forward as the new stake.`}
        </p>

        {isCreate && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Basket name (e.g. Dark Horses)"
            className="mt-4 w-full bg-black/10 rounded-lg px-3 py-2 text-lg font-bold placeholder:opacity-50 outline-none focus:bg-black/15"
          />
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between text-sm font-semibold opacity-70 mb-2">
            <span>Pick teams ({picked.length}/{MAX_TEAMS}) · still in the WC</span>
            <span>scored by ⌀ mean</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
            {pool.map((t) => {
              const on = !!picked.find((x) => x.code === t.code);
              return (
                <button
                  key={t.code}
                  onClick={() => toggle(t)}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-bold transition ${
                    on ? "bg-black text-[var(--postit-yellow)]" : "bg-black/10 hover:bg-black/20"
                  }`}
                >
                  <span className="text-lg leading-none">{t.flag}</span>
                  <span className="truncate">{t.code}</span>
                </button>
              );
            })}
          </div>
        </div>

        {isCreate && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm font-semibold mb-1">
              <span className="opacity-70">Deposit USDC</span>
              <span className="opacity-60">wallet ${usdc.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={5}
                max={Math.max(5, usdc)}
                step={5}
                value={Math.min(deposit, usdc)}
                onChange={(e) => setDeposit(Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: "#0a1628" }}
              />
              <span className="text-2xl font-bold font-mono w-24 text-right">${deposit}</span>
            </div>
          </div>
        )}

        {error && <div className="mt-3 text-sm font-bold text-[#b3261e]">{error}</div>}

        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-black/10 font-bold hover:bg-black/20">
            Cancel
          </button>
          <button onClick={submit} className="flex-1 py-2.5 rounded-xl bg-black text-[var(--postit-yellow)] font-black">
            {isCreate ? "Pin it 📌" : "Roll over 🔁"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Client-side store (localStorage) for the Bootroom board.
// Phase 2 stub: a demo USDC wallet + baskets + create / cash-out / roll-over,
// plus a SIMULATED matchday settlement so the full loop is clickable.
// Phase 3 replaces the stub NAV with real TxLINE mean-scoring + validate_stat.

import type { Team } from "./teams";

const USDC_KEY = "bootroom_usdc";
const BASKETS_KEY = "bootroom_baskets";
const MATCHDAY_KEY = "bootroom_matchday";
const START_USDC = 500;

const PAPERS = ["paper-yellow", "paper-blue", "paper-green", "paper-pink", "paper-cream"];
const ROTS = ["rot-1", "rot-2", "rot-3", "rot-4", "rot-5"];

export type Basket = {
  id: string;
  name: string;
  teams: Team[];
  deposit: number; // USDC committed when (re)locked
  value: number; // current NAV
  createdAt: number;
  matchday: number; // the matchday this basket is locked into
  status: "locked" | "settled"; // settled = matchday ended, value realized
  paper: string;
  rot: string;
  pin: "tape" | "pin";
};

const isBrowser = () => typeof window !== "undefined";

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, val: unknown) {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(val));
}

// ── USDC wallet (demo) ──
export function getUsdc(): number {
  if (!isBrowser()) return START_USDC;
  const raw = window.localStorage.getItem(USDC_KEY);
  if (raw === null) {
    write(USDC_KEY, START_USDC);
    return START_USDC;
  }
  return Number(raw) || 0;
}
function setUsdc(v: number) {
  write(USDC_KEY, Math.max(0, Math.round(v * 100) / 100));
}

// ── matchday counter ──
export function getMatchday(): number {
  return read<number>(MATCHDAY_KEY, 1);
}

// ── baskets ──
export function getBaskets(): Basket[] {
  return read<Basket[]>(BASKETS_KEY, []);
}
function setBaskets(b: Basket[]) {
  write(BASKETS_KEY, b);
}

/** Deterministic stub NAV: a pseudo-random matchday performance per basket.
 *  Mean of per-team factors so basket SIZE isn't strictly better (selection skill).
 *  Replaced by real TxLINE mean-scoring in Phase 3. */
function stubValue(basket: Basket): number {
  let acc = 0;
  for (const t of basket.teams) {
    const seed = `${t.code}-${basket.matchday}`;
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    // factor in [0.55, 1.65]
    acc += 0.55 + (h % 1101) / 1000;
  }
  const meanFactor = acc / basket.teams.length;
  return Math.round(basket.deposit * meanFactor * 100) / 100;
}

export function createBasket(name: string, teams: Team[], deposit: number): { ok: boolean; error?: string } {
  const usdc = getUsdc();
  if (deposit <= 0) return { ok: false, error: "Deposit must be greater than 0." };
  if (deposit > usdc) return { ok: false, error: "Not enough USDC." };
  if (teams.length < 2) return { ok: false, error: "Pick at least 2 teams." };

  const i = getBaskets().length;
  const basket: Basket = {
    id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || "Untitled basket",
    teams,
    deposit,
    value: deposit, // locked at par until the matchday settles
    createdAt: Date.now(),
    matchday: getMatchday(),
    status: "locked",
    paper: PAPERS[i % PAPERS.length],
    rot: ROTS[i % ROTS.length],
    pin: i % 2 === 0 ? "tape" : "pin",
  };
  setUsdc(usdc - deposit);
  setBaskets([...getBaskets(), basket]);
  return { ok: true };
}

/** Rename a basket. */
export function renameBasket(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  setBaskets(getBaskets().map((b) => (b.id === id ? { ...b, name: trimmed } : b)));
}

/** Simulate the matchday ending: realize NAV for every locked basket. */
export function settleMatchday() {
  const baskets = getBaskets().map((b) =>
    b.status === "locked" ? { ...b, value: stubValue(b), status: "settled" as const } : b,
  );
  setBaskets(baskets);
  write(MATCHDAY_KEY, getMatchday() + 1);
}

/** Cash out a settled basket: its value returns to the USDC wallet, note comes down. */
export function cashOut(id: string): { ok: boolean; error?: string } {
  const baskets = getBaskets();
  const b = baskets.find((x) => x.id === id);
  if (!b) return { ok: false, error: "Basket not found." };
  if (b.status !== "settled") return { ok: false, error: "Locked until the matchday ends." };
  setUsdc(getUsdc() + b.value);
  setBaskets(baskets.filter((x) => x.id !== id));
  return { ok: true };
}

/** Roll over: carry this basket's value into a fresh basket of new teams for the next matchday. */
export function rollOver(id: string, newTeams: Team[]): { ok: boolean; error?: string } {
  if (newTeams.length < 2) return { ok: false, error: "Pick at least 2 teams." };
  const baskets = getBaskets();
  const b = baskets.find((x) => x.id === id);
  if (!b) return { ok: false, error: "Basket not found." };
  if (b.status !== "settled") return { ok: false, error: "Locked until the matchday ends." };
  const rolled: Basket = {
    ...b,
    teams: newTeams,
    deposit: b.value, // roll the realized value forward as the new stake
    value: b.value,
    matchday: getMatchday(),
    status: "locked",
  };
  setBaskets(baskets.map((x) => (x.id === id ? rolled : x)));
  return { ok: true };
}

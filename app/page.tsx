// Static visual of the board — aesthetic checkpoint only (no interactivity yet).
// Demonstrates the post-it-on-blackboard language: each basket is a sticky note
// pinned at an angle, showing its teams, current value, P&L, and lock state.

type Sample = {
  name: string;
  teams: { flag: string; abbr: string }[];
  value: number;
  deposit: number;
  locked: boolean;
  note: string;
  paper: string;
  rot: string;
  pin: "tape" | "pin";
};

const SAMPLES: Sample[] = [
  {
    name: "Group of Goals",
    teams: [
      { flag: "🇧🇷", abbr: "BRA" },
      { flag: "🇳🇱", abbr: "NED" },
      { flag: "🇪🇸", abbr: "ESP" },
    ],
    value: 142.5,
    deposit: 100,
    locked: true,
    note: "matchday 2",
    paper: "paper-yellow",
    rot: "rot-1",
    pin: "tape",
  },
  {
    name: "Dark Horses",
    teams: [
      { flag: "🇲🇦", abbr: "MAR" },
      { flag: "🇯🇵", abbr: "JPN" },
      { flag: "🇸🇳", abbr: "SEN" },
    ],
    value: 88.2,
    deposit: 100,
    locked: true,
    note: "matchday 2",
    paper: "paper-blue",
    rot: "rot-2",
    pin: "pin",
  },
  {
    name: "Set-Piece Kings",
    teams: [
      { flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", abbr: "ENG" },
      { flag: "🇭🇷", abbr: "CRO" },
      { flag: "🇩🇰", abbr: "DEN" },
    ],
    value: 117.9,
    deposit: 100,
    locked: false,
    note: "open · pick & lock",
    paper: "paper-green",
    rot: "rot-3",
    pin: "tape",
  },
  {
    name: "Chaos Merchants",
    teams: [
      { flag: "🇦🇷", abbr: "ARG" },
      { flag: "🇺🇾", abbr: "URU" },
      { flag: "🇲🇽", abbr: "MEX" },
    ],
    value: 73.4,
    deposit: 100,
    locked: true,
    note: "matchday 2",
    paper: "paper-pink",
    rot: "rot-4",
    pin: "pin",
  },
  {
    name: "Old Guard",
    teams: [
      { flag: "🇩🇪", abbr: "GER" },
      { flag: "🇫🇷", abbr: "FRA" },
      { flag: "🇵🇹", abbr: "POR" },
    ],
    value: 101.1,
    deposit: 100,
    locked: false,
    note: "open · pick & lock",
    paper: "paper-cream",
    rot: "rot-5",
    pin: "tape",
  },
];

function pnl(value: number, deposit: number) {
  const diff = value - deposit;
  const pct = (diff / deposit) * 100;
  const up = diff >= 0;
  return {
    up,
    label: `${up ? "▲" : "▼"} ${up ? "+" : ""}${pct.toFixed(1)}%`,
    color: up ? "var(--color-success)" : "var(--color-destructive)",
  };
}

export default function Home() {
  return (
    <main className="app-container py-8 sm:py-12">
      {/* Chalk header */}
      <header className="text-center mb-8">
        <div className="chalk-faint chalk text-lg">Ballbasket · TxLINE World Cup</div>
        <h1 className="chalk text-5xl sm:text-7xl font-bold mt-1">
          Pin your teams. <span className="chalk-yellow">Score the matchday.</span>
        </h1>
        <p className="chalk chalk-faint text-2xl mt-2">
          a basket of teams · deposit USDC · real match stats move its value · cash out or roll over
        </p>
      </header>

      {/* The blackboard */}
      <section className="board-frame p-6 sm:p-10">
        <div className="flex items-end justify-between mb-7 px-1">
          <div>
            <div className="chalk text-3xl">The Board</div>
            <div className="chalk chalk-faint text-xl">5 baskets · 3 locked · pool $1,240 USDC</div>
          </div>
          <div className="chalk chalk-faint text-xl hidden sm:block">scored by ⌀ mean points</div>
        </div>

        <div className="flex flex-wrap gap-8 sm:gap-10 justify-center sm:justify-start">
          {SAMPLES.map((b) => {
            const p = pnl(b.value, b.deposit);
            return (
              <article
                key={b.name}
                className={`postit ${b.paper} ${b.rot} ${
                  b.pin === "tape" ? "postit-tape" : "postit-pin"
                } w-56 p-5 pt-6`}
              >
                <h2 className="text-2xl font-bold leading-tight">{b.name}</h2>

                <div className="flex items-center gap-2 mt-3">
                  {b.teams.map((t) => (
                    <span key={t.abbr} className="flex flex-col items-center">
                      <span className="text-2xl leading-none">{t.flag}</span>
                      <span className="text-xs font-semibold opacity-70">{t.abbr}</span>
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-3xl font-bold font-mono">${b.value.toFixed(0)}</div>
                    <div className="text-sm opacity-60">from ${b.deposit}</div>
                  </div>
                  <div className="text-lg font-bold" style={{ color: p.color }}>
                    {p.label}
                  </div>
                </div>

                <div className="mt-3 text-sm font-semibold">
                  {b.locked ? (
                    <span className="opacity-70">🔒 locked · {b.note}</span>
                  ) : (
                    <span style={{ color: "#1a1407" }}>✎ {b.note}</span>
                  )}
                </div>
              </article>
            );
          })}

          {/* pin a new basket */}
          <article className="postit postit-empty rot-2 w-56 p-5 flex flex-col items-center justify-center text-center min-h-[210px]">
            <div className="text-5xl leading-none">+</div>
            <div className="text-2xl font-bold mt-2">pin a new basket</div>
            <div className="text-sm mt-1 opacity-70">pick 3 teams · deposit · lock</div>
          </article>
        </div>
      </section>

      {/* chalk legend */}
      <footer className="chalk chalk-faint text-xl mt-7 flex flex-wrap gap-x-8 gap-y-2 justify-center">
        <span>🔒 locked till full-time</span>
        <span>✎ open — re-pick &amp; roll over</span>
        <span className="chalk-yellow">▲ value moves with real on-chain goals · corners · cards</span>
      </footer>
    </main>
  );
}

-- Odds book + fixtures registry for goals markets (the only markets TxLINE
-- prices). Additive — does not touch br_punts yet (grammar swap is 0004).
-- RLS on, no policies → service-role only, read via server routes like the rest.

create table if not exists public.br_fixtures (
  fixture_id      integer primary key,
  p1              text,
  p2              text,
  kickoff_ts      bigint,
  min_ts          bigint,
  max_ts          bigint,
  final_p1_goals  integer,
  final_p2_goals  integer,
  source          text not null default 'replay',   -- 'replay' | 'live'
  created_at      timestamptz not null default now()
);

-- One row per demargined market snapshot. prices maps pick -> decimal odds,
-- e.g. {"over":1.957,"under":2.045} / {"part1":2.6,"part2":1.63} / {"home","draw","away"}.
create table if not exists public.br_odds (
  id          bigint generated always as identity primary key,
  fixture_id  integer not null,
  ts          bigint  not null,                       -- epoch ms
  kind        text    not null check (kind in ('OU','AH','1X2')),
  line        numeric(5,2),                            -- null for 1X2
  prices      jsonb   not null,
  created_at  timestamptz not null default now()
);
-- Lookup: latest snapshot for a fixture's specific market at/<= a ts.
create index if not exists br_odds_lookup on public.br_odds (fixture_id, kind, line, ts desc);

alter table public.br_fixtures enable row level security;
alter table public.br_odds     enable row level security;
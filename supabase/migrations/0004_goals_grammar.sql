-- Phase 2: swap br_punts from the 4-stat prop grammar to GOALS-ONLY markets
-- (the only markets TxLINE prices). Tables are empty, so this restructures freely.
-- br_add_punt now prices SERVER-SIDE from the real br_odds book — the client picks
-- a market, never an odds value. (Pricing gets a fallback in 0005.)

-- as-of clock: the feed position a fixture is quoted at (kickoff for replay).
alter table public.br_fixtures add column if not exists as_of_ts bigint;
update public.br_fixtures set as_of_ts = min_ts where as_of_ts is null;

alter table public.br_punts drop column if exists side;
alter table public.br_punts drop column if exists team_code;
alter table public.br_punts drop column if exists stat;
alter table public.br_punts drop column if exists threshold;
alter table public.br_punts drop column if exists scope;
alter table public.br_punts drop column if exists observed;

alter table public.br_punts add column if not exists market text;
alter table public.br_punts add column if not exists line numeric(5,2);
alter table public.br_punts add column if not exists pick text;
alter table public.br_punts add column if not exists proof_status text not null default 'pending';
alter table public.br_punts add column if not exists proof_root text;
alter table public.br_punts add column if not exists proof_tx text;
alter table public.br_punts add column if not exists base_seq integer;
alter table public.br_punts add column if not exists settle_seq integer;
alter table public.br_punts add column if not exists settle_ts bigint;

alter table public.br_punts add constraint br_punts_market_chk check (market in ('OU','AH','1X2'));
alter table public.br_punts add constraint br_punts_pick_chk
  check (pick in ('over','under','part1','part2','home','draw','away'));
alter table public.br_punts add constraint br_punts_proofstatus_chk
  check (proof_status in ('pending','verified','unprovable'));
alter table public.br_punts drop constraint if exists br_punts_resolved_check;
alter table public.br_punts add constraint br_punts_resolved_chk
  check (resolved in ('hit','miss','push'));

-- br_add_punt signature changes to (device, strat, fixture, market, line, pick,
-- extra_cost) and prices from br_odds. Body is finalized in 0005 (adds the
-- opening-line fallback), so it is intentionally not duplicated here.
drop function if exists public.br_add_punt(text,bigint,integer,text,text,text,integer,text,numeric,integer);
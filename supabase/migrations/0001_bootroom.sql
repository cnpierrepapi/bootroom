-- Bootroom persistence — ISOLATED from Foil and Spikelines. Every object is
-- prefixed br_ and lives in its own footprint inside the shared foil project
-- (mohbmvajroqizlfaarjk). Accessed ONLY via the service-role key from server API
-- routes; RLS is ON with NO policies, so the anon key (which ships in the client
-- bundle for Foil) can never read or write these.

-- ── IDENTITY ────────────────────────────────────────────────────────────────
-- One row per device (localStorage id), optional linked wallet for withdrawals.
-- Holds the TWO cached balances as SEPARATE columns for two SEPARATE ledgers:
--   boots_balance     = buy-in currency, NON-redeemable, NEVER withdrawable
--   reward_owed_usdc  = admin-funded winnings, withdrawable to wallet
-- No function ever moves value between these two columns. That is the whole rule.
create table if not exists public.br_users (
  device_id        text primary key,
  username         text,
  wallet           text,
  boots_balance    integer        not null default 0,   -- BOOTS ledger (locked)
  reward_owed_usdc numeric(12,6)  not null default 0,    -- REWARD ledger (withdrawable)
  created_at       timestamptz    not null default now(),
  updated_at       timestamptz    not null default now()
);
create unique index if not exists br_users_username_uniq
  on public.br_users (lower(username)) where username is not null;

-- ── GAME: one strat per user per day ─────────────────────────────────────────
create table if not exists public.br_strats (
  id         bigint generated always as identity primary key,
  device_id  text not null references public.br_users(device_id),
  game_day   date not null,
  score      numeric(10,4) not null default 0,   -- final signed-odds score, floored 0
  settled    boolean not null default false,
  created_at timestamptz not null default now(),
  unique (device_id, game_day)                    -- 1 strat / user / day
);
create index if not exists br_strats_day_score_idx
  on public.br_strats (game_day, score desc);

-- ── GAME: punts (<=3 free, 4th+ costs 500 BOOTS). Odds SNAPSHOTTED at add-time ─
create table if not exists public.br_punts (
  id         bigint generated always as identity primary key,
  strat_id   bigint not null references public.br_strats(id) on delete cascade,
  slot       smallint not null,                  -- 1,2,3 = B1/B2/B3; 4+ = BOOTS-paid
  fixture_id integer  not null,
  side       text     not null check (side in ('home','away')),
  team_code  text,
  stat       text     not null check (stat in ('goal','corner','yellow','red')),
  threshold  smallint not null,                  -- "at least n"
  scope      text     not null check (scope in ('1H','2H','FT')),
  odds       numeric(8,3) not null,              -- FROZEN TxLINE decimal odds at add-time
  boots_paid integer  not null default 0,        -- 0 for slots 1-3; 500 for extras
  resolved   text     check (resolved in ('hit','miss')),  -- null until settlement
  observed   integer,
  proof_json jsonb,                              -- validate_stat receipt / Merkle proof
  created_at timestamptz not null default now(),
  unique (strat_id, slot)
);

-- ── BOOTS LEDGER (non-redeemable, NEVER withdrawable) ────────────────────────
-- Purchases: USDC -> BOOTS. signature PK = idempotent crediting (same as spk).
create table if not exists public.br_boots_purchases (
  signature  text primary key,
  device_id  text not null,
  wallet     text,
  usdc       numeric(12,6) not null,
  boots      integer not null,
  tier       smallint not null check (tier in (1,2,3)),
  created_at timestamptz not null default now()
);
-- Append-only audit of every BOOTS movement (buy +, extra-punt spend -).
create table if not exists public.br_boots_ledger (
  id            bigint generated always as identity primary key,
  device_id     text not null,
  delta         integer not null,                -- +credit / -spend
  reason        text not null,                   -- 'purchase' | 'extra_punt'
  ref           text,                            -- signature (buy) or punt id (spend)
  balance_after integer not null,
  created_at    timestamptz not null default now()
);

-- ── REWARD LEDGER (admin-funded USDC, withdrawable) ──────────────────────────
-- Admin sets the pool for a game_day at END OF THE PREVIOUS DAY.
create table if not exists public.br_reward_pools (
  game_day       date primary key,
  pool_usdc      numeric(12,6) not null,
  distributed    boolean not null default false,
  created_at     timestamptz not null default now(),
  distributed_at timestamptz
);
-- Per-user allocation from a distributed pool (pro-rata by score + dust rule).
create table if not exists public.br_payouts (
  id          bigint generated always as identity primary key,
  game_day    date not null,
  device_id   text not null,
  score       numeric(10,4) not null,
  amount_usdc numeric(12,6) not null,
  created_at  timestamptz not null default now(),
  unique (game_day, device_id)
);
-- Admin-cleared withdrawals (Spotr custodial push). status lifecycle below.
create table if not exists public.br_withdrawals (
  id         bigint generated always as identity primary key,
  device_id  text not null,
  wallet     text not null,
  usdc       numeric(12,6) not null,
  status     text not null default 'pending' check (status in ('pending','processing','paid')),
  signature  text,
  error      text,
  created_at timestamptz not null default now(),
  paid_at    timestamptz
);
create index if not exists br_withdrawals_status_idx on public.br_withdrawals (status);

-- RLS ON, NO policies -> service-role-only (anon key locked out entirely).
alter table public.br_users            enable row level security;
alter table public.br_strats           enable row level security;
alter table public.br_punts            enable row level security;
alter table public.br_boots_purchases  enable row level security;
alter table public.br_boots_ledger     enable row level security;
alter table public.br_reward_pools     enable row level security;
alter table public.br_payouts          enable row level security;
alter table public.br_withdrawals      enable row level security;

-- ── RPCs (all SECURITY DEFINER; locked down in 0002) ─────────────────────────

-- Upsert identity/profile. Wallet only ever set, never blanked.
create or replace function public.br_upsert_user(
  p_device text, p_username text, p_wallet text
) returns public.br_users language plpgsql security definer as $$
declare r public.br_users;
begin
  insert into public.br_users as u (device_id, username, wallet, updated_at)
  values (p_device, nullif(p_username,''), nullif(p_wallet,''), now())
  on conflict (device_id) do update set
    username   = coalesce(nullif(excluded.username,''), u.username),
    wallet     = coalesce(nullif(excluded.wallet,''), u.wallet),
    updated_at = now()
  returning * into r;
  return r;
end $$;

-- Get (or lazily create) today's strat for a device. Enforces 1/user/day via the
-- unique (device_id, game_day) constraint; returns the existing row on conflict.
create or replace function public.br_get_or_create_strat(
  p_device text, p_day date
) returns public.br_strats language plpgsql security definer as $$
declare r public.br_strats;
begin
  insert into public.br_strats (device_id, game_day)
  values (p_device, p_day)
  on conflict (device_id, game_day) do update set device_id = excluded.device_id
  returning * into r;
  return r;
end $$;

-- Add a punt to a strat. Slots 1-3 are free; the 4th+ costs 500 BOOTS, debited
-- ATOMICALLY here (guard balance, decrement, append ledger) before the punt lands.
-- Odds are passed frozen from the client's add-time TxLINE snapshot.
-- Returns jsonb {ok, error?, punt_id?, slot?, boots_paid?, boots_balance?}.
create or replace function public.br_add_punt(
  p_device text, p_strat_id bigint, p_fixture integer, p_side text, p_team text,
  p_stat text, p_threshold integer, p_scope text, p_odds numeric, p_extra_cost integer
) returns jsonb language plpgsql security definer as $$
declare
  v_owner text; v_settled boolean; v_slot integer; v_cost integer := 0;
  v_bal integer; v_punt bigint;
begin
  select device_id, settled into v_owner, v_settled
    from public.br_strats where id = p_strat_id for update;
  if v_owner is null then return jsonb_build_object('ok',false,'error','no_strat'); end if;
  if v_owner <> p_device then return jsonb_build_object('ok',false,'error','not_owner'); end if;
  if v_settled then return jsonb_build_object('ok',false,'error','settled'); end if;

  select coalesce(max(slot),0)+1 into v_slot from public.br_punts where strat_id = p_strat_id;

  if v_slot > 3 then
    v_cost := coalesce(p_extra_cost,500);
    select boots_balance into v_bal from public.br_users where device_id = p_device for update;
    if v_bal is null or v_bal < v_cost then
      return jsonb_build_object('ok',false,'error','insufficient_boots','boots_balance',coalesce(v_bal,0));
    end if;
    update public.br_users set boots_balance = boots_balance - v_cost, updated_at = now()
      where device_id = p_device returning boots_balance into v_bal;
  else
    select boots_balance into v_bal from public.br_users where device_id = p_device;
  end if;

  insert into public.br_punts
    (strat_id, slot, fixture_id, side, team_code, stat, threshold, scope, odds, boots_paid)
  values
    (p_strat_id, v_slot, p_fixture, p_side, p_team, p_stat, p_threshold, p_scope, p_odds, v_cost)
  returning id into v_punt;

  if v_cost > 0 then
    insert into public.br_boots_ledger (device_id, delta, reason, ref, balance_after)
    values (p_device, -v_cost, 'extra_punt', v_punt::text, v_bal);
  end if;

  return jsonb_build_object('ok',true,'punt_id',v_punt,'slot',v_slot,
                            'boots_paid',v_cost,'boots_balance',coalesce(v_bal,0));
end $$;

-- Credit BOOTS from a verified USDC pack purchase. signature = idempotency key;
-- a replayed tx conflicts and credits nothing. Returns the new BOOTS balance.
create or replace function public.br_credit_boots(
  p_device text, p_wallet text, p_signature text,
  p_usdc numeric, p_boots integer, p_tier integer
) returns integer language plpgsql security definer as $$
declare v_bal integer;
begin
  insert into public.br_boots_purchases (signature, device_id, wallet, usdc, boots, tier)
  values (p_signature, p_device, nullif(p_wallet,''), p_usdc, p_boots, p_tier)
  on conflict (signature) do nothing;
  if not found then                                   -- already credited this tx
    select boots_balance into v_bal from public.br_users where device_id = p_device;
    return coalesce(v_bal,0);
  end if;

  insert into public.br_users as u (device_id, wallet, boots_balance, updated_at)
  values (p_device, nullif(p_wallet,''), p_boots, now())
  on conflict (device_id) do update set
    boots_balance = u.boots_balance + p_boots,
    wallet        = coalesce(nullif(excluded.wallet,''), u.wallet),
    updated_at    = now()
  returning boots_balance into v_bal;

  insert into public.br_boots_ledger (device_id, delta, reason, ref, balance_after)
  values (p_device, p_boots, 'purchase', p_signature, v_bal);
  return v_bal;
end $$;

-- Finalize a strat after its punts are resolved. Score = SUM(win odds) - SUM(lose
-- odds), FLOORED at 0. Server sets each punt's resolved/observed/proof first (via
-- service-role update), then calls this. Returns the final score.
create or replace function public.br_finalize_strat(p_strat_id bigint)
returns numeric language plpgsql security definer as $$
declare v_score numeric;
begin
  select greatest(0, coalesce(sum(
           case when resolved = 'hit'  then odds
                when resolved = 'miss' then -odds
                else 0 end), 0))
    into v_score from public.br_punts where strat_id = p_strat_id;
  update public.br_strats set score = v_score, settled = true where id = p_strat_id;
  return v_score;
end $$;

-- Admin sets (or updates) a day's reward pool. Refuses once distributed.
create or replace function public.br_set_reward_pool(p_day date, p_usdc numeric)
returns public.br_reward_pools language plpgsql security definer as $$
declare r public.br_reward_pools;
begin
  insert into public.br_reward_pools (game_day, pool_usdc)
  values (p_day, p_usdc)
  on conflict (game_day) do update set pool_usdc = excluded.pool_usdc
    where public.br_reward_pools.distributed = false
  returning * into r;
  if r.game_day is null then
    raise exception 'pool for % already distributed', p_day;
  end if;
  return r;
end $$;

-- Distribute a day's pool pro-rata by final score. Atomic + IDEMPOTENT (refuses a
-- day already distributed). Dust rule: pay floored shares, remainder -> top score
-- (tiebreak earliest strat id). Credits each winner's reward_owed_usdc.
-- Returns the number of winners paid, or -1 if the day is unknown/already done.
create or replace function public.br_distribute_day(p_day date)
returns integer language plpgsql security definer as $$
declare
  v_pool numeric(12,6); v_total numeric; v_paid numeric(12,6) := 0;
  v_top text; r record; amt numeric(12,6); n integer := 0;
begin
  select pool_usdc into v_pool from public.br_reward_pools
    where game_day = p_day and distributed = false for update;
  if v_pool is null then return -1; end if;

  select coalesce(sum(score),0) into v_total from public.br_strats
    where game_day = p_day and score > 0;
  if v_total = 0 then                                 -- nobody scored: leave pool intact
    update public.br_reward_pools set distributed = true, distributed_at = now()
      where game_day = p_day;
    return 0;
  end if;

  for r in select device_id, score from public.br_strats
           where game_day = p_day and score > 0
           order by score desc, id asc loop
    amt := floor((v_pool * r.score / v_total) * 1e6) / 1e6;
    if v_top is null then v_top := r.device_id; end if;   -- highest score = dust catcher
    insert into public.br_payouts (game_day, device_id, score, amount_usdc)
      values (p_day, r.device_id, r.score, amt);
    v_paid := v_paid + amt;
    n := n + 1;
  end loop;

  if v_pool - v_paid > 0 then                          -- dust -> top score
    update public.br_payouts set amount_usdc = amount_usdc + (v_pool - v_paid)
      where game_day = p_day and device_id = v_top;
  end if;

  update public.br_users u set reward_owed_usdc = reward_owed_usdc + p.amount_usdc,
    updated_at = now()
    from public.br_payouts p
    where p.game_day = p_day and p.device_id = u.device_id;

  update public.br_reward_pools set distributed = true, distributed_at = now()
    where game_day = p_day;
  return n;
end $$;

-- Move a user's whole withdrawable balance into a pending withdrawal. The admin
-- payout script pays status='pending' rows off-chain (Spotr custodial). Returns
-- the amount queued (0 if nothing owed or no wallet linked).
create or replace function public.br_request_withdraw(p_device text)
returns numeric language plpgsql security definer as $$
declare amt numeric; w text;
begin
  select reward_owed_usdc, wallet into amt, w
    from public.br_users where device_id = p_device for update;
  if amt is null or amt <= 0 or w is null then return 0; end if;
  update public.br_users set reward_owed_usdc = 0, updated_at = now() where device_id = p_device;
  insert into public.br_withdrawals (device_id, wallet, usdc) values (p_device, w, amt);
  return amt;
end $$;

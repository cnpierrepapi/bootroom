-- Phase 3: fixture-level on-chain proof + spend ledger + verification-gated payout.
-- A goals punt settles from (p1,p2) goals, so proving both stats at the final seq
-- verifies the whole fixture; all its punts flip verified. Distribution (the unlock)
-- is gated on no fixture still 'pending' (the sweep has resolved every proof).

alter table public.br_fixtures add column if not exists proof_status text not null default 'pending';
alter table public.br_fixtures add column if not exists settle_seq integer;
alter table public.br_fixtures add column if not exists proof_root text;
alter table public.br_fixtures add column if not exists proof_tx_p1 text;
alter table public.br_fixtures add column if not exists proof_tx_p2 text;
alter table public.br_fixtures add column if not exists proven_p1_goals integer;
alter table public.br_fixtures add column if not exists proven_p2_goals integer;
alter table public.br_fixtures add column if not exists proof_detail text;
alter table public.br_fixtures add column if not exists proof_attempts integer not null default 0;
alter table public.br_fixtures add column if not exists proof_checked_at timestamptz;
alter table public.br_fixtures add constraint br_fixtures_proofstatus_chk
  check (proof_status in ('pending','verified','unprovable'));

-- Every landed validate_stat tx (for the 1.4 SOL spend cap = sum(lamports)).
create table if not exists public.br_proof_ledger (
  id         bigint generated always as identity primary key,
  fixture_id integer not null,
  tx         text not null,
  lamports   integer not null default 5000,
  created_at timestamptz not null default now()
);
alter table public.br_proof_ledger enable row level security;

create or replace function public.br_proof_spent_lamports()
returns bigint language sql security definer as $$
  select coalesce(sum(lamports),0)::bigint from public.br_proof_ledger;
$$;

create or replace function public.br_verify_fixture(
  p_fid integer, p_seq integer, p_root text, p_tx1 text, p_tx2 text,
  p_p1 integer, p_p2 integer, p_lamports integer
) returns void language plpgsql security definer as $$
begin
  update public.br_fixtures set
    proof_status='verified', settle_seq=p_seq, proof_root=p_root,
    proof_tx_p1=p_tx1, proof_tx_p2=p_tx2, proven_p1_goals=p_p1, proven_p2_goals=p_p2,
    proof_detail='validate_stat ✓', proof_attempts=proof_attempts+1, proof_checked_at=now()
  where fixture_id=p_fid;
  update public.br_punts set proof_status='verified', proof_root=p_root, proof_tx = p_tx1
    where fixture_id=p_fid and (resolved is not null);
  insert into public.br_proof_ledger (fixture_id, tx, lamports) values
    (p_fid, p_tx1, p_lamports/2), (p_fid, p_tx2, p_lamports/2);
end $$;

create or replace function public.br_mark_fixture_proof(
  p_fid integer, p_status text, p_detail text
) returns void language plpgsql security definer as $$
begin
  update public.br_fixtures set
    proof_status = case when p_status='unprovable' then 'unprovable' else proof_status end,
    proof_detail = p_detail, proof_attempts = proof_attempts+1, proof_checked_at = now()
  where fixture_id = p_fid;
  if p_status='unprovable' then
    update public.br_punts set proof_status='unprovable' where fixture_id=p_fid and resolved is not null;
  end if;
end $$;

create or replace function public.br_day_pending_fixtures(p_day date)
returns table(fixture_id integer, proof_status text) language sql security definer as $$
  select distinct p.fixture_id, coalesce(f.proof_status,'pending')
  from public.br_punts p
  join public.br_strats s on s.id = p.strat_id
  left join public.br_fixtures f on f.fixture_id = p.fixture_id
  where s.game_day = p_day and s.score > 0 and s.settled
    and coalesce(f.proof_status,'pending') = 'pending';
$$;

create or replace function public.br_distribute_day(p_day date)
returns integer language plpgsql security definer as $$
declare
  v_pool numeric(12,6); v_total numeric; v_paid numeric(12,6) := 0;
  v_top text; r record; amt numeric(12,6); n integer := 0; v_pending integer;
begin
  select pool_usdc into v_pool from public.br_reward_pools
    where game_day = p_day and distributed = false for update;
  if v_pool is null then return -1; end if;
  select count(*) into v_pending from public.br_day_pending_fixtures(p_day);
  if v_pending > 0 then return -2; end if;
  select coalesce(sum(score),0) into v_total from public.br_strats
    where game_day = p_day and score > 0;
  if v_total = 0 then
    update public.br_reward_pools set distributed = true, distributed_at = now() where game_day = p_day;
    return 0;
  end if;
  for r in select device_id, score from public.br_strats
           where game_day = p_day and score > 0 order by score desc, id asc loop
    amt := floor((v_pool * r.score / v_total) * 1e6) / 1e6;
    if v_top is null then v_top := r.device_id; end if;
    insert into public.br_payouts (game_day, device_id, score, amount_usdc) values (p_day, r.device_id, r.score, amt);
    v_paid := v_paid + amt; n := n + 1;
  end loop;
  if v_pool - v_paid > 0 then
    update public.br_payouts set amount_usdc = amount_usdc + (v_pool - v_paid) where game_day = p_day and device_id = v_top;
  end if;
  update public.br_users u set reward_owed_usdc = reward_owed_usdc + p.amount_usdc, updated_at = now()
    from public.br_payouts p where p.game_day = p_day and p.device_id = u.device_id;
  update public.br_reward_pools set distributed = true, distributed_at = now() where game_day = p_day;
  return n;
end $$;

alter function public.br_proof_spent_lamports() set search_path = public, pg_temp;
alter function public.br_verify_fixture(integer,integer,text,text,text,integer,integer,integer) set search_path = public, pg_temp;
alter function public.br_mark_fixture_proof(integer,text,text) set search_path = public, pg_temp;
alter function public.br_day_pending_fixtures(date) set search_path = public, pg_temp;
alter function public.br_distribute_day(date) set search_path = public, pg_temp;
revoke execute on function public.br_proof_spent_lamports() from public, anon, authenticated;
revoke execute on function public.br_verify_fixture(integer,integer,text,text,text,integer,integer,integer) from public, anon, authenticated;
revoke execute on function public.br_mark_fixture_proof(integer,text,text) from public, anon, authenticated;
revoke execute on function public.br_day_pending_fixtures(date) from public, anon, authenticated;
grant execute on function public.br_proof_spent_lamports() to service_role;
grant execute on function public.br_verify_fixture(integer,integer,text,text,text,integer,integer,integer) to service_role;
grant execute on function public.br_mark_fixture_proof(integer,text,text) to service_role;
grant execute on function public.br_day_pending_fixtures(date) to service_role;
grant execute on function public.br_distribute_day(date) to service_role;

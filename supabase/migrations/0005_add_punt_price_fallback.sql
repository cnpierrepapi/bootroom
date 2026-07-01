-- br_add_punt final body: quote the latest snapshot at/<= the fixture's as_of
-- clock, falling back to the market's OPENING line (earliest snapshot) when the
-- as_of position predates that market's first quote. Guarantees a price whenever
-- the market exists in the book. Server-authoritative: the client never supplies
-- odds. SECURITY DEFINER, locked to service_role.
create or replace function public.br_add_punt(
  p_device text, p_strat_id bigint, p_fixture integer,
  p_market text, p_line numeric, p_pick text, p_extra_cost integer
) returns jsonb language plpgsql security definer as $$
declare
  v_owner text; v_settled boolean; v_slot integer; v_cost integer := 0;
  v_bal integer; v_punt bigint; v_asof bigint; v_prices jsonb; v_odds numeric;
begin
  select device_id, settled into v_owner, v_settled
    from public.br_strats where id = p_strat_id for update;
  if v_owner is null then return jsonb_build_object('ok',false,'error','no_strat'); end if;
  if v_owner <> p_device then return jsonb_build_object('ok',false,'error','not_owner'); end if;
  if v_settled then return jsonb_build_object('ok',false,'error','settled'); end if;

  select as_of_ts into v_asof from public.br_fixtures where fixture_id = p_fixture;
  select prices into v_prices from public.br_odds
    where fixture_id = p_fixture and kind = p_market
      and (line = p_line or (p_line is null and line is null))
      and ts <= coalesce(v_asof, 9223372036854775807)
    order by ts desc limit 1;
  if v_prices is null then
    select prices into v_prices from public.br_odds
      where fixture_id = p_fixture and kind = p_market
        and (line = p_line or (p_line is null and line is null))
      order by ts asc limit 1;
  end if;
  if v_prices is null then return jsonb_build_object('ok',false,'error','no_market'); end if;
  v_odds := (v_prices ->> p_pick)::numeric;
  if v_odds is null or v_odds <= 1 then return jsonb_build_object('ok',false,'error','no_price'); end if;

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

  insert into public.br_punts (strat_id, slot, fixture_id, market, line, pick, odds, boots_paid)
  values (p_strat_id, v_slot, p_fixture, p_market, p_line, p_pick, v_odds, v_cost)
  returning id into v_punt;

  if v_cost > 0 then
    insert into public.br_boots_ledger (device_id, delta, reason, ref, balance_after)
    values (p_device, -v_cost, 'extra_punt', v_punt::text, v_bal);
  end if;

  return jsonb_build_object('ok',true,'punt_id',v_punt,'slot',v_slot,'market',p_market,
    'line',p_line,'pick',p_pick,'odds',v_odds,'boots_paid',v_cost,'boots_balance',coalesce(v_bal,0));
end $$;
alter function public.br_add_punt(text,bigint,integer,text,numeric,text,integer) set search_path = public, pg_temp;
revoke execute on function public.br_add_punt(text,bigint,integer,text,numeric,text,integer) from public, anon, authenticated;
grant  execute on function public.br_add_punt(text,bigint,integer,text,numeric,text,integer) to service_role;
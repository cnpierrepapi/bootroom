-- Hardening for the br_* SECURITY DEFINER functions. Same lockdown the Supabase
-- security advisor forced on spk_* (0011 function_search_path_mutable, 0028/0029
-- anon/authenticated can execute a SECURITY DEFINER function). These RPCs move
-- BOOTS, credit USDC rewards, distribute pools and queue payouts, so they MUST
-- run ONLY server-side via the service-role key. Left callable by the public anon
-- key (which ships in the client bundle), anyone could mint BOOTS, credit
-- themselves rewards, or drain the pool. Pin search_path, revoke from everyone,
-- grant service_role only.

alter function public.br_upsert_user(text,text,text)                                              set search_path = public, pg_temp;
alter function public.br_get_or_create_strat(text,date)                                           set search_path = public, pg_temp;
alter function public.br_add_punt(text,bigint,integer,text,text,text,integer,text,numeric,integer) set search_path = public, pg_temp;
alter function public.br_credit_boots(text,text,text,numeric,integer,integer)                      set search_path = public, pg_temp;
alter function public.br_finalize_strat(bigint)                                                    set search_path = public, pg_temp;
alter function public.br_set_reward_pool(date,numeric)                                             set search_path = public, pg_temp;
alter function public.br_distribute_day(date)                                                      set search_path = public, pg_temp;
alter function public.br_request_withdraw(text)                                                    set search_path = public, pg_temp;

revoke execute on function public.br_upsert_user(text,text,text)                                              from public, anon, authenticated;
revoke execute on function public.br_get_or_create_strat(text,date)                                           from public, anon, authenticated;
revoke execute on function public.br_add_punt(text,bigint,integer,text,text,text,integer,text,numeric,integer) from public, anon, authenticated;
revoke execute on function public.br_credit_boots(text,text,text,numeric,integer,integer)                      from public, anon, authenticated;
revoke execute on function public.br_finalize_strat(bigint)                                                    from public, anon, authenticated;
revoke execute on function public.br_set_reward_pool(date,numeric)                                             from public, anon, authenticated;
revoke execute on function public.br_distribute_day(date)                                                      from public, anon, authenticated;
revoke execute on function public.br_request_withdraw(text)                                                    from public, anon, authenticated;

grant execute on function public.br_upsert_user(text,text,text)                                              to service_role;
grant execute on function public.br_get_or_create_strat(text,date)                                           to service_role;
grant execute on function public.br_add_punt(text,bigint,integer,text,text,text,integer,text,numeric,integer) to service_role;
grant execute on function public.br_credit_boots(text,text,text,numeric,integer,integer)                      to service_role;
grant execute on function public.br_finalize_strat(bigint)                                                    to service_role;
grant execute on function public.br_set_reward_pool(date,numeric)                                             to service_role;
grant execute on function public.br_distribute_day(date)                                                      to service_role;
grant execute on function public.br_request_withdraw(text)                                                    to service_role;

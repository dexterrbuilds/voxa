-- ISOLATED TEST DATABASE ONLY. Never run this fixture against a Voxa project.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select current_setting('request.jwt.claim.role', true) $$;
grant usage on schema auth to authenticated, anon, service_role;
create table public.agents(id uuid primary key, creator_user_id uuid not null);
insert into public.agents values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000020');
\ir ../supabase-agent-analytics-schema.sql
\ir ../supabase-agent-analytics-server-writes.sql
-- Reapplication preserves data and function permissions.
\ir ../supabase-agent-analytics-server-writes.sql
grant select on public.agent_analytics to authenticated;
select set_config('request.jwt.claim.role', 'service_role', false);
set role service_role;
select public.increment_agent_analytics('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'room_messages_sent', 1);
select public.increment_agent_analytics('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'room_messages_sent', 1);
select public.increment_agent_analytics('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000020', 'sandbox_sessions_started', 1);
do $$ begin
  begin
    perform public.increment_agent_analytics('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000020', 'room_messages_sent', 1);
    raise exception 'TEST FAIL: wrong owner accepted';
  exception when raise_exception then
    if sqlerrm <> 'agent not found' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.role', 'authenticated', false);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000010', false);
set role authenticated;
do $$ begin
  if (select count(*) from public.agent_analytics) <> 1 then raise exception 'TEST FAIL: owner RLS'; end if;
  if (select room_messages_sent from public.agent_analytics limit 1) <> 2 then raise exception 'TEST FAIL: increment'; end if;
  begin
    perform public.increment_agent_analytics('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'room_messages_sent', 1);
    raise exception 'TEST FAIL: browser increment allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform public.increment_agent_analytics('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'room_messages_sent', 1);
    raise exception 'TEST FAIL: anon increment allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo 'PASS: idempotent migration, service writes, browser/anon denial, owner RLS, counters and ownership validation'

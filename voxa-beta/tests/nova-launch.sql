-- DISPOSABLE PostgreSQL ONLY. Never run this fixture in Supabase.
\set ON_ERROR_STOP on
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
grant usage on schema auth to authenticated,anon,service_role;
insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
create table public.existing_room_fixture(value text);
insert into public.existing_room_fixture values ('preserve me');
\ir ../supabase-nova-launch.sql
\ir ../supabase-nova-launch.sql
select set_config('request.jwt.claim.role','service_role',false);
set role service_role;
insert into public.nova_conversations(id,owner_id) values ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001');
do $$
declare owner uuid:='00000000-0000-4000-8000-000000000001'; cid uuid:='00000000-0000-4000-8000-000000000010'; rid uuid:='00000000-0000-4000-8000-000000000020'; pid uuid:='00000000-0000-4000-8000-000000000030'; token uuid:=gen_random_uuid(); plan jsonb; result jsonb;
begin
  plan:=jsonb_build_object('id',pid,'hash','bound-hash','approvalToken',token,'quote',jsonb_build_object('mode','simulation','expiresAt',now()+interval '5 minutes'));
  perform nova_launch_turn(owner,cid,rid,'start','Swap 1 SOL to USDC');
  perform nova_launch_turn(owner,cid,rid,'finish','Simulation','[]',plan);
  begin perform nova_launch_approve(owner,pid,'mutated',token); raise exception 'TEST: changed hash accepted'; exception when others then if sqlerrm <> 'approval does not match plan' then raise; end if; end;
  result:=nova_launch_approve(owner,pid,'bound-hash',token);
  if result->>'mode' <> 'simulation' then raise exception 'TEST: not simulation'; end if;
  if nova_launch_approve(owner,pid,'bound-hash',token) <> result then raise exception 'TEST: duplicate result changed'; end if;
  begin perform nova_launch_approve('00000000-0000-4000-8000-000000000002',pid,'bound-hash',token); raise exception 'TEST: wrong owner'; exception when others then if sqlerrm <> 'plan unavailable' then raise; end if; end;
  rid:=gen_random_uuid();pid:=gen_random_uuid();plan:=plan||jsonb_build_object('id',pid);
  perform nova_launch_turn(owner,cid,rid,'start','new simulation');perform nova_launch_turn(owner,cid,rid,'finish','Simulation','[]',plan);
  perform nova_launch_turn(owner,cid,gen_random_uuid(),'start','modified request');
  begin perform nova_launch_approve(owner,pid,'bound-hash',token); raise exception 'TEST: stale approval accepted'; exception when others then if sqlerrm <> 'plan no longer available' then raise; end if; end;
  rid:=gen_random_uuid();perform nova_launch_turn(owner,cid,rid,'start','cancel me');perform nova_launch_turn(owner,cid,rid,'cancel');
  begin perform nova_launch_turn(owner,cid,rid,'finish','late response');raise exception 'TEST: late response';exception when others then if sqlerrm <> 'request superseded' then raise;end if;end;
end $$;
do $$
declare owner uuid:='00000000-0000-4000-8000-000000000001'; cid uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); rid uuid; pid uuid; token uuid; plan jsonb; r jsonb;
begin
  insert into nova_conversations(id,owner_id) values(cid,owner),(other,owner);
  for scenario in 1..5 loop
    rid:=gen_random_uuid(); pid:=gen_random_uuid(); token:=gen_random_uuid();
    plan:=jsonb_build_object('id',pid,'hash','exact-hash','approvalToken',token,'quote',jsonb_build_object('mode','simulation','expiresAt',now()+case when scenario=2 then interval '-1 minute' else interval '5 minutes' end));
    perform nova_launch_turn(owner,cid,rid,'start','simulation');
    perform nova_launch_turn(owner,cid,rid,'finish','plan','[]',plan);
    begin perform nova_launch_approve(owner,pid,'exact-hash',gen_random_uuid()); raise exception 'TEST: wrong token'; exception when others then if sqlerrm <> 'approval does not match plan' then raise; end if; end;
    if scenario=1 then
      perform nova_launch_approve(owner,pid,'exact-hash',token,true);
      begin perform nova_launch_approve(owner,pid,'exact-hash',token);raise exception 'TEST: cancelled replay';exception when others then if sqlerrm <> 'plan no longer available' then raise;end if;end;
    elsif scenario=2 then
      begin perform nova_launch_approve(owner,pid,'exact-hash',token);raise exception 'TEST: expired approval';exception when others then if sqlerrm <> 'plan expired' then raise;end if;end;
    elsif scenario=3 then
      -- A prompt in another owned conversation cannot cancel this plan or receive its reply.
      perform nova_launch_turn(owner,other,gen_random_uuid(),'start','other topic');
      begin perform nova_launch_turn(owner,other,rid,'finish','cross-conversation reply');raise exception 'TEST: cross conversation';exception when others then if sqlerrm <> 'request superseded' then raise;end if;end;
      r:=nova_launch_approve(owner,pid,'exact-hash',token);
      if (select result from nova_action_plans where id=pid) is distinct from r then raise exception 'TEST: result not persisted';end if;
      begin perform nova_launch_approve(owner,pid,'exact-hash',gen_random_uuid());raise exception 'TEST: executed token replay';exception when others then if sqlerrm <> 'approval does not match plan' then raise;end if;end;
    elsif scenario=4 then
      perform nova_launch_turn(owner,cid,gen_random_uuid(),'start','okay, yes, do it');
      if (select status from nova_action_plans where id=pid) <> 'superseded' then raise exception 'TEST: conversational approval';end if;
    else
      begin perform nova_launch_turn(owner,cid,rid,'start','duplicate');raise exception 'TEST: duplicate prompt';exception when others then if sqlerrm <> 'request already received' then raise;end if;end;
      perform nova_launch_approve(owner,pid,'exact-hash',token);
      if (select count(*) from nova_action_plans where id=pid and status='executed') <> 1 then raise exception 'TEST: execution count';end if;
    end if;
  end loop;
end $$;
reset role;
do $$ begin if (select value from existing_room_fixture) <> 'preserve me' then raise exception 'TEST: existing data changed';end if;end $$;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
set role authenticated;
do $$ begin
  if (select count(*) from public.nova_conversations)<>0 then raise exception 'TEST: owner isolation';end if;
  begin update public.nova_action_plans set status='executed';raise exception 'TEST: browser write';exception when insufficient_privilege then null;end;
  begin perform nova_launch_approve(gen_random_uuid(),gen_random_uuid(),'x',gen_random_uuid());raise exception 'TEST: browser approval RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
set role authenticated;
do $$ begin
  if (select count(*) from nova_conversations)=0 then raise exception 'TEST: owner cannot read';end if;
  if exists(select 1 from nova_messages where owner_id <> auth.uid()) then raise exception 'TEST: message isolation';end if;
  begin insert into nova_conversations(owner_id) values(auth.uid());raise exception 'TEST: browser insert';exception when insufficient_privilege then null;end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform 1 from nova_messages;raise exception 'TEST: anonymous read';exception when insufficient_privilege then null;end;
end $$;
reset role;
\echo 'PASS: additive migration, owner isolation, service-only writes, bound approval, duplicate execution, supersession and cancellation'
-- Reapplying after populated tables must preserve saved simulation results too.
\ir ../supabase-nova-launch.sql
do $$ begin
  if (select count(*) from nova_action_plans where status='executed' and result->>'mode'='simulation') <> 3 then
    raise exception 'TEST: reapplication lost results';
  end if;
end $$;

-- DISPOSABLE PostgreSQL ONLY. Runs the original launch checks first, never Supabase.
\set ON_ERROR_STOP on
\ir nova-launch.sql
\ir ../supabase-nova-quotes.sql
\ir ../supabase-nova-quotes.sql
select set_config('request.jwt.claim.role','service_role',false);
set role service_role;
do $$
declare owner uuid:='00000000-0000-4000-8000-000000000001'; cid uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); rid uuid; pid uuid; token uuid; plan jsonb; r jsonb;
begin
  insert into nova_conversations(id,owner_id) values(cid,owner),(other,owner);
  for scenario in 1..6 loop
    rid:=gen_random_uuid();pid:=gen_random_uuid();token:=gen_random_uuid();
    plan:=jsonb_build_object('id',pid,'hash','immutable-quote','approvalToken',token,'quote',jsonb_build_object('mode','quote_only','expiresAt',now()+case when scenario=2 then interval '-1 minute' else interval '30 seconds' end));
    perform nova_launch_turn(owner,cid,rid,'start','Swap 1 SOL to USDC');
    perform nova_launch_turn(owner,cid,rid,'finish','Quote','[]',plan);
    begin perform nova_launch_approve(owner,pid,'changed',token); raise exception 'TEST: quote hash';exception when others then if sqlerrm <> 'approval does not match plan' then raise;end if;end;
    begin perform nova_launch_approve(owner,pid,'immutable-quote',gen_random_uuid());raise exception 'TEST: quote token';exception when others then if sqlerrm <> 'approval does not match plan' then raise;end if;end;
    begin perform nova_launch_approve('00000000-0000-4000-8000-000000000002',pid,'immutable-quote',token);raise exception 'TEST: quote owner';exception when others then if sqlerrm <> 'plan unavailable' then raise;end if;end;
    if scenario=1 then
      perform nova_launch_approve(owner,pid,'immutable-quote',token,true);
      begin perform nova_launch_approve(owner,pid,'immutable-quote',token);raise exception 'TEST: cancelled quote replay';exception when others then if sqlerrm <> 'plan no longer available' then raise;end if;end;
    elsif scenario=2 then
      begin perform nova_launch_approve(owner,pid,'immutable-quote',token);raise exception 'TEST: expired quote';exception when others then if sqlerrm <> 'plan expired' then raise;end if;end;
    elsif scenario in (3,4) then
      perform nova_launch_turn(owner,cid,gen_random_uuid(),'start',case when scenario=3 then 'Refresh this quote' else 'okay yes do it' end);
      begin perform nova_launch_approve(owner,pid,'immutable-quote',token);raise exception 'TEST: superseded quote';exception when others then if sqlerrm <> 'plan no longer available' then raise;end if;end;
    else
      perform nova_launch_turn(owner,other,gen_random_uuid(),'start','another conversation');
      begin perform nova_launch_turn(owner,other,rid,'finish','wrong conversation');raise exception 'TEST: cross conversation';exception when others then if sqlerrm <> 'request superseded' then raise;end if;end;
      r:=nova_launch_approve(owner,pid,'immutable-quote',token);
      if r->>'mode' <> 'quote_only' or r->>'transactionSignature' is not null or r->>'message' not like '%execution is not enabled%' then raise exception 'TEST: review result';end if;
      if (select result from nova_action_plans where id=pid) is distinct from r then raise exception 'TEST: persistence';end if;
      if nova_launch_approve(owner,pid,'immutable-quote',token) is distinct from r then raise exception 'TEST: duplicate result';end if;
      begin perform nova_launch_approve(owner,pid,'immutable-quote',gen_random_uuid());raise exception 'TEST: replay token';exception when others then if sqlerrm <> 'approval does not match plan' then raise;end if;end;
    end if;
  end loop;
end $$;
reset role;
\ir ../supabase-nova-quotes.sql
do $$ begin
  if (select count(*) from nova_action_plans where result->>'mode'='simulation')<>3 then raise exception 'TEST: historic results lost';end if;
  if (select count(*) from nova_action_plans where result->>'mode'='quote_only')<>2 then raise exception 'TEST: quote results lost';end if;
end $$;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
set role authenticated;
do $$ begin
  if exists(select 1 from nova_action_plans) then raise exception 'TEST: owner read leak';end if;
  begin update nova_action_plans set status='executed';raise exception 'TEST: browser quote write';exception when insufficient_privilege then null;end;
  begin perform nova_launch_approve(gen_random_uuid(),gen_random_uuid(),'x',gen_random_uuid());raise exception 'TEST: browser quote approval';exception when insufficient_privilege then null;end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform nova_launch_approve(gen_random_uuid(),gen_random_uuid(),'x',gen_random_uuid());raise exception 'TEST: anonymous approval';exception when insufficient_privilege then null;end;
end $$;
reset role;
\echo 'PASS: quote-only approval, expiry, supersession, cancellation, ownership, replay/idempotency, result preservation and browser restrictions'

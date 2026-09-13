-- Disposable PostgreSQL only. Includes baseline data/approval/RLS checks.
\ir nova-quotes.sql
\ir ../supabase-privy-identity.sql
\ir ../supabase-privy-identity.sql
select set_config('request.jwt.claim.role','service_role',false);
set role service_role;
do $$
declare a public.synq_users; b public.synq_users; again public.synq_users; cid uuid:=gen_random_uuid();
begin
  a:=synq_resolve_identity('did:privy:fixture-a',null);
  again:=synq_resolve_identity('did:privy:fixture-a','11111111111111111111111111111111');
  if a.id<>again.id then raise exception 'TEST: duplicate identity';end if;
  a:=again;
  again:=synq_resolve_identity('did:privy:fixture-a',a.wallet_address);
  if a is distinct from again then raise exception 'TEST: repeated login changed identity';end if;
  begin perform synq_resolve_identity('did:privy:fixture-a','different');raise exception 'TEST: wallet mutation';exception when others then if sqlerrm <> 'wallet changed' then raise;end if;end;
  begin perform synq_resolve_identity('did:privy:fixture-b',a.wallet_address);raise exception 'TEST: wallet reassigned';exception when unique_violation then null;end;
  b:=synq_resolve_identity('did:privy:fixture-b',null);
  if a.id=b.id then raise exception 'TEST: owner collision';end if;
  insert into nova_conversations(id,owner_id,title) values(cid,a.id,'Privy A fixture');
  perform nova_launch_turn(a.id,cid,gen_random_uuid(),'start','hello');
  begin perform nova_launch_turn(b.id,cid,gen_random_uuid(),'start','attack');raise exception 'TEST: cross-user write';exception when others then if sqlerrm <> 'conversation unavailable' then raise;end if;end;
  insert into synq_revoked_sessions(session_id,privy_user_id) values('fixture-session','did:privy:fixture-a') on conflict do nothing;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from synq_users where privy_user_id='did:privy:fixture-a'),false);
select set_config('request.jwt.claim.role','authenticated',false);
set role authenticated;
do $$ begin
  if (select count(*) from nova_conversations)<>1 then raise exception 'TEST: scoped reader';end if;
  begin select count(*) from synq_users;raise exception 'TEST: identity leak';exception when insufficient_privilege then null;end;
  begin perform synq_resolve_identity('did:privy:attacker',null);raise exception 'TEST: client identity write';exception when insufficient_privilege then null;end;
  begin update nova_action_plans set owner_id=auth.uid();raise exception 'TEST: client plan mutation';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from synq_users where privy_user_id='did:privy:fixture-b'),false);
set role authenticated;
do $$ begin if exists(select 1 from nova_messages) or exists(select 1 from nova_conversations) then raise exception 'TEST: cross-user reads';end if;end $$;
reset role;
set role anon;
do $$ begin
  begin select count(*) from synq_users;raise exception 'TEST: anon identities';exception when insufficient_privilege then null;end;
  begin select count(*) from synq_revoked_sessions;raise exception 'TEST: anon sessions';exception when insufficient_privilege then null;end;
end $$;
reset role;
\ir ../supabase-privy-identity.sql
do $$ begin
  if not exists(select 1 from nova_conversations where title='Privy A fixture') then raise exception 'TEST: reapply lost new data';end if;
  if not exists(select 1 from nova_action_plans where result is not null) then raise exception 'TEST: reapply lost old data';end if;
  insert into auth.users(id) values(gen_random_uuid());
  if exists(select 1 from auth.users u left join synq_users s on s.id=u.id where s.id is null) then raise exception 'TEST: legacy rollback users not preserved';end if;
end $$;
\echo 'PASS: Privy identity idempotency, immutable wallet, owner RLS, browser denial, legacy preservation, reapplication'

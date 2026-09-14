-- Additive Nova launch storage. No existing room/agent data is changed.
-- Conversation records belong to one authenticated owner. Browser access is read-only;
-- the authenticated API uses service-role writes with explicit owner filters.
create table if not exists public.nova_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  title text not null default 'New conversation',
  current_request uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.nova_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.nova_conversations(id),
  owner_id uuid not null references auth.users(id),
  request_id uuid not null,
  role text not null check (role in ('user','nova')),
  text text not null,
  blocks jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique(conversation_id, request_id, role)
);
create table if not exists public.nova_action_plans (
  id uuid primary key,
  conversation_id uuid not null references public.nova_conversations(id),
  owner_id uuid not null references auth.users(id),
  request_id uuid not null,
  plan jsonb not null,
  hash text not null,
  approval_token uuid not null,
  status text not null default 'pending' check(status in ('pending','cancelled','superseded','executed')),
  expires_at timestamptz not null,
  result jsonb,
  created_at timestamptz not null default now()
);
create index if not exists nova_conversations_owner_updated on public.nova_conversations(owner_id, updated_at desc);
create index if not exists nova_messages_conversation_created on public.nova_messages(conversation_id, created_at desc);
create index if not exists nova_plans_conversation on public.nova_action_plans(conversation_id, status);
alter table public.nova_conversations enable row level security;
alter table public.nova_messages enable row level security;
alter table public.nova_action_plans enable row level security;
do $$ declare t text; begin
  foreach t in array array['nova_conversations','nova_messages','nova_action_plans'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='Nova owner read') then
      execute format('create policy "Nova owner read" on public.%I for select to authenticated using (owner_id = auth.uid())',t);
    end if;
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

-- Serialize new prompts, final replies and approvals on their conversation row.
-- The current request prevents a cancelled/superseded model response from committing.
create or replace function public.nova_launch_turn(p_owner uuid, p_conversation uuid, p_request uuid, p_operation text, p_text text default '', p_blocks jsonb default '[]', p_plan jsonb default null)
returns void language plpgsql security definer set search_path=public as $$
declare c public.nova_conversations;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden'; end if;
  select * into c from public.nova_conversations where id=p_conversation and owner_id=p_owner for update;
  if not found then raise exception 'conversation unavailable'; end if;
  if p_operation='start' then
    if exists(select 1 from public.nova_messages where conversation_id=p_conversation and request_id=p_request) then raise exception 'request already received'; end if;
    update public.nova_action_plans set status='superseded' where conversation_id=p_conversation and status='pending';
    update public.nova_conversations set current_request=p_request,updated_at=now() where id=p_conversation;
    insert into public.nova_messages(conversation_id,owner_id,request_id,role,text) values(p_conversation,p_owner,p_request,'user',left(p_text,4000));
  elsif p_operation='cancel' then
    if c.current_request=p_request then
      update public.nova_conversations set current_request=null where id=p_conversation;
      update public.nova_action_plans set status='cancelled' where conversation_id=p_conversation and request_id=p_request and status='pending';
    end if;
  elsif p_operation='finish' then
    if c.current_request is distinct from p_request then raise exception 'request superseded'; end if;
    insert into public.nova_messages(conversation_id,owner_id,request_id,role,text,blocks) values(p_conversation,p_owner,p_request,'nova',left(p_text,12000),p_blocks);
    if p_plan is not null then
      insert into public.nova_action_plans(id,conversation_id,owner_id,request_id,plan,hash,approval_token,expires_at)
      values((p_plan->>'id')::uuid,p_conversation,p_owner,p_request,p_plan,p_plan->>'hash',(p_plan->>'approvalToken')::uuid,(p_plan->'quote'->>'expiresAt')::timestamptz);
    end if;
    update public.nova_conversations set updated_at=now() where id=p_conversation;
  else raise exception 'unsupported operation'; end if;
end $$;

-- Approvals are dedicated requests bound to an immutable plan hash + nonce.
-- Atomic status/result storage makes repeated execution return the same simulation.
create or replace function public.nova_launch_approve(p_owner uuid,p_id uuid,p_hash text,p_token uuid,p_cancel boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.nova_action_plans; r jsonb; cid uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden'; end if;
  select conversation_id into cid from public.nova_action_plans where id=p_id and owner_id=p_owner;
  if cid is null then raise exception 'plan unavailable'; end if;
  perform 1 from public.nova_conversations where id=cid and owner_id=p_owner for update;
  select * into p from public.nova_action_plans where id=p_id and owner_id=p_owner for update;
  if p.hash is distinct from p_hash or p.approval_token is distinct from p_token then raise exception 'approval does not match plan'; end if;
  if p.status='executed' then return p.result; end if;
  if p.status <> 'pending' then raise exception 'plan no longer available'; end if;
  if p_cancel then
    update public.nova_action_plans set status='cancelled' where id=p_id;
    return jsonb_build_object('cancelled',true);
  end if;
  if p.expires_at <= now() then raise exception 'plan expired'; end if;
  if p.plan->'quote'->>'mode' is distinct from 'simulation' then raise exception 'real execution disabled'; end if;
  r := jsonb_build_object('mode','simulation','planId',p.id,'message','Simulation completed. No funds moved and no transaction was submitted.','transactionSignature',null);
  update public.nova_action_plans set status='executed',result=r where id=p_id;
  return r;
end $$;
revoke all on function public.nova_launch_turn(uuid,uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.nova_launch_approve(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.nova_launch_turn(uuid,uuid,uuid,text,text,jsonb,jsonb) to service_role;
grant execute on function public.nova_launch_approve(uuid,uuid,text,uuid,boolean) to service_role;

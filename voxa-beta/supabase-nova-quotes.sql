-- Apply AFTER supabase-nova-launch.sql. Additive/idempotent routine extension only.
-- Existing tables, RLS and historic simulations remain unchanged. No chain execution.
create or replace function public.nova_launch_approve(p_owner uuid,p_id uuid,p_hash text,p_token uuid,p_cancel boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.nova_action_plans; r jsonb; cid uuid; mode text;
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
  mode := p.plan->'quote'->>'mode';
  if mode is null or mode not in ('simulation','quote_only') then raise exception 'real execution disabled'; end if;
  r := jsonb_build_object('mode',mode,'planId',p.id,'message',
    case when mode='quote_only' then 'Quote approved — execution is not enabled yet. No funds moved.'
    else 'Simulation completed. No funds moved and no transaction was submitted.' end,
    'transactionSignature',null);
  -- 'executed' is a legacy terminal storage enum: it means review/simulation finished,
  -- NOT an on-chain execution. There are no network calls or transaction payloads here.
  update public.nova_action_plans set status='executed',result=r where id=p_id;
  return r;
end $$;
revoke all on function public.nova_launch_approve(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.nova_launch_approve(uuid,uuid,text,uuid,boolean) to service_role;

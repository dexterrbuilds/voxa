-- Run after supabase-agent-analytics-schema.sql for existing installations.
-- This replaces only the counter function, preserving tables, RLS and all data.
-- It checks the server role, allowed metric and actual agent ownership.
begin;
create or replace function public.increment_agent_analytics(
  p_agent_id uuid, p_owner_user_id uuid, p_metric text, p_amount integer default 1
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_metric is null or p_metric not in (
    'sandbox_sessions_started', 'sandbox_messages_sent', 'room_invites', 'room_messages_sent'
  ) or p_amount is null or p_amount < 1 or p_amount > 100 then
    raise exception 'invalid analytics increment';
  end if;
  if not exists (
    select 1 from public.agents where id = p_agent_id and creator_user_id = p_owner_user_id
  ) then raise exception 'agent not found'; end if;

  insert into public.agent_analytics (
    agent_id, owner_user_id, sandbox_sessions_started, sandbox_messages_sent,
    room_invites, room_messages_sent, last_active_at, updated_at
  ) values (
    p_agent_id, p_owner_user_id,
    case when p_metric = 'sandbox_sessions_started' then p_amount else 0 end,
    case when p_metric = 'sandbox_messages_sent' then p_amount else 0 end,
    case when p_metric = 'room_invites' then p_amount else 0 end,
    case when p_metric = 'room_messages_sent' then p_amount else 0 end, now(), now()
  ) on conflict (agent_id) do update set
    sandbox_sessions_started = agent_analytics.sandbox_sessions_started + excluded.sandbox_sessions_started,
    sandbox_messages_sent = agent_analytics.sandbox_messages_sent + excluded.sandbox_messages_sent,
    room_invites = agent_analytics.room_invites + excluded.room_invites,
    room_messages_sent = agent_analytics.room_messages_sent + excluded.room_messages_sent,
    last_active_at = now(), updated_at = now();
end;
$$;

-- Remove browser access to this SECURITY DEFINER function. Owner-only SELECT
-- policies stay intact. Deploy the server helper together with this migration.
revoke execute on function public.increment_agent_analytics(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.increment_agent_analytics(uuid, uuid, text, integer)
  to service_role;
commit;

-- Voxa Agent Analytics Schema
-- Safe, additive, and idempotent. This is usage visibility only — not billing,
-- metering, pricing, quotas, payments, or monetization.

-- 1. Create one aggregate analytics row per registered agent.
-- The row stores lightweight counters and a last-active timestamp. No event
-- history is stored here, so dashboard reads stay cheap.
create table if not exists public.agent_analytics (
  agent_id uuid primary key references public.agents(id) on delete cascade,
  owner_user_id uuid not null,
  sandbox_sessions_started bigint not null default 0,
  sandbox_messages_sent bigint not null default 0,
  room_invites bigint not null default 0,
  room_messages_sent bigint not null default 0,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Add missing columns safely if this table already exists.
alter table public.agent_analytics add column if not exists owner_user_id uuid;
alter table public.agent_analytics add column if not exists sandbox_sessions_started bigint not null default 0;
alter table public.agent_analytics add column if not exists sandbox_messages_sent bigint not null default 0;
alter table public.agent_analytics add column if not exists room_invites bigint not null default 0;
alter table public.agent_analytics add column if not exists room_messages_sent bigint not null default 0;
alter table public.agent_analytics add column if not exists last_active_at timestamptz;
alter table public.agent_analytics add column if not exists created_at timestamptz not null default now();
alter table public.agent_analytics add column if not exists updated_at timestamptz not null default now();

-- 3. Add lightweight indexes for owner-scoped dashboard reads.
create index if not exists agent_analytics_owner_user_id_idx
  on public.agent_analytics (owner_user_id);
create index if not exists agent_analytics_last_active_at_idx
  on public.agent_analytics (last_active_at desc);

-- 4. Enable RLS. Developers may only read analytics for their own agents.
alter table public.agent_analytics enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'agent_analytics'
      and policyname = 'Voxa analytics select own agents'
  ) then
    create policy "Voxa analytics select own agents"
      on public.agent_analytics for select
      to authenticated
      using (owner_user_id = auth.uid());
  end if;
end $$;

-- 5. Atomic server-side counter increment.
-- Routes call this after they have already validated ownership/eligibility. The
-- function still verifies owner_user_id = auth.uid() and the agent belongs to
-- that user before changing counters.
create or replace function public.increment_agent_analytics(
  p_agent_id uuid,
  p_owner_user_id uuid,
  p_metric text,
  p_amount integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  increment_by integer := greatest(coalesce(p_amount, 1), 0);
begin
  if auth.uid() is null or auth.uid() <> p_owner_user_id then
    raise exception 'not authorized';
  end if;

  if p_metric not in (
    'sandbox_sessions_started',
    'sandbox_messages_sent',
    'room_invites',
    'room_messages_sent'
  ) then
    raise exception 'invalid analytics metric';
  end if;

  if not exists (
    select 1
    from public.agents
    where id = p_agent_id
      and creator_user_id = p_owner_user_id
  ) then
    raise exception 'agent not found';
  end if;

  insert into public.agent_analytics (
    agent_id,
    owner_user_id,
    sandbox_sessions_started,
    sandbox_messages_sent,
    room_invites,
    room_messages_sent,
    last_active_at,
    updated_at
  )
  values (
    p_agent_id,
    p_owner_user_id,
    case when p_metric = 'sandbox_sessions_started' then increment_by else 0 end,
    case when p_metric = 'sandbox_messages_sent' then increment_by else 0 end,
    case when p_metric = 'room_invites' then increment_by else 0 end,
    case when p_metric = 'room_messages_sent' then increment_by else 0 end,
    now(),
    now()
  )
  on conflict (agent_id)
  do update set
    sandbox_sessions_started =
      public.agent_analytics.sandbox_sessions_started +
      case when p_metric = 'sandbox_sessions_started' then increment_by else 0 end,
    sandbox_messages_sent =
      public.agent_analytics.sandbox_messages_sent +
      case when p_metric = 'sandbox_messages_sent' then increment_by else 0 end,
    room_invites =
      public.agent_analytics.room_invites +
      case when p_metric = 'room_invites' then increment_by else 0 end,
    room_messages_sent =
      public.agent_analytics.room_messages_sent +
      case when p_metric = 'room_messages_sent' then increment_by else 0 end,
    last_active_at = now(),
    updated_at = now();
end;
$$;

grant execute on function public.increment_agent_analytics(uuid, uuid, text, integer)
  to authenticated;

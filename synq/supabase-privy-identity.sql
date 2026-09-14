-- Apply after supabase-nova-launch.sql and supabase-nova-quotes.sql.
-- New identities do not create fake Supabase Auth accounts or link by email.
begin;
create table if not exists public.synq_users (
  id uuid primary key default gen_random_uuid(),
  legacy_auth_user_id uuid unique references auth.users(id) on delete cascade,
  privy_user_id text unique,
  wallet_address text unique,
  created_at timestamptz not null default now(),
  check (privy_user_id is null or privy_user_id like 'did:privy:%')
);
insert into public.synq_users(id, legacy_auth_user_id)
select id,id from auth.users on conflict(id) do nothing;

-- Preserve legacy users registered after this migration while rollback mode is active.
create or replace function public.synq_legacy_identity() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.synq_users(id,legacy_auth_user_id) values(new.id,new.id) on conflict(id) do nothing;
  return new;
end $$;
revoke all on function public.synq_legacy_identity() from public,anon,authenticated;
drop trigger if exists synq_legacy_identity on auth.users;
create trigger synq_legacy_identity after insert on auth.users for each row execute function public.synq_legacy_identity();

-- Change only Nova ownership FKs, retaining UUID values, rows, RLS and write functions.
alter table public.nova_conversations drop constraint if exists nova_conversations_owner_id_fkey;
alter table public.nova_conversations add constraint nova_conversations_owner_id_fkey foreign key(owner_id) references public.synq_users(id) on delete cascade;
alter table public.nova_messages drop constraint if exists nova_messages_owner_id_fkey;
alter table public.nova_messages add constraint nova_messages_owner_id_fkey foreign key(owner_id) references public.synq_users(id) on delete cascade;
alter table public.nova_action_plans drop constraint if exists nova_action_plans_owner_id_fkey;
alter table public.nova_action_plans add constraint nova_action_plans_owner_id_fkey foreign key(owner_id) references public.synq_users(id) on delete cascade;

create table if not exists public.synq_revoked_sessions (
  session_id text primary key,
  privy_user_id text not null,
  revoked_at timestamptz not null default now()
);
alter table public.synq_users enable row level security;
alter table public.synq_revoked_sessions enable row level security;
revoke all on public.synq_users, public.synq_revoked_sessions from public,anon,authenticated;
grant all on public.synq_users, public.synq_revoked_sessions to service_role;

create or replace function public.synq_resolve_identity(p_privy text, p_wallet text default null)
returns public.synq_users language plpgsql security definer set search_path=public as $$
declare u public.synq_users;
begin
  if auth.role() <> 'service_role' then raise exception 'service only'; end if;
  if p_privy is null or p_privy not like 'did:privy:%' then raise exception 'invalid identity'; end if;
  insert into public.synq_users(privy_user_id) values(p_privy) on conflict(privy_user_id) do nothing;
  select * into u from public.synq_users where privy_user_id=p_privy for update;
  if u.wallet_address is not null and p_wallet is distinct from u.wallet_address then raise exception 'wallet changed'; end if;
  if u.wallet_address is null and p_wallet is not null then
    update public.synq_users set wallet_address=p_wallet where id=u.id returning * into u;
  end if;
  return u;
end $$;
revoke all on function public.synq_resolve_identity(text,text) from public,anon,authenticated;
grant execute on function public.synq_resolve_identity(text,text) to service_role;
commit;

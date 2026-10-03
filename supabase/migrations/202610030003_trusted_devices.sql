begin;

create table public.trusted_devices (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, device_id)
);
-- Deliberately no cascading user FK: deleting an account must not erase trial history.
create table public.device_trial_history (
  device_id uuid primary key,
  first_trial_user_id uuid not null,
  first_trial_started_at timestamptz not null
);
alter table public.trusted_devices enable row level security;
alter table public.device_trial_history enable row level security;
revoke all on public.trusted_devices, public.device_trial_history from public, anon, authenticated;
grant select, insert, update on public.trusted_devices, public.device_trial_history to service_role;
grant usage, select on sequence public.trusted_devices_id_seq to service_role;

-- The old RPC must not remain an automatic-trial bypass.
drop function public.get_entitlement();
create function public.get_entitlement(p_device_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  identity uuid := auth.uid();
  checked_at timestamptz := now();
  entitlement public.entitlements%rowtype;
  restriction text;
  access_status text;
  valid_until timestamptz;
  history_owner uuid;
begin
  if identity is null or not exists (
    select 1 from auth.users u where u.id = identity and u.email_confirmed_at is not null
  ) then
    raise exception 'Confirmed email required' using errcode = '42501';
  end if;
  if p_device_id is null or p_device_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Device identity required' using errcode = '22023';
  end if;
  insert into public.entitlements (user_id) values (identity) on conflict (user_id) do nothing;
  -- Serializes all devices for this account, including simultaneous first registrations.
  select * into strict entitlement from public.entitlements where user_id = identity for update;
  if exists (select 1 from public.trusted_devices where user_id = identity and device_id = p_device_id and revoked_at is null) then
    update public.trusted_devices set last_seen_at = checked_at where user_id = identity and device_id = p_device_id;
  elsif exists (select 1 from public.trusted_devices where user_id = identity and device_id = p_device_id)
    or (select count(*) from public.trusted_devices where user_id = identity and revoked_at is null) >= 2 then
    restriction := 'device_limit_reached';
  else
    insert into public.trusted_devices (user_id, device_id, created_at, last_seen_at)
      values (identity, p_device_id, checked_at, checked_at);
  end if;

  if restriction is null and not entitlement.blocked then
    -- Serialize history across accounts even when no history row exists yet.
    -- Hash collisions only serialize unrelated requests; they never merge identities.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_device_id::text, 0));
    select first_trial_user_id into history_owner from public.device_trial_history where device_id = p_device_id;
    if history_owner is not null and history_owner <> identity and entitlement.trial_started_at is null then
      restriction := 'trial_already_used_on_device';
    else
      if entitlement.trial_started_at is null then
        update public.entitlements set trial_started_at = checked_at, trial_ends_at = checked_at + interval '336 hours'
          where user_id = identity returning * into entitlement;
      end if;
      -- Existing trials (including legacy accounts) are associated with each context used.
      -- Expired trials are recorded too, never restarted or transferred to another owner.
      insert into public.device_trial_history (device_id, first_trial_user_id, first_trial_started_at)
        values (p_device_id, identity, entitlement.trial_started_at) on conflict (device_id) do nothing;
    end if;
  end if;

  valid_until := greatest(entitlement.trial_ends_at, entitlement.active_until, entitlement.admin_override_until);
  if entitlement.blocked then access_status := 'blocked'; restriction := null;
  elsif entitlement.admin_override_until > checked_at then
    access_status := 'active';
    -- A restriction bypass must expire with the override, even if another grant is longer.
    if restriction is not null then valid_until := entitlement.admin_override_until; end if;
    restriction := null;
  elsif restriction is not null then access_status := 'expired'; valid_until := null;
  elsif entitlement.active_until > checked_at then access_status := 'active';
  elsif entitlement.trial_ends_at > checked_at then access_status := 'trial';
  else access_status := 'expired';
  end if;
  return jsonb_build_object('user_id', identity, 'status', access_status, 'reason', restriction,
    'valid_until', valid_until, 'server_now', checked_at);
end;
$$;
revoke all on function public.get_entitlement(uuid) from public, anon, authenticated;
grant execute on function public.get_entitlement(uuid) to authenticated;

commit;

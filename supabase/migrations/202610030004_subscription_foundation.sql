begin;

-- One monthly recurring plan; price is provisional. No card data or provider payloads.
create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (length(btrim(provider)) > 0),
  provider_customer_id text check (length(btrim(provider_customer_id)) > 0),
  provider_subscription_id text check (length(btrim(provider_subscription_id)) > 0),
  status text not null check (status in ('active', 'past_due', 'expired', 'canceled')),
  current_period_start timestamptz not null check (isfinite(current_period_start)),
  current_period_end timestamptz not null check (isfinite(current_period_end)),
  cancel_at_period_end boolean not null default false,
  grace_ends_at timestamptz check (isfinite(grace_ends_at)),
  created_at timestamptz not null default now() check (isfinite(created_at)),
  updated_at timestamptz not null default now() check (isfinite(updated_at)),
  check (current_period_end > current_period_start),
  check (status <> 'past_due' or grace_ends_at is not null),
  unique (provider, provider_subscription_id)
);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from public, anon, authenticated;
grant select, insert, update on public.subscriptions to service_role;

-- Grace is server time, exactly 72 hours on entry to past_due. Repeated failed
-- callbacks cannot renew it. Only successful payment (active) clears it.
create function public.subscription_server_dates() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if TG_OP = 'INSERT' then new.created_at := now(); end if;
  if new.status = 'past_due' then
    if TG_OP = 'INSERT' then new.grace_ends_at := now() + interval '72 hours';
    elsif old.grace_ends_at is not null then new.grace_ends_at := old.grace_ends_at;
    else new.grace_ends_at := now() + interval '72 hours';
    end if;
  elsif new.status = 'active' then new.grace_ends_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.subscription_server_dates() from public, anon, authenticated;
create trigger subscription_dates before insert or update on public.subscriptions
for each row execute function public.subscription_server_dates();

-- Server-only operations: adapter must confirm provider acceptance before calling.
-- They never create a paid grant, change period dates or clear payment failure.
create function public.set_subscription_renewal(p_user_id uuid, p_cancel boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.subscriptions%rowtype;
begin
  if p_cancel is null then raise exception 'Cancellation flag required' using errcode = '22023'; end if;
  select * into s from public.subscriptions where user_id = p_user_id for update;
  if not found or s.status <> 'active' or s.current_period_start > now() or s.current_period_end <= now() then
    raise exception 'No current active period; a new purchase is required' using errcode = '22023';
  end if;
  update public.subscriptions set cancel_at_period_end = p_cancel where user_id = p_user_id;
end;
$$;
revoke all on function public.set_subscription_renewal(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_subscription_renewal(uuid, boolean) to service_role;

-- active_until was a reserved field, not proof of payment. It is intentionally
-- no longer an access source; admin/beta grants use admin_override_until.
create or replace function public.get_entitlement(p_device_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  identity uuid := auth.uid();
  checked_at timestamptz := now();
  entitlement public.entitlements%rowtype;
  restriction text;
  access_status text;
  valid_until timestamptz;
  history_owner uuid;
  subscription public.subscriptions%rowtype;
  paid_until timestamptz;
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

  -- Locking also serializes period expiry with future callbacks/cancel/resume.
  select * into subscription from public.subscriptions where user_id = identity for update;
  if subscription.status = 'active' and subscription.current_period_end <= checked_at then
    update public.subscriptions set status = 'expired' where user_id = identity returning * into subscription;
  elsif subscription.status = 'past_due' and subscription.grace_ends_at <= checked_at then
    update public.subscriptions set status = 'expired' where user_id = identity returning * into subscription;
  end if;
  if subscription.status = 'active' and subscription.current_period_start <= checked_at
    and subscription.current_period_end > checked_at then
    paid_until := subscription.current_period_end;
  elsif subscription.status = 'past_due' and subscription.grace_ends_at > checked_at then
    paid_until := subscription.grace_ends_at;
  end if;
  valid_until := null;
  if entitlement.blocked then access_status := 'blocked'; restriction := null;
  elsif entitlement.admin_override_until > checked_at then
    access_status := 'active'; valid_until := entitlement.admin_override_until; restriction := null;
  elsif restriction = 'device_limit_reached' then access_status := 'expired';
  elsif paid_until > checked_at then
    access_status := 'active'; valid_until := paid_until; restriction := null;
  elsif restriction is not null then access_status := 'expired';
  elsif entitlement.trial_ends_at > checked_at then
    access_status := 'trial'; valid_until := entitlement.trial_ends_at;
  else access_status := 'expired';
  end if;
  return jsonb_build_object('user_id', identity, 'status', access_status, 'reason', restriction,
    'valid_until', valid_until, 'server_now', checked_at,
    'billing', jsonb_build_object('trialEndsAt', entitlement.trial_ends_at,
      'subscription', case when subscription.user_id is null then null else jsonb_build_object(
        'status', subscription.status, 'currentPeriodStart', subscription.current_period_start,
        'currentPeriodEnd', subscription.current_period_end, 'cancelAtPeriodEnd', subscription.cancel_at_period_end,
        'graceEndsAt', subscription.grace_ends_at) end));
end;
$$;
revoke all on function public.get_entitlement(uuid) from public, anon, authenticated;
grant execute on function public.get_entitlement(uuid) to authenticated;

commit;

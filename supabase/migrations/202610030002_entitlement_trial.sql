begin;

-- Only server/admin code can mutate this row. Future paid grants can use active_until.
create table public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  active_until timestamptz,
  admin_override_until timestamptz,
  blocked boolean not null default false,
  check ((trial_started_at is null and trial_ends_at is null) or
    (trial_started_at is not null and trial_ends_at is not null and trial_ends_at = trial_started_at + interval '336 hours')),
  check (trial_started_at is null or isfinite(trial_started_at)),
  check (trial_ends_at is null or isfinite(trial_ends_at)),
  check (active_until is null or isfinite(active_until)),
  check (admin_override_until is null or isfinite(admin_override_until))
);
alter table public.entitlements enable row level security;
revoke all on public.entitlements from public, anon, authenticated;
grant select, insert, update on public.entitlements to service_role;

create function public.get_entitlement() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  identity uuid := auth.uid();
  checked_at timestamptz := now();
  entitlement public.entitlements%rowtype;
  access_status text;
  valid_until timestamptz;
begin
  if identity is null or not exists (
    select 1 from auth.users u where u.id = identity and u.email_confirmed_at is not null
  ) then
    raise exception 'Confirmed email required' using errcode = '42501';
  end if;
  insert into public.entitlements (user_id, trial_started_at, trial_ends_at)
    values (identity, checked_at, checked_at + interval '336 hours')
    on conflict (user_id) do nothing;
  -- Pre-provisioned beta/blocked rows receive their first trial once, too.
  -- Row lock serializes simultaneous first authenticated requests.
  select * into strict entitlement from public.entitlements where user_id = identity for update;
  if entitlement.trial_started_at is null then
    update public.entitlements set trial_started_at = checked_at,
      trial_ends_at = checked_at + interval '336 hours'
      where user_id = identity returning * into entitlement;
  end if;
  valid_until := greatest(entitlement.trial_ends_at, entitlement.active_until, entitlement.admin_override_until);
  if entitlement.blocked then access_status := 'blocked';
  elsif greatest(entitlement.active_until, entitlement.admin_override_until) > checked_at then access_status := 'active';
  elsif entitlement.trial_ends_at > checked_at then access_status := 'trial';
  else access_status := 'expired';
  end if;
  return jsonb_build_object('user_id', identity, 'status', access_status,
    'valid_until', valid_until, 'server_now', checked_at);
end;
$$;
revoke all on function public.get_entitlement() from public, anon, authenticated;
grant execute on function public.get_entitlement() to authenticated;

commit;

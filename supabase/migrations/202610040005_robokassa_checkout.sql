begin;

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'robokassa'),
  plan_id text not null check (plan_id = 'monthly'),
  amount_minor bigint not null check (amount_minor = 129000),
  currency text not null check (currency = 'RUB'),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'canceled')),
  provider_invoice_id integer generated always as identity unique check (provider_invoice_id > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_pending_checkout_per_user on public.payment_attempts(user_id) where status = 'pending';
alter table public.payment_attempts enable row level security;
revoke all on public.payment_attempts from public, anon, authenticated;
grant select, insert, update on public.payment_attempts to service_role;
grant usage, select on sequence public.payment_attempts_provider_invoice_id_seq to service_role;

create function public.touch_payment_attempt() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
create trigger payment_attempt_updated before update on public.payment_attempts
for each row execute function public.touch_payment_attempt();
revoke all on function public.touch_payment_attempt() from public, anon, authenticated;

-- No browser RPC: the Edge Function verifies JWT and supplies the user itself.
create function public.prepare_subscription_checkout(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare attempt public.payment_attempts; subscription public.subscriptions;
begin
  -- Serialize concurrent clicks across tabs/functions; no expiring signed invoices.
  perform 1 from auth.users where id = p_user_id and email_confirmed_at is not null for update;
  if not found then raise exception 'confirmed authenticated user required'; end if;
  if exists (select 1 from public.entitlements where user_id = p_user_id and blocked) then
    raise exception 'checkout blocked';
  end if;
  select * into subscription from public.subscriptions where user_id = p_user_id;
  if (subscription.status = 'active' and subscription.current_period_end > now())
    or subscription.status = 'past_due' then
    raise exception 'existing paid subscription; checkout forbidden';
  end if;
  select * into attempt from public.payment_attempts where user_id = p_user_id and status = 'pending';
  if not found then
    insert into public.payment_attempts(user_id, provider, plan_id, amount_minor, currency)
    values (p_user_id, 'robokassa', 'monthly', 129000, 'RUB') returning * into attempt;
  end if;
  return jsonb_build_object('id', attempt.id, 'userId', attempt.user_id, 'provider', attempt.provider,
    'planId', attempt.plan_id, 'amountMinor', attempt.amount_minor, 'currency', attempt.currency,
    'status', attempt.status, 'providerPaymentReference', attempt.provider_invoice_id::text);
end; $$;
revoke all on function public.prepare_subscription_checkout(uuid) from public, anon, authenticated;
grant execute on function public.prepare_subscription_checkout(uuid) to service_role;

commit;

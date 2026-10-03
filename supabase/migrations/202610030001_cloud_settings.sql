begin;

create table public.calculator_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
create table public.document_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

create function public.bump_settings_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.bump_settings_revision() from public;

create trigger calculator_settings_revision before update on public.calculator_settings
for each row execute function public.bump_settings_revision();
create trigger document_settings_revision before update on public.document_settings
for each row execute function public.bump_settings_revision();

alter table public.calculator_settings enable row level security;
alter table public.document_settings enable row level security;
revoke all on public.calculator_settings, public.document_settings from anon, authenticated;
grant select on public.calculator_settings, public.document_settings to authenticated;
grant insert (user_id, payload) on public.calculator_settings, public.document_settings to authenticated;
grant update (payload) on public.calculator_settings, public.document_settings to authenticated;

create policy calculator_settings_select on public.calculator_settings for select to authenticated
using (user_id = (select auth.uid()));
create policy calculator_settings_insert on public.calculator_settings for insert to authenticated
with check (user_id = (select auth.uid()));
create policy calculator_settings_update on public.calculator_settings for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy document_settings_select on public.document_settings for select to authenticated
using (user_id = (select auth.uid()));
create policy document_settings_insert on public.document_settings for insert to authenticated
with check (user_id = (select auth.uid()));
create policy document_settings_update on public.document_settings for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

commit;

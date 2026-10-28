create table if not exists public.import_batches (
  id text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fingerprint text not null, file_name text not null, imported_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb, unique (user_id, fingerprint)
);
create table if not exists public.ads_records (
  id text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  import_id text not null, report_type text not null, record_date date, product text, store text,
  campaign text, ad_group text, payload jsonb not null
);
alter table public.import_batches enable row level security;
alter table public.ads_records enable row level security;
drop policy if exists "own import batches" on public.import_batches;
drop policy if exists "own ads records" on public.ads_records;
create policy "own import batches" on public.import_batches for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own ads records" on public.ads_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists ads_records_user_date_idx on public.ads_records(user_id, record_date);
alter table public.ads_records add column if not exists product text;
create index if not exists ads_records_user_product_idx on public.ads_records(user_id, product);

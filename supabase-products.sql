-- Shared ecommerce inventory for GitHub Pages + Supabase
create table if not exists public.products (
  id text primary key,
  title text not null,
  description text not null default '',
  price numeric(12, 2) not null default 0,
  quantity integer not null default 0,
  category text not null default 'Senza categoria',
  images jsonb not null default '[]'::jsonb,
  variants jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products add column if not exists description text not null default '';

alter table public.products enable row level security;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'manage'
  );
$$;

revoke all on function public.is_manager() from public;
grant execute on function public.is_manager() to anon, authenticated;

drop policy if exists "Anyone can view published products" on public.products;
create policy "Anyone can view published products"
  on public.products for select
  using (true);

drop policy if exists "Managers can add products" on public.products;
create policy "Managers can add products"
  on public.products for insert
  to authenticated
  with check (public.is_manager());

drop policy if exists "Managers can update products" on public.products;
create policy "Managers can update products"
  on public.products for update
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists "Managers can delete products" on public.products;
create policy "Managers can delete products"
  on public.products for delete
  to authenticated
  using (public.is_manager());

create index if not exists products_category_idx on public.products (category);
create index if not exists products_updated_at_idx on public.products (updated_at desc);

create or replace function public.set_products_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at
before update on public.products
for each row execute function public.set_products_updated_at();

-- Public product images: readable by shoppers, writable only by managers.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Managers upload product images" on storage.objects;
create policy "Managers upload product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and public.is_manager());

drop policy if exists "Managers update product images" on storage.objects;
create policy "Managers update product images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images' and public.is_manager())
  with check (bucket_id = 'product-images' and public.is_manager());

drop policy if exists "Managers delete product images" on storage.objects;
create policy "Managers delete product images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images' and public.is_manager());

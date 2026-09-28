-- Public catalogue only. Never store staff PINs, sales or attendance here.
create schema if not exists gw_private;
revoke all on schema gw_private from public, anon, authenticated;
create table if not exists gw_private.catalog_owners(email text primary key);
alter table gw_private.catalog_owners enable row level security;
create table if not exists public.site_catalog (
 id boolean primary key default true check(id),
 payload jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.site_catalog enable row level security;
revoke all on public.site_catalog from anon,authenticated;
grant select on public.site_catalog to anon,authenticated;
create policy "Read shared catalogue" on public.site_catalog for select to anon,authenticated using(true);
create or replace function public.is_catalog_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join gw_private.catalog_owners o on lower(u.email)=lower(o.email)
 where u.id=auth.uid() and u.email_confirmed_at is not null);
$$;
revoke all on function public.is_catalog_owner() from public;
grant execute on function public.is_catalog_owner() to authenticated;
create or replace function public.save_catalog(p_payload jsonb,p_revision bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare next_revision bigint;
begin
 if not public.is_catalog_owner() then raise exception 'Verified Owner access required'; end if;
 if jsonb_typeof(p_payload->'menu') is distinct from 'array'
 or jsonb_typeof(p_payload->'categories') is distinct from 'array'
 or jsonb_typeof(p_payload->'content') is distinct from 'object'
 or jsonb_array_length(p_payload->'categories')<1
 or octet_length(p_payload::text)>5000000
 or (p_payload - 'menu' - 'categories' - 'content') <> '{}'::jsonb
 then raise exception 'Invalid catalogue'; end if;
 perform pg_advisory_xact_lock(74692301);
 if p_revision=0 then
   insert into public.site_catalog(id,payload) values(true,p_payload)
   on conflict(id) do nothing returning revision into next_revision;
 else
   update public.site_catalog set payload=p_payload,revision=revision+1,updated_at=now()
   where id=true and revision=p_revision returning revision into next_revision;
 end if;
 if next_revision is null then raise exception 'Catalogue changed elsewhere. Reload before saving.'; end if;
 return next_revision;
end;
$$;
revoke all on function public.save_catalog(jsonb,bigint) from public;
grant execute on function public.save_catalog(jsonb,bigint) to authenticated;

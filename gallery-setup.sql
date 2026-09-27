-- Shared, append-only public photo galleries. Manage removals in Supabase.
create table public.gallery_photos (
  id uuid primary key,
  gallery text not null check (gallery in ('crew','community')),
  author text not null check (char_length(author) between 1 and 80),
  caption text not null default '' check (char_length(caption) <= 300),
  crew_id text check (crew_id is null or char_length(crew_id) <= 80),
  object_path text not null unique,
  created_at timestamptz not null default now(),
  constraint gallery_photo_path check (object_path = gallery || '/' || id::text || '.jpg')
);
alter table public.gallery_photos enable row level security;
grant select on public.gallery_photos to anon, authenticated;
grant insert (id,gallery,author,caption,crew_id,object_path) on public.gallery_photos to anon, authenticated;
create policy "Gallery public reading" on public.gallery_photos for select to anon, authenticated using (true);
create policy "Gallery public submissions" on public.gallery_photos for insert to anon, authenticated with check (true);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('gw-gallery','gw-gallery',true,1048576,array['image/jpeg']);
create policy "Gallery image submissions" on storage.objects for insert to anon, authenticated
with check (bucket_id='gw-gallery' and name ~ '^(crew|community)/[0-9a-f-]{36}\.jpg$');
create index gallery_photos_feed on public.gallery_photos(gallery,created_at desc);

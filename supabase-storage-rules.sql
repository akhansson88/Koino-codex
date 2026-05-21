-- Supabase Storage setup for KOINO room images.
-- Run this in the Supabase SQL editor for project prumjueusdyqnwwovpen.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-images', 'room-images', true, 2097152, array['image/webp'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Room images are publicly readable" on storage.objects;
drop policy if exists "Clients can upload room images" on storage.objects;
drop policy if exists "Clients can delete room images" on storage.objects;

create policy "Room images are publicly readable"
on storage.objects for select
to public
using (bucket_id = 'room-images');

create policy "Clients can upload room images"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'room-images'
  and lower(storage.extension(name)) = 'webp'
);

create policy "Clients can delete room images"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'room-images');

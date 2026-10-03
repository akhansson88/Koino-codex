-- Deploy before enrolling users into E2EE. Storage access goes through the
-- Firebase encryptedAccount function, which checks current membership.
-- Its service credential is held only in the backend secret manager.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-images', 'room-images', false, 4194304, array['application/json']),
       ('user-avatars', 'user-avatars', false, 4194304, array['application/json'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove every former policy on these two buckets. They were limited to these
-- buckets; other buckets and their policies are not changed.
drop policy if exists "Room images are publicly readable" on storage.objects;
drop policy if exists "Clients can upload room images" on storage.objects;
drop policy if exists "Clients can delete room images" on storage.objects;
drop policy if exists "User avatars are publicly readable" on storage.objects;
drop policy if exists "Clients can upload user avatars" on storage.objects;
drop policy if exists "Clients can delete user avatars" on storage.objects;
-- No client policies: only the server service role can access these objects.

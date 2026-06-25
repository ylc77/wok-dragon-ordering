-- Restrict menu image Storage writes to staff/admin users only.
-- Customer QR sessions use anonymous authenticated users and must not be able to upload.

create schema if not exists private;

create or replace function private.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'staff')
  );
$$;

grant execute on function private.is_staff() to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 5242880, '{image/jpeg,image/png,image/webp}')
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "menu_images_auth_insert" on storage.objects;
drop policy if exists "menu_images_staff_insert" on storage.objects;
drop policy if exists "menu_images_staff_update" on storage.objects;
drop policy if exists "menu_images_staff_delete" on storage.objects;
drop policy if exists "menu_images_public_select" on storage.objects;

create policy "menu_images_staff_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'menu-images' and (select private.is_staff()));

create policy "menu_images_staff_update"
on storage.objects for update
to authenticated
using (bucket_id = 'menu-images' and (select private.is_staff()))
with check (bucket_id = 'menu-images' and (select private.is_staff()));

create policy "menu_images_staff_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'menu-images' and (select private.is_staff()));

create policy "menu_images_public_select"
on storage.objects for select
to public
using (bucket_id = 'menu-images');

-- Storage bucket for menu item images
-- Run this in Supabase SQL Editor

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 5242880, '{image/jpeg,image/png,image/webp}')
on conflict (id) do nothing;

-- Allow authenticated users to upload
create policy "menu_images_auth_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'menu-images' and auth.role() = 'authenticated');

-- Allow public read
create policy "menu_images_public_select"
on storage.objects for select
to public
using (bucket_id = 'menu-images');

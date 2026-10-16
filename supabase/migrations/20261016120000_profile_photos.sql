-- Personal photos belong to a user, independently of pantry roles.
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  avatar_path text,
  constraint own_avatar_path check (
    avatar_path is null or avatar_path ~ ('^' || id::text || '/[a-zA-Z0-9-]+\.jpg$')
  )
);
alter table public.user_profiles enable row level security;
grant select, insert, update on public.user_profiles to authenticated;

-- A security-definer membership check avoids recursive pantry_members policies.
create function public.can_view_profile(target_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() = target_user or exists (
    select 1 from public.pantry_members mine
    join public.pantry_members theirs on theirs.pantry_id = mine.pantry_id
    where mine.user_id = auth.uid() and theirs.user_id = target_user
  );
$$;
revoke all on function public.can_view_profile(uuid) from public;
grant execute on function public.can_view_profile(uuid) to authenticated;

create policy "Read your own or a teammates profile" on public.user_profiles
for select to authenticated using (public.can_view_profile(id));
create policy "Create your own profile" on public.user_profiles
for insert to authenticated with check (id = auth.uid());
create policy "Update your own profile" on public.user_profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 2097152, array['image/jpeg']);

create policy "Read your own or a teammates photo" on storage.objects
for select to authenticated using (
  bucket_id = 'profile-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text or exists (
    select 1 from public.user_profiles p
    where p.avatar_path = name and public.can_view_profile(p.id)
    )
  )
);
create policy "Upload your own profile photo" on storage.objects
for insert to authenticated with check (
  bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "Remove your own profile photo" on storage.objects
for delete to authenticated using (
  bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

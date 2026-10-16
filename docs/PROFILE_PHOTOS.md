# Profile photos

Open **Settings → Your profile**, or **pantry menu → Your profile**. Users can choose a photo, crop it using the native picker, replace it, or remove it. The saved photo appears in the team roster and member page; missing or unreadable photos fall back to an initial. The web picker uses a centered square crop. Photos are converted to 512×512 JPEGs before uploading.

## Database setup

Apply `supabase/migrations/20261016120000_profile_photos.sql` to the app's Supabase project before using photo uploads. It creates `user_profiles`, a private `profile-photos` bucket with a 2 MB JPEG limit, and row/storage policies. A user can change only their own photo. People who share a pantry can read it through expiring signed URLs. Pantry roles do not control personal-photo changes.

For an authenticated, linked checkout, review pending migrations with `npx supabase migration list`, then deploy the reviewed migrations with `npx supabase db push`. This checkout does not contain a linked project reference, so the migration has not been deployed from this task.

No new dependency or environment variable is required. The existing Supabase URL/key and image-picker/manipulator packages are used.

## Verification

`npm test` includes profile-photo tests for upload/save failure, replacement ordering, removal, cross-account path checks, byte limits, and binary decoding. `npm run typecheck` checks the UI and services.

Before release, apply the migration in a test project and verify on a phone:

- Choose, crop, and save a photo; cancel selection without changing the existing photo.
- Replace it, sign out and back in, and confirm it persists.
- Open the team roster as another member of the same pantry and confirm it appears.
- Remove it and confirm initials return in settings, menu, roster, and member page.
- Deny picker access and interrupt the connection; show a recoverable error and retain the previous photo.
- With another account, verify its own profile is editable but another user's storage/profile records cannot be written. An unrelated account cannot read the profile or mint a signed URL.
- Check the profile sheet in dark mode, with larger text, and on a narrow viewport.

Live Supabase permissions, device photo selection, and signed-in visual flows require a configured backend and have not been verified by the unit tests. A local browser fixture check was attempted, but did not reach the profile controls through the development startup flow; it is not recorded as a passing end-to-end test.

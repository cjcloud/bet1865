-- Private storage bucket for betslip screenshots. SPEC.md §6.2 image handling:
-- private bucket, signed URLs only, retained indefinitely.
-- Run this in the Supabase SQL editor same as 0001_init.sql.

insert into storage.buckets (id, name, public)
values ('betslips', 'betslips', false)
on conflict (id) do nothing;

-- Service-role (server-only) full access. The app never lets a browser talk
-- to Storage directly — uploads go through /api/upload and reads go through
-- signed URLs generated server-side — so no anon/authenticated policies are
-- needed here.
drop policy if exists "Service role manages betslips" on storage.objects;
create policy "Service role manages betslips"
  on storage.objects for all
  to service_role
  using (bucket_id = 'betslips')
  with check (bucket_id = 'betslips');

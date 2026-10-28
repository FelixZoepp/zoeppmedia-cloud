-- Sicherheit (Pentest 28.10.): offene Lese-Regeln, Nur-Lese-Zugänge, Uploads, Benachrichtigungen

-- 1. Paketpreise nie für Kunden/Fremde lesbar ("Internal reads pakete" bleibt)
drop policy if exists "Eingeloggt lesen" on public.paket_definitionen;

-- 2. "using (true)" → nur mit aktivem Profil (sonst reicht ein selbst registriertes Supabase-Konto)
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public' and cmd = 'SELECT' and qual = 'true'
             and tablename in ('access_item_templates','lesson_tasks','masterclass_lessons','masterclass_modules','recruiting_pipeline_templates','sop_phases','sop_tasks','survey_templates','task_templates','transcript_questions')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format('create policy "Mit Profil lesen" on public.%I for select to authenticated using (exists (select 1 from public.users u where u.id = auth.uid() and coalesce(u.aktiv, true)))', r.tablename);
  end loop;
end $$;

-- 3. Alte Schreib-Regeln ohne Rollenprüfung (agency_viewer konnte schreiben) – die neuen can_write_agency-Regeln bestehen parallel
drop policy if exists "Agency users insert appointments" on public.candidate_appointments;
drop policy if exists "Agency users update own appointments" on public.candidate_appointments;
drop policy if exists "Agency members can insert own call logs" on public.call_logs;
drop policy if exists "Agency users insert noshow events" on public.noshow_events;
drop policy if exists "Agency users insert consent events" on public.consent_events;

drop policy if exists "Agency members can insert own recordings" on public.call_recordings;
create policy "Kunden-Cloud schreiben" on public.call_recordings for insert to authenticated with check (can_write_agency(agency_id));

drop policy if exists "Agency owners can manage own stages" on public.pipeline_stages;
create policy "Stages schreiben" on public.pipeline_stages for all to authenticated
  using (agency_id is not null and can_write_agency(agency_id)) with check (agency_id is not null and can_write_agency(agency_id));

drop policy if exists "Agency updates own access_items" on public.access_items;
create policy "Kunden-Cloud schreiben" on public.access_items for update to authenticated using (can_write_agency(agency_id)) with check (can_write_agency(agency_id));
drop policy if exists "Agency users complete own tasks" on public.client_tasks;
create policy "Kunden-Cloud schreiben" on public.client_tasks for update to authenticated using (can_write_agency(agency_id)) with check (can_write_agency(agency_id));
drop policy if exists "Agency approves tasks" on public.customer_tasks;
create policy "Kunden-Cloud schreiben" on public.customer_tasks for update to authenticated using (can_write_agency(agency_id)) with check (can_write_agency(agency_id));
drop policy if exists "Agency reviews content" on public.content_library;
create policy "Kunden-Cloud schreiben" on public.content_library for update to authenticated using (can_write_agency(agency_id)) with check (can_write_agency(agency_id));
drop policy if exists "Agency updates own project_tasks" on public.project_tasks;
create policy "Kunden-Cloud schreiben" on public.project_tasks for update to authenticated using (can_write_agency(agency_id)) with check (can_write_agency(agency_id));
drop policy if exists "Agency updates project_task_checkitems" on public.project_task_checkitems;
create policy "Kunden-Cloud schreiben" on public.project_task_checkitems for update to authenticated
  using (task_id in (select id from public.project_tasks where can_write_agency(agency_id)))
  with check (task_id in (select id from public.project_tasks where can_write_agency(agency_id)));

-- 4. Onboarding: lesen wer Zugriff hat, schreiben nur mit Schreibrecht
drop policy if exists "Agency users manage own onboarding" on public.onboarding_submissions;
create policy "Onboarding lesen" on public.onboarding_submissions for select to authenticated using (can_access_agency(agency_id));
create policy "Onboarding schreiben" on public.onboarding_submissions for insert to authenticated with check (can_write_agency(agency_id));
create policy "Onboarding ändern" on public.onboarding_submissions for update to authenticated using (can_write_agency(agency_id)) with check (can_write_agency(agency_id));

-- 5. Benachrichtigungen nur an sich selbst (intern über "Intern verwaltet" bzw. Service-Role)
drop policy if exists "Eigene Benachrichtigungen anlegen" on public.notifications;
create policy "Eigene Benachrichtigungen anlegen" on public.notifications for insert to authenticated with check (user_id = auth.uid());

-- 6. Freigabe-Protokoll nur für die eigene Agentur
drop policy if exists "Create approvals" on public.approval_log;
create policy "Create approvals" on public.approval_log for insert to authenticated with check (acted_by = auth.uid() and can_write_agency(agency_id));

-- 8. onboarding-assets (öffentlich): nur in die bekannten Ordner, nur mit aktivem Profil, max. 50 MB
--    (Dateitypen bleiben offen – Masterclass-Anhänge sind beliebige Dateien)
update storage.buckets set file_size_limit = 52428800 where id = 'onboarding-assets';
drop policy if exists "Authenticated users can upload to onboarding-assets" on storage.objects;
create policy "onboarding-assets bekannte Ordner" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'onboarding-assets'
    and exists (select 1 from public.users u where u.id = auth.uid() and coalesce(u.aktiv, true))
    and (
      name like 'avatars/users/' || auth.uid()::text || '/%'
      or name ~ '^avatars/[^/]+$'
      or (name like 'avatars/agencies/%' and exists (
            select 1 from public.users u where u.id = auth.uid()
              and (u.role in ('admin', 'employee') or (u.role in ('agency_owner', 'agency_member') and u.agency_id::text = (storage.foldername(name))[3]))))
      or (name like 'logos/%')
      or (name like 'masterclass/%' and public.is_internal_user())
    )
  );
-- Öffentliche URLs brauchen keine SELECT-Policy; Auflisten aller Dateien unterbinden
drop policy if exists "Anyone can read onboarding-assets" on storage.objects;

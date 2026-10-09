-- Review-Fixes Runde 2 (Codex-Nachprüfung)

-- Funnel-Webhook: eigener Eingangs-Claim mit Zeitfenster (wiederaufnehmbar, kein Konflikt mit dem Tick-Reclaim)
create table if not exists public.sales_funnel_eingaenge (
  external_id text primary key,
  status text not null default 'laeuft' check (status in ('laeuft', 'fertig')),
  gestartet_am timestamptz not null default now(),
  erledigt_am timestamptz,
  lead_id text,
  fehler text
);
alter table public.sales_funnel_eingaenge enable row level security;

-- Video: neue Version atomar (Row Lock auf dem Video, Nummer, Insert, Status zurück auf „zu prüfen“)
create or replace function public.video_neue_version(
  p_video uuid, p_pfad text, p_dateiname text, p_groesse bigint, p_dauer numeric, p_user uuid
) returns table (version_id uuid, nr integer)
language plpgsql security definer set search_path = public as $$
declare v_nr integer; v_id uuid;
begin
  perform 1 from videos where id = p_video for update;
  if not found then raise exception 'Video nicht gefunden'; end if;
  select coalesce(max(version), 0) + 1 into v_nr from video_versionen where video_id = p_video;
  insert into video_versionen (video_id, version, storage_pfad, dateiname, groesse_bytes, dauer_s, hochgeladen_von)
  values (p_video, v_nr, p_pfad, p_dateiname, p_groesse, p_dauer, p_user) returning id into v_id;
  update videos set aktuelle_version = v_nr, status = 'in_pruefung', freigegeben_am = null, updated_at = now() where id = p_video;
  return query select v_id, v_nr;
end $$;
revoke all on function public.video_neue_version(uuid, text, text, bigint, numeric, uuid) from public, anon, authenticated;

-- Video-KI: Ergebnis + Hinweise atomar ersetzen
create or replace function public.video_ki_ersetzen(p_version uuid, p_ergebnis jsonb, p_hinweise jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from video_kommentare where version_id = p_version and ki = true;
  insert into video_kommentare (video_id, version_id, zeit_s, text, autor_id, ki, erledigt)
  select (h->>'video_id')::uuid, p_version, (h->>'zeit_s')::numeric, h->>'text', nullif(h->>'autor_id', '')::uuid, true, coalesce((h->>'erledigt')::boolean, false)
  from jsonb_array_elements(coalesce(p_hinweise, '[]'::jsonb)) h;
  update video_versionen set ki_status = 'fertig', ki_ergebnis = p_ergebnis where id = p_version;
end $$;
revoke all on function public.video_ki_ersetzen(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.video_neue_version(uuid, text, text, bigint, numeric, uuid) to service_role;
grant execute on function public.video_ki_ersetzen(uuid, jsonb, jsonb) to service_role;

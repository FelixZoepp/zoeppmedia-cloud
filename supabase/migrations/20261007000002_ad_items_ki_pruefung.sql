-- KI-Prüfung als doppelter Boden vor der Kundenfreigabe
alter table public.ad_items add column if not exists ki_pruefung jsonb;
alter table public.ad_items add column if not exists ki_override jsonb;
comment on column public.ad_items.ki_pruefung is 'Letzte KI-Prüfung (Ampel, Punkte, Kriterien) – gilt für die Version in ki_pruefung.fuer';
comment on column public.ad_items.ki_override is 'Zur Freigabe ohne grüne KI-Prüfung: Grund, wer, wann, für welche Version';

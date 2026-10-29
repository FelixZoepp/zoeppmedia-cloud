-- Absagen bleiben intern: keine Absage-Vorlagen (Telefon/nach VG/schriftlich) für Bewerber mehr – löschen und sperren
delete from public.content_templates where content_type in ('absage_telefon', 'absage_vg', 'absage_schriftlich');

alter table public.content_templates drop constraint if exists content_templates_content_type_check;
alter table public.content_templates add constraint content_templates_content_type_check check (
  content_type in ('ad_winkel_1', 'ad_winkel_2', 'ad_winkel_3', 'funnel', 'phone_script', 'vg_leitfaden', 'follow_up', 'indeed', 'generator_rules')
);

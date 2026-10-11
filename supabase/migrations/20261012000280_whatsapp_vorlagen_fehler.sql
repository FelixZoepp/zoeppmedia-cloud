-- Ablehnungs-/Einreichungsfehler von Meta speichern (Anzeige + automatischer Neuversuch)
alter table public.whatsapp_templates add column if not exists meta_fehler text, add column if not exists eingereicht_am timestamptz;

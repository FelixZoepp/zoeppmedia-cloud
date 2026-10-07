-- Kurze Close-Notiz merken (zum Aktualisieren statt Doppeln)
alter table public.gespraech_analysen add column if not exists close_note_id text;

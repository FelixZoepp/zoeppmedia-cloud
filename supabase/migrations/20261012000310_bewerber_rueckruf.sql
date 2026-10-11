-- KI-Agent fragt „Wann bist du für einen kurzen Anruf erreichbar?“ → Rückruf-Fenster für den Innendienst
alter table public.candidates add column if not exists rueckruf_von timestamptz, add column if not exists rueckruf_bis timestamptz, add column if not exists rueckruf_text text;

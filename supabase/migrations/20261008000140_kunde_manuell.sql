-- Sales-Inbox: Kontakte von Hand als Kunde oder Lead markieren.
-- Von Hand markiert → die automatische Kunden-Zuordnung überschreibt das nicht.
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS kunde_manuell boolean NOT NULL DEFAULT false;

-- Neue Fulfillment-Automatik (Vertrag, Setup, Meta, Funnel, KI-Bilder, Kadenz alle 15 Min.,
-- Umfragen/Reports, Garantie/Verlängerung) nur für Kunden mit automatik = true.
-- Bestandskunden bleiben aus; After-Close (neuer Weg) setzt den Schalter für neue Kunden.
ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS automatik boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_agencies_automatik ON public.agencies (id) WHERE automatik;

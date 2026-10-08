-- KPI-/Dashboard-Abfragen filtern fast immer nach Agentur + Zeitraum (Review 2026-10-08)
CREATE INDEX IF NOT EXISTS idx_candidates_agency_created
  ON public.candidates (agency_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_activity_log_agency_created
  ON public.activity_log (agency_id, created_at DESC);

-- Meta-Sync nutzt upsert(onConflict: agency_id,report_date) – dafür muss ein Unique-Index existieren.
-- Laut Ursprungs-Migration als UNIQUE(agency_id, report_date) angelegt; nur nachziehen, falls er live fehlt.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'meta_ad_reports'
      AND i.indisunique
      AND i.indpred IS NULL
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM pg_attribute a
           WHERE a.attrelid = t.oid AND a.attnum = ANY (i.indkey)) = ARRAY['agency_id', 'report_date']
  ) THEN
    -- Doppelte Tage vorher bereinigen (jüngsten Abruf behalten)
    DELETE FROM public.meta_ad_reports m
    USING public.meta_ad_reports n
    WHERE m.agency_id = n.agency_id
      AND m.report_date = n.report_date
      AND (m.fetched_at, m.id) < (n.fetched_at, n.id);
    CREATE UNIQUE INDEX uq_meta_ad_reports_agency_date ON public.meta_ad_reports (agency_id, report_date);
  END IF;
END $$;

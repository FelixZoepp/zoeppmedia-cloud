# Phase 0: Fundament — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec-konformes Datenmodell (jobs/applications), Rollen inkl. `agency_viewer`, Queue-/Scheduler-Tabellen, Impersonation und Test-Infrastruktur in die bestehende Zoepp Media Cloud einziehen — additiv, ohne Bestandsfunktionen zu brechen.

**Architecture:** Alle Änderungen als Supabase-Migrationen (additiv, Backfill statt Rename). Neue RLS-Helper `can_access_agency()`/`can_write_agency()` kapseln das bestehende Zugriffs-Muster (eigene Agentur ∪ admin/employee ∪ employee_assignments) und schließen `agency_viewer` vom Schreiben aus. TypeScript-Typen + Helper in `src/lib/recruiting/`. Vitest als Test-Runner.

**Tech Stack:** Next.js 16 (App Router), Supabase Postgres + RLS, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-spec-recruiting-plattform.md` + `docs/superpowers/specs/2026-09-21-integration-design.md`

## Global Constraints

- UI-Sprache Deutsch; Code/Tabellen/Felder Englisch.
- Telefonnummern immer E.164 (`+49...`), Standardland DE.
- Migrationen additiv: keine Drops/Renames bestehender Spalten. Live-DB mit 6 echten Agenturen.
- Bestehende Rollen-Enum-Werte (`admin`, `employee`, `agency_owner`, `agency_member`) werden NICHT umbenannt.
- Migrations-Dateien: `supabase/migrations/20260921NNNNNN_<name>.sql`; Anwendung auf die Live-DB erfolgt durch den Orchestrator (Supabase MCP `apply_migration`), nicht durch Task-Subagenten.
- Jeder Task endet mit `npm run build` (muss grün sein) + Commit.

---

### Task 1: Vitest-Setup + Telefon-Normalisierung

**Files:**
- Modify: `package.json` (devDeps: `vitest`; scripts: `"test": "vitest run", "test:watch": "vitest"`)
- Create: `vitest.config.ts`
- Create: `src/lib/phone.ts`
- Test: `src/lib/__tests__/phone.test.ts`

**Interfaces:**
- Produces: `normalizePhoneE164(input: string | null | undefined, defaultCountry?: 'DE'): string | null` — gibt E.164 oder `null` (nicht normalisierbar) zurück.

- [ ] **Step 1: Vitest installieren**

```bash
npm install -D vitest
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
```

- [ ] **Step 2: Failing Test schreiben**

```ts
import { describe, it, expect } from 'vitest';
import { normalizePhoneE164 } from '../phone';

describe('normalizePhoneE164', () => {
  it('normalisiert deutsche 0-Nummern', () => {
    expect(normalizePhoneE164('0176 1234567')).toBe('+491761234567');
  });
  it('behält +49 bei', () => {
    expect(normalizePhoneE164('+49 176 1234567')).toBe('+491761234567');
  });
  it('wandelt 0049 um', () => {
    expect(normalizePhoneE164('0049176/1234567')).toBe('+491761234567');
  });
  it('akzeptiert andere Länder mit +', () => {
    expect(normalizePhoneE164('+43 660 1234567')).toBe('+436601234567');
  });
  it('gibt null bei Müll zurück', () => {
    expect(normalizePhoneE164('abc')).toBeNull();
    expect(normalizePhoneE164('')).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164('123')).toBeNull(); // zu kurz
  });
});
```

- [ ] **Step 3: Test läuft rot** — `npx vitest run src/lib/__tests__/phone.test.ts`, erwartet FAIL (Modul fehlt).

- [ ] **Step 4: Implementierung**

```ts
// src/lib/phone.ts
// E.164-Normalisierung, Standardland DE (Spec Abschn. 4: "Telefonnummern immer E.164").
export function normalizePhoneE164(
  input: string | null | undefined,
  defaultCountry: 'DE' = 'DE'
): string | null {
  if (!input) return null;
  let s = input.replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) {
    if (s.startsWith('0')) s = '+49' + s.slice(1);
    else if (s.length >= 7) s = '+49' + s; // defaultCountry DE
    else return null;
  }
  const digits = s.slice(1);
  if (!/^\d{7,15}$/.test(digits)) return null;
  return s;
}
```

- [ ] **Step 5: Test grün** — `npx vitest run src/lib/__tests__/phone.test.ts`, erwartet PASS.
- [ ] **Step 6: Build + Commit** — `npm run build`, dann `git add -A && git commit -m "feat(recruiting): Vitest-Setup + E.164-Telefonnormalisierung"`

---

### Task 2: Migration — Agencies erweitern, Rolle agency_viewer, RLS-Helper

**Files:**
- Create: `supabase/migrations/20260921000001_orgs_roles.sql`

**Interfaces:**
- Produces: SQL-Funktionen `public.can_access_agency(target uuid) returns boolean` und `public.can_write_agency(target uuid) returns boolean` (SECURITY DEFINER, STABLE) — alle künftigen RLS-Policies nutzen ausschließlich diese; Spalten `agencies.slug/timezone/retention_days/settings`; Enum-Wert `agency_viewer`.

- [ ] **Step 1: Migration schreiben** (exakt diesen Inhalt):

```sql
-- Phase 0 / Spec Abschn. 2+4: Mandanten-Felder, Viewer-Rolle, RLS-Helper.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'agency_viewer';

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Berlin';
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS retention_days int NOT NULL DEFAULT 180;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}';

UPDATE agencies SET slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';
UPDATE agencies a SET slug = a.slug || '-' || substr(a.id::text, 1, 4)
WHERE EXISTS (SELECT 1 FROM agencies b WHERE b.slug = a.slug AND b.id < a.id);
ALTER TABLE agencies ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agencies_slug ON agencies(slug);

CREATE OR REPLACE FUNCTION public.can_access_agency(target uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND (agency_id = target OR role IN ('admin', 'employee'))
  ) OR EXISTS (
    SELECT 1 FROM employee_assignments
    WHERE employee_id = auth.uid() AND agency_id = target
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_agency(target uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND (
      (agency_id = target AND role IN ('agency_owner', 'agency_member'))
      OR role IN ('admin', 'employee')
    )
  ) OR EXISTS (
    SELECT 1 FROM employee_assignments
    WHERE employee_id = auth.uid() AND agency_id = target
  );
$$;
```

- [ ] **Step 2: Syntax-Check lokal** — `node -e "console.log(require('fs').readFileSync('supabase/migrations/20260921000001_orgs_roles.sql','utf8').length)"` (Datei existiert, kein SQL-Runner lokal nötig; Anwendung macht der Orchestrator).
- [ ] **Step 3: Commit** — `git add supabase/migrations/20260921000001_orgs_roles.sql && git commit -m "feat(recruiting): Mandanten-Felder, agency_viewer-Rolle, RLS-Helper"`

---

### Task 3: Migration — jobs, job_assignments, applications, application_answers, Kandidaten-Erweiterung

**Files:**
- Create: `supabase/migrations/20260921000002_jobs_applications.sql`

**Interfaces:**
- Consumes: `can_access_agency()`, `can_write_agency()` aus Task 2.
- Produces: Tabellen `jobs`, `job_assignments`, `applications`, `application_answers`; Spalten `pipeline_stages.stage_type`, `candidates.phone_e164/consent_at/consent_source/language/deleted_at`.

- [ ] **Step 1: Migration schreiben** (exakt diesen Inhalt):

```sql
-- Phase 0 / Spec Abschn. 4: Jobs + Applications (Modell A aus Integrations-Design).
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  location text,
  postal_code text,
  employment_type text,
  salary_range text,
  contact_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','closed')),
  external_ref text,
  indeed_enabled boolean NOT NULL DEFAULT false,
  indeed_mode text NOT NULL DEFAULT 'off' CHECK (indeed_mode IN ('apply','redirect','off')),
  apply_url text,
  bot_config_id uuid, -- FK folgt in Phase 3 (bot_configs)
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, slug)
);
CREATE INDEX idx_jobs_agency_status ON jobs(agency_id, status);

CREATE TABLE job_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

-- Pipeline-Stufen bekommen festen Typ fürs Reporting (Spec Abschn. 10).
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS stage_type text
  CHECK (stage_type IN ('new','qualifying','qualified','interview','offer','hired','rejected'));
UPDATE pipeline_stages SET stage_type = CASE
  WHEN lower(name) LIKE '%eingang%' OR lower(name) LIKE '%neu%' THEN 'new'
  WHEN lower(name) LIKE '%kontakt%' THEN 'qualifying'
  WHEN lower(name) LIKE '%vorstellung%' OR lower(name) LIKE '%gespräch%' OR lower(name) LIKE '%termin%' THEN 'interview'
  WHEN lower(name) LIKE '%probetag%' THEN 'offer'
  WHEN lower(name) LIKE '%eingestellt%' THEN 'hired'
  WHEN lower(name) LIKE '%abgesagt%' OR lower(name) LIKE '%abgelehnt%' THEN 'rejected'
  ELSE 'qualifying'
END WHERE stage_type IS NULL;

-- Kandidaten = Person (Spec Abschn. 4); Bewerbung wandert in applications.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS phone_e164 text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS consent_at timestamptz;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS consent_source text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'de';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE candidates SET phone_e164 = CASE
  WHEN phone IS NULL OR phone = '' THEN NULL
  WHEN regexp_replace(phone, '[^0-9+]', '', 'g') LIKE '+%'
    THEN regexp_replace(phone, '[^0-9+]', '', 'g')
  WHEN regexp_replace(phone, '[^0-9]', '', 'g') LIKE '00%'
    THEN '+' || substr(regexp_replace(phone, '[^0-9]', '', 'g'), 3)
  WHEN regexp_replace(phone, '[^0-9]', '', 'g') LIKE '0%'
    THEN '+49' || substr(regexp_replace(phone, '[^0-9]', '', 'g'), 2)
  ELSE NULL
END WHERE phone_e164 IS NULL;
CREATE INDEX IF NOT EXISTS idx_candidates_phone_e164 ON candidates(agency_id, phone_e164) WHERE phone_e164 IS NOT NULL;

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  source_ref text,
  campaign jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','hired','rejected','withdrawn','not_reached')),
  score int,
  score_label text CHECK (score_label IN ('A','B','C')),
  score_reasons jsonb,
  summary text,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_applications_source_ref ON applications(agency_id, source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX idx_applications_agency_stage ON applications(agency_id, stage_id);
CREATE INDEX idx_applications_candidate ON applications(candidate_id);
CREATE INDEX idx_applications_job ON applications(job_id);

CREATE TABLE application_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  question_key text NOT NULL,
  question_text text,
  answer_raw text,
  answer_normalized jsonb,
  origin text NOT NULL DEFAULT 'bot' CHECK (origin IN ('indeed','bot','form')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, question_key)
);
CREATE INDEX idx_application_answers_app ON application_answers(application_id);

-- RLS: einheitlich über die Helper aus 20260921000001.
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs select" ON jobs FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "jobs write" ON jobs FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_assignments select" ON job_assignments FOR SELECT
  USING (EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_id AND can_access_agency(j.agency_id)));
CREATE POLICY "job_assignments write" ON job_assignments FOR ALL
  USING (EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_id AND can_write_agency(j.agency_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_id AND can_write_agency(j.agency_id)));

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "applications select" ON applications FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "applications write" ON applications FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

ALTER TABLE application_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "application_answers select" ON application_answers FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "application_answers write" ON application_answers FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));
```

- [ ] **Step 2: Commit** — `git add supabase/migrations/20260921000002_jobs_applications.sql && git commit -m "feat(recruiting): jobs, applications, application_answers + Kandidaten-Erweiterung"`

---

### Task 4: Migration — events_inbox + scheduled_jobs (Queue/Scheduler)

**Files:**
- Create: `supabase/migrations/20260921000003_queue_scheduler.sql`

**Interfaces:**
- Produces: Tabellen `events_inbox` (Webhook-Queue) und `scheduled_jobs` (Reminder/Worker) — nur Service-Role-Zugriff (RLS an, keine Policies).

- [ ] **Step 1: Migration schreiben** (exakt diesen Inhalt):

```sql
-- Phase 0 / Spec Abschn. 3+11: Queue + Scheduler. Zugriff nur über Service Role.
CREATE TABLE events_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  external_id text,
  agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed','dead')),
  attempts int NOT NULL DEFAULT 0,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE UNIQUE INDEX uq_events_inbox_source_ext ON events_inbox(source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_events_inbox_due ON events_inbox(status, received_at);
ALTER TABLE events_inbox ENABLE ROW LEVEL SECURITY;

CREATE TABLE scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES agencies(id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed','dead','cancelled')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_scheduled_jobs_dedupe ON scheduled_jobs(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX idx_scheduled_jobs_due ON scheduled_jobs(status, run_at);
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Commit** — `git add supabase/migrations/20260921000003_queue_scheduler.sql && git commit -m "feat(recruiting): events_inbox-Queue + scheduled_jobs-Scheduler"`

---

### Task 5: Migration — Backfill Default-Jobs + Applications

**Files:**
- Create: `supabase/migrations/20260921000004_backfill_applications.sql`

**Interfaces:**
- Consumes: `jobs`, `applications` aus Task 3.
- Produces: Pro Agentur genau 1 Default-Job (`is_default = true`, Titel „Vertriebsmitarbeiter (D2D)"); pro Bestandskandidat genau 1 Application mit dessen bisheriger Stufe/Quelle.

- [ ] **Step 1: Migration schreiben** (exakt diesen Inhalt):

```sql
-- Phase 0 / Integrations-Design: Bestandskandidaten -> applications (Modell A).
INSERT INTO jobs (agency_id, title, slug, status, is_default, employment_type)
SELECT id, 'Vertriebsmitarbeiter (D2D)', 'vertriebsmitarbeiter-d2d', 'active', true, 'Vollzeit'
FROM agencies
ON CONFLICT (agency_id, slug) DO NOTHING;

INSERT INTO applications (agency_id, candidate_id, job_id, stage_id, source, applied_at, created_at, status)
SELECT
  c.agency_id, c.id, j.id, c.current_stage_id, c.source, c.created_at, c.created_at,
  CASE WHEN ps.stage_type = 'hired' THEN 'hired'
       WHEN ps.stage_type = 'rejected' THEN 'rejected'
       ELSE 'open' END
FROM candidates c
JOIN jobs j ON j.agency_id = c.agency_id AND j.is_default
LEFT JOIN pipeline_stages ps ON ps.id = c.current_stage_id
WHERE NOT EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = c.id);
```

- [ ] **Step 2: Commit** — `git add supabase/migrations/20260921000004_backfill_applications.sql && git commit -m "feat(recruiting): Backfill Default-Jobs + Applications aus Bestandskandidaten"`

---

### Task 6: TypeScript-Typen + Recruiting-Helper

**Files:**
- Create: `src/types/recruiting.ts`
- Create: `src/lib/recruiting/scope.ts`
- Test: `src/lib/recruiting/__tests__/scope.test.ts`

**Interfaces:**
- Consumes: bestehendes `src/lib/auth.ts` (Muster für User-Laden ansehen und übernehmen; NICHT umbauen).
- Produces:
  - Typen: `Job`, `Application`, `ApplicationAnswer`, `PipelineStageTyped` (Spiegel der Task-3-Tabellen, Feldnamen identisch zu SQL).
  - `canWriteRole(role: string): boolean` — `true` für `admin|employee|agency_owner|agency_member`, `false` für `agency_viewer`.
  - `IMPERSONATION_COOKIE = 'zmc_impersonate_agency'` (Konstante).

- [ ] **Step 1: Failing Test für `canWriteRole`**

```ts
import { describe, it, expect } from 'vitest';
import { canWriteRole } from '../scope';

describe('canWriteRole', () => {
  it.each(['admin', 'employee', 'agency_owner', 'agency_member'])('%s darf schreiben', (r) => {
    expect(canWriteRole(r)).toBe(true);
  });
  it('agency_viewer darf nicht schreiben', () => {
    expect(canWriteRole('agency_viewer')).toBe(false);
  });
  it('unbekannte Rolle darf nicht schreiben', () => {
    expect(canWriteRole('gast')).toBe(false);
  });
});
```

- [ ] **Step 2: rot laufen lassen** — `npx vitest run src/lib/recruiting/__tests__/scope.test.ts` → FAIL.
- [ ] **Step 3: Implementieren** (`scope.ts` exportiert `canWriteRole`, `IMPERSONATION_COOKIE`; `recruiting.ts` die Typen — Feldnamen 1:1 wie in Migration Task 3).
- [ ] **Step 4: grün** — `npx vitest run` → PASS.
- [ ] **Step 5: Build + Commit** — `npm run build && git add -A && git commit -m "feat(recruiting): Typen + Rollen-Scope-Helper"`

---

### Task 7: Impersonation (Platform Admin) + Banner

**Files:**
- Create: `src/app/api/admin/impersonate/route.ts`
- Create: `src/components/impersonation-banner.tsx`
- Modify: `src/app/(portal)/layout.tsx` (Banner einbinden)
- Modify: `src/lib/auth.ts` (nur ergänzen: `getEffectiveAgencyId()`)

**Interfaces:**
- Consumes: `IMPERSONATION_COOKIE` aus Task 6; bestehende Auth-Helper in `src/lib/auth.ts` (erst lesen, Muster übernehmen); bestehende Audit-Lib `src/lib/audit/` (ansehen; falls Signatur abweicht, deren bestehende Funktion nutzen).
- Produces:
  - `POST /api/admin/impersonate` Body `{ agencyId: string }` → nur Rolle `admin`; setzt httpOnly-Cookie `zmc_impersonate_agency=<agencyId>` (Path `/`, `sameSite: 'lax'`, `maxAge: 3600`), schreibt Audit-Log-Eintrag `action: 'impersonation_start'` mit `agency_id`; Response `{ ok: true }`.
  - `DELETE /api/admin/impersonate` → löscht Cookie, Audit `impersonation_end`, `{ ok: true }`.
  - `getEffectiveAgencyId(): Promise<string | null>` in `src/lib/auth.ts`: für `admin` mit gesetztem Cookie → Cookie-Wert, sonst eigene `agency_id` aus `users`.
  - Banner: Server Component; rendert nur, wenn Cookie gesetzt UND Rolle `admin`; zeigt „Du agierst als {Agenturname}" + Button „Beenden" (ruft DELETE, `router.refresh()`).

- [ ] **Step 1: Bestehende Auth-/Audit-Libs lesen** (`src/lib/auth.ts`, `src/lib/audit/`), Muster notieren.
- [ ] **Step 2: Route implementieren** (Zod-lose einfache Validierung reicht: `typeof agencyId === 'string'` + Existenz-Check der Agentur via Service-Client; 403 wenn nicht admin).
- [ ] **Step 3: `getEffectiveAgencyId()` ergänzen** — bestehende Funktionen NICHT ändern.
- [ ] **Step 4: Banner + Layout-Einbindung.**
- [ ] **Step 5: Build** — `npm run build` → grün.
- [ ] **Step 6: Commit** — `git commit -m "feat(recruiting): Impersonation für Platform Admin mit Audit + Banner"`

---

### Task 8: RLS-Mandantentrennungs-Test (Integration, explizit ausführbar)

**Files:**
- Create: `scripts/test-rls-isolation.ts`
- Modify: `package.json` (script: `"test:rls": "npx tsx scripts/test-rls-isolation.ts"`; devDep `tsx`)

**Interfaces:**
- Consumes: Env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` aus `.env.local`.
- Produces: Skript, das gegen die Live-DB läuft: legt 2 Wegwerf-Agenturen `RLS-TEST-A/-B` + je 1 User (`rls-test-a@zoepp-test.internal`, Zufallspasswort) + je 1 Job/Application an, prüft mit Anon-Client-Login: User A sieht seine Application, sieht NICHT die von B (select liefert 0 Zeilen), `agency_viewer` kann nicht inserten. Räumt IMMER auf (finally: Agenturen + Auth-User löschen). Exit-Code 0 = bestanden.

- [ ] **Step 1: Skript schreiben** — Struktur:

```ts
// scripts/test-rls-isolation.ts — Spec Abschn. 4: "automatisierter Test, der Fremdzugriff ausschließt"
// Läuft gegen die verbundene Supabase-DB. Legt markierte Wegwerf-Daten an und räumt sie in finally auf.
import { createClient } from '@supabase/supabase-js';
// 1) Service-Client: Agentur A+B, User A (agency_member), User B (agency_member), Viewer V (agency_viewer, Agentur A)
// 2) Anon-Client als A einloggen: select applications -> nur eigene; select applications von B -> 0 Zeilen
// 3) Anon-Client als V: insert in jobs -> erwartet Fehler (RLS)
// 4) finally: alle angelegten Zeilen + Auth-User löschen; bei Fehlern trotzdem weiterlöschen
// assert()-Helfer wirft mit klarer Meldung; process.exitCode entsprechend setzen.
```

Der Implementierer schreibt das vollständige Skript nach dieser Struktur (dotenv via `import 'dotenv/config'` oder manuelles Parsen von `.env.local` — schauen, was im Repo üblich ist: `grep -r "dotenv" package.json src/lib`).

- [ ] **Step 2: NOCH NICHT ausführen** — Ausführung erst nachdem der Orchestrator die Migrationen angewandt hat (Task 9). Nur `npm run build` + Typecheck.
- [ ] **Step 3: Commit** — `git commit -m "test(recruiting): RLS-Mandantentrennungs-Test"`

---

### Task 9 (Orchestrator, kein Subagent): Migrationen anwenden + verifizieren

- [ ] **Step 1:** Migrationen 20260921000001–04 via Supabase MCP `apply_migration` in Reihenfolge anwenden (Projekt `qfzqoxeocyuqfreihiok`).
- [ ] **Step 2:** Verifizieren per SQL: `select count(*) from jobs;` ≥ Anzahl Agenturen; `select count(*) from applications;` = Anzahl candidates; Stichprobe `select stage_type, count(*) from pipeline_stages group by 1;`.
- [ ] **Step 3:** `npm run test:rls` → bestanden.
- [ ] **Step 4:** `npm run build && npx vitest run` → grün.
- [ ] **Step 5:** Supabase Advisors prüfen (`get_advisors` security) — neue Findings zu neuen Tabellen beheben.
- [ ] **Step 6:** Commit ggf. Fixes: `git commit -m "fix(recruiting): Phase-0-Verifikation"`

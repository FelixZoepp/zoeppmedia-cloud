# Phase 2: KPI-System, Playbook, Email-Einladungen, Zufriedenheits-Checks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add KPI target system with automatic problem detection, a playbook database for Mitarbeiter, email invitations via Resend, milestone-based satisfaction surveys, and an extended admin dashboard with traffic-light status per agency.

**Architecture:** Extend existing Next.js 16 App Router + Supabase project. New DB tables for KPI defaults/overrides, problems, playbook entries, and survey scheduling. Resend SDK for transactional emails. Problem detection runs on-demand via API route. All new UIs use existing Apple Red design system.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Supabase, Resend (`resend` NPM), Recharts (existing), lucide-react (existing)

## Global Constraints

- No new UI libraries — use existing Apple Red components (`Button`, `Badge`, `Card`, `Modal`, `Input`, `Select`, `SegmentedControl`, `PageHeader`, `Sidebar`)
- All API routes: auth-check via `getCurrentUser()` from `src/lib/auth.ts` or inline `supabase.auth.getUser()` pattern
- Admin routes use `isAdmin(supabase)` from `src/lib/admin.ts` or `isInternal(user.role)` from `src/lib/auth.ts`
- Supabase client: `createClient()` for browser, `createServerClient()` for API routes, `createAdminClient()` for service-role ops
- Types in `src/lib/types/database.ts`
- German UI copy throughout
- Server Component pattern: async page with `export const dynamic = 'force-dynamic'`, data fetched server-side via lib function, passed to `'use client'` view component
- `Card` uses `inset` boolean prop (not `variant`), `PageHeader` uses `description` prop (not `subtitle`)

---

### Task 1: DB Migration — KPI tables, playbook, survey schedule + seeds

**Files:**
- Create: `supabase/migrations/20260811000003_kpi_playbook_surveys.sql`
- Modify: `src/lib/types/database.ts`

**Interfaces:**
- Consumes: Existing `agencies`, `users`, `survey_templates`, `survey_responses` tables
- Produces: `kpi_defaults`, `agency_kpi_overrides`, `agency_problems`, `playbook_entries`, `survey_schedule` tables. Types: `KpiDefault`, `AgencyKpiOverride`, `AgencyProblem`, `PlaybookEntry`, `SurveySchedule`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260811000003_kpi_playbook_surveys.sql

-- 1. KPI Defaults
CREATE TABLE kpi_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  default_value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('lower_is_better', 'higher_is_better')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO kpi_defaults (kpi_key, label, default_value, unit, direction) VALUES
  ('max_cpl', 'Max CPL', 40, 'Euro', 'lower_is_better'),
  ('min_reach_rate', 'Min Erreichbarkeit', 50, 'Prozent', 'higher_is_better'),
  ('min_termin_rate', 'Min Termin-Quote', 15, 'Prozent', 'higher_is_better'),
  ('max_response_hours', 'Max Reaktionszeit', 24, 'Stunden', 'lower_is_better'),
  ('min_candidates_week', 'Min Bewerber/Woche', 5, 'Anzahl', 'higher_is_better'),
  ('max_phase_days', 'Max Phase-Dauer', 5, 'Tage', 'lower_is_better'),
  ('min_indeed_per_2days', 'Indeed Min Bewerber/2 Tage', 1, 'Anzahl', 'higher_is_better'),
  ('min_satisfaction', 'Min Zufriedenheit', 3, 'Sterne', 'higher_is_better');

ALTER TABLE kpi_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can read kpi_defaults" ON kpi_defaults FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Admin can manage kpi_defaults" ON kpi_defaults FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

-- 2. Agency KPI Overrides
CREATE TABLE agency_kpi_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  kpi_key TEXT NOT NULL REFERENCES kpi_defaults(kpi_key) ON DELETE CASCADE,
  value NUMERIC NOT NULL,
  set_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agency_id, kpi_key)
);

ALTER TABLE agency_kpi_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can manage overrides" ON agency_kpi_overrides FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

-- 3. Agency Problems
CREATE TABLE agency_problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  problem_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  current_value NUMERIC,
  target_value NUMERIC,
  details JSONB DEFAULT '{}',
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id)
);

CREATE INDEX idx_agency_problems_active ON agency_problems(agency_id) WHERE resolved_at IS NULL;

ALTER TABLE agency_problems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can manage problems" ON agency_problems FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

-- 4. Playbook Entries
CREATE TABLE playbook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  causes TEXT[] NOT NULL DEFAULT '{}',
  immediate_actions TEXT[] NOT NULL DEFAULT '{}',
  long_term_actions TEXT[] NOT NULL DEFAULT '{}',
  escalation_trigger TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO playbook_entries (problem_key, title, description, causes, immediate_actions, long_term_actions, escalation_trigger) VALUES
(
  'low_reach_rate',
  'Erreichbarkeit zu niedrig',
  'Weniger als die Hälfte der Bewerber wird am Telefon erreicht.',
  ARRAY['Falsche Anrufzeiten', 'Bewerber haben Tagschicht', 'Nummer falsch/unvollständig', 'Zu wenige Anrufversuche'],
  ARRAY['Anrufzeiten anpassen (morgens 9-11, nachmittags 15-17)', 'Doppelanruf-Strategie (2x täglich)', 'WhatsApp-Nachricht als Alternative senden', 'Nummern auf Vollständigkeit prüfen'],
  ARRAY['Funnel-Formular um "Beste Erreichbarkeit" erweitern', 'SMS-Benachrichtigung bei Bewerbungseingang', 'Automatische Kalender-Buchung im Funnel'],
  'Wenn nach 1 Woche keine Verbesserung → Felix informieren'
),
(
  'low_termin_rate',
  'Wenig Termine',
  'Zu wenige Anrufe führen zu einem Vorstellungsgespräch.',
  ARRAY['Skript nicht überzeugend genug', 'Bewerber nicht vorqualifiziert', 'Fehlende Einwandbehandlung', 'Tonalität zu aggressiv/passiv'],
  ARRAY['Skript-Opening überarbeiten (Nutzen in ersten 10 Sekunden)', 'Einwandbehandlung üben (Kein Interesse, Keine Zeit, Muss überlegen)', 'Fragen stellen statt pitchen', 'Termin als Low-Commitment framen'],
  ARRAY['Qualifikations-Fragen im Funnel verschärfen', 'Video-Bewerbung als Vorfilter', 'Automatic Scheduling im Funnel einbauen'],
  'Wenn Quote unter 10% nach 2 Wochen → Skript-Review mit Felix'
),
(
  'high_cpl',
  'CPL zu hoch',
  'Die Kosten pro Bewerber über Meta Ads übersteigen das Ziel.',
  ARRAY['Zielgruppe zu breit', 'Creative-Ermüdung (gleiche Ads zu lange)', 'Schlechte Landingpage-Conversion', 'Falsches Placement'],
  ARRAY['Zielgruppe einengen (Alter, Region, Interessen)', 'Mindestens 3 Creative-Varianten aktiv halten', 'Funnel-Ladezeit und Conversion prüfen', 'Placement auf Feed+Stories beschränken'],
  ARRAY['Lookalike-Audience aus bisherigen Bewerbern erstellen', 'Retargeting-Kampagne parallel schalten', 'A/B-Testing Routine einführen (wöchentlich neue Variante)'],
  'CPL > €60 für mehr als 5 Tage → Budget pausieren und Review'
),
(
  'low_candidates',
  'Wenig Bewerber',
  'Weniger als 5 Bewerber pro Woche eingegangen.',
  ARRAY['Budget zu niedrig', 'Saisonale Schwankung', 'Kampagne läuft nicht (Fehler)', 'Funnel-Conversion-Problem'],
  ARRAY['Budget prüfen (Minimum €30/Tag empfohlen)', 'Kampagne auf Fehler checken (abgelehnte Ads, Billing)', 'Indeed-Anzeige parallel schalten falls nicht aktiv', 'Funnel-Conversion-Rate prüfen (< 10% = Problem)'],
  ARRAY['Zweiten Kanal aufbauen (Indeed + Meta parallel)', 'Mitarbeiter-Empfehlungsprogramm vorschlagen', 'Content-Marketing (organische Reichweite)'],
  '0 Bewerber in 3+ Tagen → Sofort-Check'
),
(
  'no_calls_24h',
  'Kunde ruft nicht an',
  'Es sind offene Bewerber da, aber der Kunde hat seit 24h niemanden angerufen.',
  ARRAY['Kunde vergisst/priorisiert nicht', 'Unsicherheit am Telefon', 'Kein Zugang zur Cloud', 'Überforderung bei vielen Bewerbern'],
  ARRAY['Erinnerung an Kunden senden (Email/WhatsApp)', 'Masterclass-Video "Bewerber richtig callen" empfehlen', 'Anbieten: Erste Anrufe gemeinsam machen', 'Bewerber nach Priorität sortieren (neueste zuerst)'],
  ARRAY['Automatische tägliche Email-Erinnerung bei offenen Bewerbern', 'Gamification (Anruf-Streak)', 'Vereinfachtes Call-Interface in der Cloud'],
  '48h ohne Anruf → Persönliches Telefonat mit Kunden'
),
(
  'pipeline_stall',
  'Pipeline-Stau',
  'Bewerber sitzen länger als 5 Tage in einer Pipeline-Phase ohne Fortschritt.',
  ARRAY['Kunde hat Bewerber vergessen', 'Terminverschiebung ohne Update', 'Entscheidungsprobleme', 'Bewerber ghostet'],
  ARRAY['Kunden kontaktieren und Status abfragen', 'Bewerber direkt anrufen falls Kontaktdaten da', 'Status aktualisieren (ggf. auf Absage)', 'Follow-Up-Termin setzen'],
  ARRAY['Automatische Erinnerung an Kunden bei stagnierendem Bewerber', 'Maximale Phase-Dauer als Regel kommunizieren', 'Wöchentlichen Pipeline-Review einführen'],
  '> 10 Tage in Phase → Bewerber als verloren markieren'
),
(
  'low_satisfaction',
  'Niedrige Zufriedenheit',
  'Der Kunde hat im letzten Feedback weniger als 3 Sterne gegeben.',
  ARRAY['Unerfüllte Erwartungen', 'Kommunikationsprobleme', 'Qualität der Bewerber', 'Langsame Reaktionszeiten unsererseits'],
  ARRAY['Sofort Kunden-Call (nicht Email)', 'Offenes Feedback einholen (Was konkret stört)', 'Konkreten Verbesserungsplan aufsetzen', 'Felix informieren'],
  ARRAY['Proaktivere Kommunikation (wöchentliche Updates)', 'Erwartungsmanagement verbessern (Onboarding)', 'Dedizierte Ansprechpartner-Struktur'],
  'Unter 2 Sterne oder 2x unter 3 → Felix übernimmt Kundenkontakt'
),
(
  'indeed_no_candidates',
  'Indeed performt nicht',
  'Keine Bewerber über Indeed in den letzten 2 Tagen.',
  ARRAY['Stellenanzeige nicht sichtbar (SEO-Titel)', 'Gehalt/Benefits nicht prominent genug', 'Falscher Standort', 'Anzeige nicht aktiv/gesponsort'],
  ARRAY['Stellentitel SEO-optimieren (häufig gesuchte Begriffe)', 'Gehalt und Top-3-Benefits in die ersten 2 Zeilen', 'Standort prüfen (PLZ vs. Stadt)', 'Sponsored Job aktivieren falls Budget da'],
  ARRAY['A/B-Test mit verschiedenen Titeln', 'Indeed-Unternehmensprofil mit Fotos/Videos aufwerten', 'Google for Jobs Optimierung (strukturierte Daten)'],
  '5+ Tage ohne Indeed-Bewerber → Kanal-Wechsel evaluieren'
);

ALTER TABLE playbook_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can read playbook" ON playbook_entries FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Admin can manage playbook" ON playbook_entries FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

-- 5. Survey Schedule
CREATE TABLE survey_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  trigger_key TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES survey_templates(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  response_id UUID REFERENCES survey_responses(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_survey_schedule_pending ON survey_schedule(agency_id) WHERE completed_at IS NULL;

ALTER TABLE survey_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can manage survey_schedule" ON survey_schedule FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Agency can read own survey_schedule" ON survey_schedule FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));

-- 6. Additional survey templates
INSERT INTO survey_templates (title, description, questions, active) VALUES
(
  'Onboarding-Feedback',
  'Wie war dein Onboarding-Erlebnis?',
  '[{"id":"onboarding_ease","type":"rating","label":"Wie einfach war der Onboarding-Prozess?"},{"id":"questions_answered","type":"rating","label":"Wie gut wurden deine Fragen beantwortet?"},{"id":"communication","type":"rating","label":"Wie zufrieden bist du mit der bisherigen Kommunikation?"}]'::jsonb,
  true
),
(
  'Erste Eindrücke',
  'Dein Feedback nach den ersten 2 Wochen.',
  '[{"id":"candidate_quality","type":"rating","label":"Wie zufrieden bist du mit der Bewerber-Qualität?"},{"id":"cloud_usability","type":"rating","label":"Wie gut funktioniert das Bewerber-Management in der Cloud?"},{"id":"collaboration","type":"rating","label":"Wie bewertest du die bisherige Zusammenarbeit?"},{"id":"recommend","type":"rating","label":"Würdest du uns weiterempfehlen?"}]'::jsonb,
  true
),
(
  'Gesamtbewertung',
  'Quartalsmäßige Gesamtbewertung der Zusammenarbeit.',
  '[{"id":"overall","type":"rating","label":"Gesamtzufriedenheit"},{"id":"communication","type":"rating","label":"Kommunikation"},{"id":"campaign_quality","type":"rating","label":"Qualität der Kampagnen"},{"id":"candidate_quality","type":"rating","label":"Qualität der Bewerber"},{"id":"value_for_money","type":"rating","label":"Preis-Leistung"},{"id":"recommend","type":"rating","label":"Weiterempfehlung"}]'::jsonb,
  true
);

-- 7. invite_tokens: add email_sent_at
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
```

- [ ] **Step 2: Update TypeScript types in `src/lib/types/database.ts`**

Add after the existing types:

```typescript
// Phase 2: KPI System

export type KpiDirection = 'lower_is_better' | 'higher_is_better';

export interface KpiDefault {
  id: string;
  kpi_key: string;
  label: string;
  default_value: number;
  unit: string;
  direction: KpiDirection;
  created_at: string;
  updated_at: string;
}

export interface AgencyKpiOverride {
  id: string;
  agency_id: string;
  kpi_key: string;
  value: number;
  set_by: string | null;
  created_at: string;
}

export type ProblemSeverity = 'warning' | 'critical';

export interface AgencyProblem {
  id: string;
  agency_id: string;
  problem_key: string;
  severity: ProblemSeverity;
  current_value: number | null;
  target_value: number | null;
  details: Record<string, unknown>;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface PlaybookEntry {
  id: string;
  problem_key: string;
  title: string;
  description: string;
  causes: string[];
  immediate_actions: string[];
  long_term_actions: string[];
  escalation_trigger: string | null;
  created_at: string;
  updated_at: string;
}

export interface SurveyScheduleItem {
  id: string;
  agency_id: string;
  trigger_key: string;
  template_id: string;
  scheduled_at: string;
  sent_at: string | null;
  completed_at: string | null;
  response_id: string | null;
  created_at: string;
}
```

- [ ] **Step 3: Apply migration**

```bash
cd ~/zoepp-media-cloud && npx supabase db push --linked
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260811000003_kpi_playbook_surveys.sql src/lib/types/database.ts
git commit -m "feat: add KPI, playbook, survey schedule tables with seeds"
```

---

### Task 2: KPI API Routes + Settings UI

**Files:**
- Create: `src/app/api/kpi/defaults/route.ts`
- Create: `src/app/api/kpi/defaults/[key]/route.ts`
- Create: `src/app/api/kpi/agency/[agencyId]/route.ts`
- Create: `src/app/api/kpi/agency/[agencyId]/[key]/route.ts`
- Create: `src/app/(internal)/admin/kpi/page.tsx`

**Interfaces:**
- Consumes: `kpi_defaults`, `agency_kpi_overrides` tables, `KpiDefault`, `AgencyKpiOverride` types
- Produces: `GET /api/kpi/defaults` → `KpiDefault[]`, `GET /api/kpi/agency/[id]` → `{ key: string, label: string, value: number, unit: string, direction: string, isOverride: boolean }[]`

- [ ] **Step 1: Create `src/app/api/kpi/defaults/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();
  const { data, error } = await supabase.from('kpi_defaults').select('*').order('kpi_key');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Create `src/app/api/kpi/defaults/[key]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { value } = await request.json();
  if (typeof value !== 'number') return NextResponse.json({ error: 'Value must be a number' }, { status: 400 });

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('kpi_defaults')
    .update({ default_value: value, updated_at: new Date().toISOString() })
    .eq('kpi_key', key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 3: Create `src/app/api/kpi/agency/[agencyId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ agencyId: string }> }) {
  const { agencyId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Agency users can see their own KPIs, internal can see all
  if (!isInternal(user.role) && user.agency_id !== agencyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createServerClient();
  const [{ data: defaults }, { data: overrides }] = await Promise.all([
    supabase.from('kpi_defaults').select('*').order('kpi_key'),
    supabase.from('agency_kpi_overrides').select('*').eq('agency_id', agencyId),
  ]);

  const overrideMap = new Map((overrides || []).map(o => [o.kpi_key, o.value]));

  const effective = (defaults || []).map(d => ({
    key: d.kpi_key,
    label: d.label,
    value: overrideMap.has(d.kpi_key) ? overrideMap.get(d.kpi_key)! : d.default_value,
    unit: d.unit,
    direction: d.direction,
    isOverride: overrideMap.has(d.kpi_key),
    defaultValue: d.default_value,
  }));

  return NextResponse.json(effective);
}
```

- [ ] **Step 4: Create `src/app/api/kpi/agency/[agencyId]/[key]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ agencyId: string; key: string }> }) {
  const { agencyId, key } = await params;
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { value } = await request.json();
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('agency_kpi_overrides')
    .upsert({ agency_id: agencyId, kpi_key: key, value, set_by: user.id }, { onConflict: 'agency_id,kpi_key' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ agencyId: string; key: string }> }) {
  const { agencyId, key } = await params;
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();
  await supabase.from('agency_kpi_overrides').delete().eq('agency_id', agencyId).eq('kpi_key', key);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Create Admin KPI Settings page `src/app/(internal)/admin/kpi/page.tsx`**

Client component: fetches `/api/kpi/defaults`, renders a table with inline-edit for each KPI's default_value. On edit, PATCHes `/api/kpi/defaults/[key]`. Uses `Card`, `Input`, `Button`, `PageHeader` from `@/components/ui`.

- [ ] **Step 6: Add sidebar link for KPI Settings**

In `src/components/app-sidebar.tsx`, add link `{ label: 'KPI Einstellungen', href: '/admin/kpi', icon: Target }` to the admin navigation group.

- [ ] **Step 7: Test and commit**

```bash
npx tsc --noEmit
git add src/app/api/kpi/ src/app/\(internal\)/admin/kpi/ src/components/app-sidebar.tsx
git commit -m "feat: KPI API routes + admin settings page"
```

---

### Task 3: Problem Detection Engine

**Files:**
- Create: `src/lib/problems/detect.ts`
- Create: `src/app/api/problems/detect/route.ts`
- Create: `src/app/api/problems/route.ts`
- Create: `src/app/api/problems/[id]/route.ts`

**Interfaces:**
- Consumes: `kpi_defaults`, `agency_kpi_overrides`, `call_logs`, `candidates`, `candidate_stages`, `meta_ad_reports`, `survey_responses` tables
- Produces: `detectProblems(agencyId, supabase): Promise<{ detected: number, resolved: number }>`, `POST /api/problems/detect` (runs for all agencies), `GET /api/problems?agency_id=X` → `AgencyProblem[]`, `PATCH /api/problems/[id]` (resolve)

- [ ] **Step 1: Create `src/lib/problems/detect.ts`**

```typescript
import { SupabaseClient } from '@supabase/supabase-js';

interface EffectiveKpi {
  key: string;
  value: number;
  direction: string;
}

interface ProblemCheck {
  key: string;
  severity: 'warning' | 'critical';
  check: (supabase: SupabaseClient, agencyId: string, target: number) => Promise<{ triggered: boolean; currentValue: number }>;
}

async function getEffectiveKpis(supabase: SupabaseClient, agencyId: string): Promise<Map<string, EffectiveKpi>> {
  const [{ data: defaults }, { data: overrides }] = await Promise.all([
    supabase.from('kpi_defaults').select('*'),
    supabase.from('agency_kpi_overrides').select('*').eq('agency_id', agencyId),
  ]);

  const overrideMap = new Map((overrides || []).map(o => [o.kpi_key, o.value]));
  const result = new Map<string, EffectiveKpi>();

  for (const d of defaults || []) {
    result.set(d.kpi_key, {
      key: d.kpi_key,
      value: overrideMap.has(d.kpi_key) ? overrideMap.get(d.kpi_key)! : d.default_value,
      direction: d.direction,
    });
  }
  return result;
}

const sevenDaysAgo = () => new Date(Date.now() - 7 * 86400000).toISOString();
const twoDaysAgo = () => new Date(Date.now() - 2 * 86400000).toISOString();
const oneDayAgo = () => new Date(Date.now() - 86400000).toISOString();

const problemChecks: ProblemCheck[] = [
  {
    key: 'low_reach_rate',
    severity: 'warning',
    check: async (supabase, agencyId, target) => {
      const { data: calls } = await supabase
        .from('call_logs').select('result').eq('agency_id', agencyId).gte('created_at', sevenDaysAgo());
      if (!calls || calls.length < 5) return { triggered: false, currentValue: 0 };
      const reached = calls.filter(c => c.result !== 'nicht_erreicht').length;
      const rate = Math.round((reached / calls.length) * 100);
      return { triggered: rate < target, currentValue: rate };
    },
  },
  {
    key: 'low_termin_rate',
    severity: 'warning',
    check: async (supabase, agencyId, target) => {
      const { data: calls } = await supabase
        .from('call_logs').select('result').eq('agency_id', agencyId).gte('created_at', sevenDaysAgo());
      if (!calls || calls.length < 5) return { triggered: false, currentValue: 0 };
      const termine = calls.filter(c => c.result === 'termin_vereinbart').length;
      const rate = Math.round((termine / calls.length) * 100);
      return { triggered: rate < target, currentValue: rate };
    },
  },
  {
    key: 'high_cpl',
    severity: 'critical',
    check: async (supabase, agencyId, target) => {
      const { data: reports } = await supabase
        .from('meta_ad_reports').select('cpl').eq('agency_id', agencyId).gte('report_date', sevenDaysAgo().split('T')[0]).not('cpl', 'is', null);
      if (!reports || reports.length === 0) return { triggered: false, currentValue: 0 };
      const avgCpl = reports.reduce((s, r) => s + r.cpl, 0) / reports.length;
      return { triggered: avgCpl > target, currentValue: Math.round(avgCpl * 100) / 100 };
    },
  },
  {
    key: 'low_candidates',
    severity: 'warning',
    check: async (supabase, agencyId, target) => {
      const weekAgo = sevenDaysAgo();
      const { count } = await supabase
        .from('candidates').select('*', { count: 'exact', head: true }).eq('agency_id', agencyId).gte('created_at', weekAgo);
      return { triggered: (count || 0) < target, currentValue: count || 0 };
    },
  },
  {
    key: 'no_calls_24h',
    severity: 'critical',
    check: async (supabase, agencyId) => {
      // Check if there are open candidates (not in final stages) but no calls in 24h
      const { count: openCandidates } = await supabase
        .from('candidates').select('*', { count: 'exact', head: true }).eq('agency_id', agencyId);
      if (!openCandidates || openCandidates === 0) return { triggered: false, currentValue: 0 };

      const { count: recentCalls } = await supabase
        .from('call_logs').select('*', { count: 'exact', head: true }).eq('agency_id', agencyId).gte('created_at', oneDayAgo());
      return { triggered: (recentCalls || 0) === 0, currentValue: recentCalls || 0 };
    },
  },
  {
    key: 'pipeline_stall',
    severity: 'warning',
    check: async (supabase, agencyId, target) => {
      // Find candidates whose last stage change is > target days ago
      const cutoff = new Date(Date.now() - target * 86400000).toISOString();
      const { data: stalled } = await supabase
        .from('candidate_stages').select('candidate_id, changed_at, candidates!inner(agency_id)')
        .eq('candidates.agency_id', agencyId).lt('changed_at', cutoff);
      const stalledCount = new Set((stalled || []).map(s => s.candidate_id)).size;
      return { triggered: stalledCount > 0, currentValue: stalledCount };
    },
  },
  {
    key: 'low_satisfaction',
    severity: 'critical',
    check: async (supabase, agencyId, target) => {
      const { data: responses } = await supabase
        .from('survey_responses').select('rating').eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(1);
      if (!responses || responses.length === 0) return { triggered: false, currentValue: 0 };
      return { triggered: responses[0].rating < target, currentValue: responses[0].rating };
    },
  },
  {
    key: 'indeed_no_candidates',
    severity: 'warning',
    check: async (supabase, agencyId) => {
      const { count } = await supabase
        .from('candidates').select('*', { count: 'exact', head: true }).eq('agency_id', agencyId).eq('source', 'indeed').gte('created_at', twoDaysAgo());
      return { triggered: (count || 0) === 0, currentValue: count || 0 };
    },
  },
];

export async function detectProblemsForAgency(
  supabase: SupabaseClient,
  agencyId: string
): Promise<{ detected: number; resolved: number }> {
  const kpis = await getEffectiveKpis(supabase, agencyId);
  let detected = 0;
  let resolved = 0;

  for (const check of problemChecks) {
    const kpi = kpis.get(check.key === 'no_calls_24h' ? 'max_response_hours' : check.key === 'indeed_no_candidates' ? 'min_indeed_per_2days' : check.key === 'pipeline_stall' ? 'max_phase_days' : check.key);
    const target = kpi?.value ?? 0;
    const result = await check.check(supabase, agencyId, target);

    // Check existing open problem
    const { data: existing } = await supabase
      .from('agency_problems')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('problem_key', check.key)
      .is('resolved_at', null)
      .limit(1);

    if (result.triggered && (!existing || existing.length === 0)) {
      await supabase.from('agency_problems').insert({
        agency_id: agencyId,
        problem_key: check.key,
        severity: check.severity,
        current_value: result.currentValue,
        target_value: target,
      });
      detected++;
    } else if (!result.triggered && existing && existing.length > 0) {
      await supabase.from('agency_problems')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', existing[0].id);
      resolved++;
    } else if (result.triggered && existing && existing.length > 0) {
      // Update current value
      await supabase.from('agency_problems')
        .update({ current_value: result.currentValue })
        .eq('id', existing[0].id);
    }
  }

  return { detected, resolved };
}
```

- [ ] **Step 2: Create `src/app/api/problems/detect/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { detectProblemsForAgency } from '@/lib/problems/detect';

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data: agencies } = await supabase.from('agencies').select('id');

  let totalDetected = 0;
  let totalResolved = 0;

  for (const agency of agencies || []) {
    const { detected, resolved } = await detectProblemsForAgency(supabase, agency.id);
    totalDetected += detected;
    totalResolved += resolved;
  }

  return NextResponse.json({ detected: totalDetected, resolved: totalResolved, agencies: (agencies || []).length });
}
```

- [ ] **Step 3: Create `src/app/api/problems/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agencyId = request.nextUrl.searchParams.get('agency_id');
  const supabase = await createServerClient();

  let query = supabase.from('agency_problems').select('*').is('resolved_at', null).order('detected_at', { ascending: false });
  if (agencyId) query = query.eq('agency_id', agencyId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 4: Create `src/app/api/problems/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('agency_problems')
    .update({ resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 5: Test and commit**

```bash
npx tsc --noEmit
git add src/lib/problems/ src/app/api/problems/
git commit -m "feat: problem detection engine — 8 checks with auto-detect and resolve"
```

---

### Task 4: Playbook API + Page

**Files:**
- Create: `src/app/api/playbook/route.ts`
- Create: `src/app/api/playbook/[key]/route.ts`
- Create: `src/app/(internal)/playbook/page.tsx`

**Interfaces:**
- Consumes: `playbook_entries` table, `PlaybookEntry` type
- Produces: `GET /api/playbook` → `PlaybookEntry[]`, `GET /api/playbook/[key]` → `PlaybookEntry`, internal `/playbook` page

- [ ] **Step 1: Create `src/app/api/playbook/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();
  const { data, error } = await supabase.from('playbook_entries').select('*').order('problem_key');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Create `src/app/api/playbook/[key]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();
  const { data, error } = await supabase.from('playbook_entries').select('*').eq('problem_key', key).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await request.json();
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('playbook_entries')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('problem_key', key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 3: Create Playbook page `src/app/(internal)/playbook/page.tsx`**

Accordion-style page listing all 8 playbooks. Each entry expands to show: Beschreibung, Ursachen (bullet list), Sofort-Maßnahmen (numbered list), Langfristig (bullet list), Eskalation (highlighted box). Search bar at top. Uses `Card`, `PageHeader`, `Badge` from `@/components/ui`.

- [ ] **Step 4: Add sidebar link**

In `src/components/app-sidebar.tsx`, add `{ label: 'Playbook', href: '/playbook', icon: BookOpen }` to the employee and admin navigation groups.

- [ ] **Step 5: Test and commit**

```bash
npx tsc --noEmit
git add src/app/api/playbook/ src/app/\(internal\)/playbook/ src/components/app-sidebar.tsx
git commit -m "feat: playbook database — 8 entries with API and accordion page"
```

---

### Task 5: Email System (Resend)

**Files:**
- Create: `src/lib/email/resend.ts`
- Create: `src/lib/email/templates.ts`
- Modify: `src/app/api/admin/agencies/route.ts`
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `src/app/(internal)/invites/page.tsx`

**Interfaces:**
- Consumes: `RESEND_API_KEY` env var, `invite_tokens.email_sent_at` column
- Produces: `sendInviteEmail()`, `sendWelcomeEmail()`, `sendOnboardingReminder()`, `sendSurveyNotification()` functions

- [ ] **Step 1: Install Resend**

```bash
cd ~/zoepp-media-cloud && npm install resend
```

- [ ] **Step 2: Create `src/lib/email/templates.ts`**

```typescript
export function inviteTemplate(agencyName: string, registerUrl: string, expiresAt: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="padding:32px 40px 24px;text-align:center;">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111;">Zoepp Media Cloud</h2>
      <p style="margin:0;font-size:13px;color:#888;">Bewerber-Management für D2D-Agenturen</p>
    </div>
    <div style="padding:0 40px 32px;">
      <h1 style="font-size:22px;font-weight:700;color:#111;margin:0 0 12px;">Du wurdest eingeladen!</h1>
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 24px;">
        <strong>${agencyName}</strong> wurde für Zoepp Media Cloud freigeschaltet. Erstelle jetzt deinen Account und starte mit dem Bewerber-Management.
      </p>
      <a href="${registerUrl}" style="display:inline-block;padding:14px 32px;background:#E0354B;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;">
        Account erstellen
      </a>
      <p style="font-size:13px;color:#999;margin:24px 0 0;">
        Dieser Link ist gültig bis ${expiresAt}. Falls er abgelaufen ist, bitte deinen Ansprechpartner um einen neuen.
      </p>
    </div>
  </div>
</body></html>`;
}

export function welcomeTemplate(name: string, loginUrl: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="padding:32px 40px 24px;text-align:center;">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111;">Zoepp Media Cloud</h2>
    </div>
    <div style="padding:0 40px 32px;">
      <h1 style="font-size:22px;font-weight:700;color:#111;margin:0 0 12px;">Willkommen, ${name}!</h1>
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px;">
        Dein Account ist eingerichtet. Deine nächsten Schritte:
      </p>
      <ol style="font-size:15px;color:#444;line-height:1.8;margin:0 0 24px;padding-left:20px;">
        <li>Onboarding-Formular ausfüllen</li>
        <li>Masterclass-Videos anschauen</li>
        <li>Meta-Zugang einrichten</li>
      </ol>
      <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;background:#E0354B;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;">
        Zum Dashboard
      </a>
    </div>
  </div>
</body></html>`;
}

export function onboardingReminderTemplate(name: string, onboardingUrl: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="padding:32px 40px 24px;text-align:center;">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111;">Zoepp Media Cloud</h2>
    </div>
    <div style="padding:0 40px 32px;">
      <h1 style="font-size:22px;font-weight:700;color:#111;margin:0 0 12px;">Onboarding nicht vergessen!</h1>
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 24px;">
        Hallo ${name}, dein Onboarding ist noch nicht abgeschlossen. Fülle es jetzt aus, damit wir mit deiner Kampagne starten können.
      </p>
      <a href="${onboardingUrl}" style="display:inline-block;padding:14px 32px;background:#E0354B;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;">
        Onboarding fortsetzen
      </a>
    </div>
  </div>
</body></html>`;
}

export function surveyNotificationTemplate(name: string, surveyTitle: string, portalUrl: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="padding:32px 40px 24px;text-align:center;">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111;">Zoepp Media Cloud</h2>
    </div>
    <div style="padding:0 40px 32px;">
      <h1 style="font-size:22px;font-weight:700;color:#111;margin:0 0 12px;">Wir brauchen dein Feedback!</h1>
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 24px;">
        Hallo ${name}, es gibt einen neuen Feedback-Check: <strong>${surveyTitle}</strong>. Deine Meinung hilft uns, unsere Zusammenarbeit zu verbessern.
      </p>
      <a href="${portalUrl}" style="display:inline-block;padding:14px 32px;background:#E0354B;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;">
        Feedback geben
      </a>
    </div>
  </div>
</body></html>`;
}
```

- [ ] **Step 3: Create `src/lib/email/resend.ts`**

```typescript
import { Resend } from 'resend';
import { inviteTemplate, welcomeTemplate, onboardingReminderTemplate, surveyNotificationTemplate } from './templates';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Zoepp Media Cloud <noreply@zoeppmedia.de>';

export async function sendInviteEmail(to: string, agencyName: string, registerUrl: string, expiresAt: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: `Einladung: ${agencyName} — Zoepp Media Cloud`,
    html: inviteTemplate(agencyName, registerUrl, expiresAt),
  });
}

export async function sendWelcomeEmail(to: string, name: string, loginUrl: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Willkommen bei Zoepp Media Cloud!',
    html: welcomeTemplate(name, loginUrl),
  });
}

export async function sendOnboardingReminder(to: string, name: string, onboardingUrl: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: 'Erinnerung: Onboarding abschließen',
    html: onboardingReminderTemplate(name, onboardingUrl),
  });
}

export async function sendSurveyNotification(to: string, name: string, surveyTitle: string, portalUrl: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: `Feedback-Check: ${surveyTitle}`,
    html: surveyNotificationTemplate(name, surveyTitle, portalUrl),
  });
}
```

- [ ] **Step 4: Wire invite email into `src/app/api/admin/agencies/route.ts`**

After the `invite_tokens` insert succeeds, add:

```typescript
import { sendInviteEmail } from '@/lib/email/resend';

// ... after invite_url is constructed:
try {
  await sendInviteEmail(email, name, invite_url, new Date(Date.now() + 7 * 86400000).toLocaleDateString('de-DE'));
  await supabase.from('invite_tokens').update({ email_sent_at: new Date().toISOString() }).eq('id', invite.id);
} catch {
  // Email failed but invite was created — log but don't fail
}
```

- [ ] **Step 5: Wire welcome email into `src/app/api/auth/register/route.ts`**

After successful user creation and token redemption:

```typescript
import { sendWelcomeEmail } from '@/lib/email/resend';

// ... after marking token as redeemed:
const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL}/login`;
try {
  await sendWelcomeEmail(email, name, loginUrl);
} catch {
  // Email failed but registration succeeded
}
```

- [ ] **Step 6: Update invites page to show email status**

In `src/app/(internal)/invites/page.tsx`, show "Email gesendet" badge next to the invite URL when `email_sent_at` is set. Add a "Erneut senden" button that calls `POST /api/admin/invite` and triggers a new email.

- [ ] **Step 7: Test and commit**

```bash
npx tsc --noEmit
git add src/lib/email/ src/app/api/admin/agencies/route.ts src/app/api/auth/register/route.ts src/app/\(internal\)/invites/page.tsx package.json package-lock.json
git commit -m "feat: Resend email integration — invite, welcome, onboarding reminder, survey notification"
```

---

### Task 6: Survey Milestones + Scheduling

**Files:**
- Create: `src/app/api/surveys/check-milestones/route.ts`
- Create: `src/app/api/surveys/schedule/route.ts`
- Create: `src/app/api/surveys/analytics/route.ts`
- Modify: `src/app/(portal)/dashboard/page.tsx` (or its view component)

**Interfaces:**
- Consumes: `survey_schedule`, `survey_templates`, `survey_responses`, `customer_tasks`, `agencies` tables, `sendSurveyNotification()` from email
- Produces: `POST /api/surveys/check-milestones` (runs milestone checks), `GET /api/surveys/schedule?agency_id=X`, `GET /api/surveys/analytics` → aggregated survey data

- [ ] **Step 1: Create `src/app/api/surveys/check-milestones/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { sendSurveyNotification } from '@/lib/email/resend';

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  // Get all agencies with their users
  const { data: agencies } = await supabase.from('agencies').select('id, name, onboarding_completed, created_at');
  const { data: templates } = await supabase.from('survey_templates').select('id, title').eq('active', true);

  if (!agencies || !templates) return NextResponse.json({ error: 'No data' }, { status: 500 });

  const templateMap = new Map(templates.map(t => [t.title, t.id]));
  let scheduled = 0;

  for (const agency of agencies) {
    // Check existing schedules to avoid duplicates
    const { data: existing } = await supabase
      .from('survey_schedule')
      .select('trigger_key')
      .eq('agency_id', agency.id);
    const existingKeys = new Set((existing || []).map(e => e.trigger_key));

    // Milestone 1: Post-onboarding
    if (agency.onboarding_completed && !existingKeys.has('post_onboarding')) {
      const templateId = templateMap.get('Onboarding-Feedback');
      if (templateId) {
        await supabase.from('survey_schedule').insert({
          agency_id: agency.id,
          trigger_key: 'post_onboarding',
          template_id: templateId,
          scheduled_at: new Date().toISOString(),
        });

        // Send email to agency owner
        const { data: owner } = await supabase.from('users').select('email, name').eq('agency_id', agency.id).eq('role', 'agency_owner').limit(1).single();
        if (owner) {
          try {
            await sendSurveyNotification(owner.email, owner.name, 'Onboarding-Feedback', `${appUrl}/reports`);
            await supabase.from('survey_schedule').update({ sent_at: new Date().toISOString() })
              .eq('agency_id', agency.id).eq('trigger_key', 'post_onboarding');
          } catch { /* email failed */ }
        }
        scheduled++;
      }
    }

    // Milestone 2: Campaign 2 weeks (check if SOP phase 5 task 7 "Kampagne starten" is done > 14 days)
    const { data: campaignTask } = await supabase
      .from('customer_tasks')
      .select('completed_at')
      .eq('agency_id', agency.id)
      .eq('status', 'done')
      .not('completed_at', 'is', null)
      .limit(1);

    // Simplified: if onboarding > 14 days and not yet scheduled
    const agencyAge = Date.now() - new Date(agency.created_at).getTime();
    if (agencyAge > 14 * 86400000 && !existingKeys.has('campaign_2_weeks')) {
      const templateId = templateMap.get('Erste Eindrücke');
      if (templateId) {
        await supabase.from('survey_schedule').insert({
          agency_id: agency.id,
          trigger_key: 'campaign_2_weeks',
          template_id: templateId,
          scheduled_at: new Date().toISOString(),
        });
        scheduled++;
      }
    }

    // Milestone 3: Monthly (> 30 days active, not scheduled this month)
    const monthKey = `monthly_${new Date().toISOString().slice(0, 7)}`;
    if (agencyAge > 30 * 86400000 && !existingKeys.has(monthKey)) {
      const templateId = templateMap.get('Kundenzufriedenheit');
      if (templateId) {
        await supabase.from('survey_schedule').insert({
          agency_id: agency.id,
          trigger_key: monthKey,
          template_id: templateId,
          scheduled_at: new Date().toISOString(),
        });
        scheduled++;
      }
    }

    // Milestone 4: Quarterly (> 90 days, not scheduled this quarter)
    const quarter = Math.floor(new Date().getMonth() / 3);
    const quarterKey = `quarterly_${new Date().getFullYear()}_Q${quarter + 1}`;
    if (agencyAge > 90 * 86400000 && !existingKeys.has(quarterKey)) {
      const templateId = templateMap.get('Gesamtbewertung');
      if (templateId) {
        await supabase.from('survey_schedule').insert({
          agency_id: agency.id,
          trigger_key: quarterKey,
          template_id: templateId,
          scheduled_at: new Date().toISOString(),
        });
        scheduled++;
      }
    }
  }

  return NextResponse.json({ scheduled });
}
```

- [ ] **Step 2: Create `src/app/api/surveys/schedule/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agencyId = request.nextUrl.searchParams.get('agency_id') || user.agency_id;
  if (!agencyId) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('survey_schedule')
    .select('*, survey_templates:template_id(title, description, questions)')
    .eq('agency_id', agencyId)
    .order('scheduled_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 3: Create `src/app/api/surveys/analytics/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: responses } = await supabase
    .from('survey_responses')
    .select('agency_id, rating, created_at, agencies:agency_id(name)')
    .order('created_at', { ascending: false });

  if (!responses) return NextResponse.json({ avgRating: 0, total: 0, belowThreshold: [], trend: [] });

  const total = responses.length;
  const avgRating = total > 0 ? Math.round((responses.reduce((s, r) => s + (r.rating || 0), 0) / total) * 10) / 10 : 0;

  // Agencies with avg < 3
  const byAgency = new Map<string, { ratings: number[]; name: string }>();
  for (const r of responses) {
    const name = (r.agencies as { name: string } | null)?.name || 'Unbekannt';
    if (!byAgency.has(r.agency_id)) byAgency.set(r.agency_id, { ratings: [], name });
    byAgency.get(r.agency_id)!.ratings.push(r.rating || 0);
  }

  const belowThreshold = Array.from(byAgency.entries())
    .map(([id, { ratings, name }]) => ({
      agency_id: id,
      name,
      avgRating: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10,
    }))
    .filter(a => a.avgRating < 3);

  // Monthly trend (last 6 months)
  const trend: { month: string; avg: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthStr = d.toISOString().slice(0, 7);
    const monthResponses = responses.filter(r => r.created_at.startsWith(monthStr));
    const avg = monthResponses.length > 0 ? Math.round((monthResponses.reduce((s, r) => s + (r.rating || 0), 0) / monthResponses.length) * 10) / 10 : 0;
    trend.push({ month: monthStr, avg });
  }

  return NextResponse.json({ avgRating, total, belowThreshold, trend });
}
```

- [ ] **Step 4: Add pending survey banner to client dashboard**

In the portal dashboard view component, fetch `/api/surveys/schedule?agency_id=X` and if any items have `completed_at === null`, show a yellow banner: "Du hast einen Feedback-Check offen" with a link to `/reports`.

- [ ] **Step 5: Test and commit**

```bash
npx tsc --noEmit
git add src/app/api/surveys/
git commit -m "feat: survey milestones — auto-scheduling, analytics, client dashboard banner"
```

---

### Task 7: Extended Admin Dashboard + Client Detail

**Files:**
- Modify: `src/lib/admin-dashboard.ts`
- Modify: `src/components/dashboard/admin-dashboard-view.tsx`
- Modify: `src/app/(internal)/clients/[id]/page.tsx`
- Modify: `src/app/api/admin/agencies/[id]/route.ts`

**Interfaces:**
- Consumes: `agency_problems`, `kpi_defaults`, `agency_kpi_overrides`, `survey_responses`, `playbook_entries` tables, all previous task APIs
- Produces: Extended `AdminDashboardData` with `agencyStatuses` (traffic light), problems tab in admin view, KPI Soll/Ist + problem alerts in client detail

- [ ] **Step 1: Extend `src/lib/admin-dashboard.ts`**

Add to `AdminDashboardData` interface:

```typescript
agencyStatuses: {
  id: string;
  name: string;
  status: 'green' | 'yellow' | 'red';
  problemCount: number;
  criticalCount: number;
  warningCount: number;
}[];
totalProblems: number;
```

Add to `getAdminDashboardData()`:

```typescript
// After existing queries, add:
const { data: allProblems } = await supabase
  .from('agency_problems')
  .select('agency_id, severity')
  .is('resolved_at', null);

const problemsByAgency = new Map<string, { critical: number; warning: number }>();
for (const p of allProblems || []) {
  if (!problemsByAgency.has(p.agency_id)) problemsByAgency.set(p.agency_id, { critical: 0, warning: 0 });
  const counts = problemsByAgency.get(p.agency_id)!;
  if (p.severity === 'critical') counts.critical++;
  else counts.warning++;
}

// Build agency statuses (merge with existing agencies data)
const agencyStatuses = (allAgencies || []).map(a => {
  const counts = problemsByAgency.get(a.id) || { critical: 0, warning: 0 };
  const total = counts.critical + counts.warning;
  return {
    id: a.id,
    name: a.name,
    status: counts.critical > 0 ? 'red' as const : counts.warning > 0 ? 'yellow' as const : 'green' as const,
    problemCount: total,
    criticalCount: counts.critical,
    warningCount: counts.warning,
  };
});
```

- [ ] **Step 2: Update admin dashboard view with traffic lights**

In `src/components/dashboard/admin-dashboard-view.tsx`, add an agency overview section below the KPI grid:

- Table with columns: Agentur | Status (colored dot) | Probleme | CPL | Bewerber/Woche | Zufriedenheit
- Color dots: green = `🟢`, yellow = `🟡`, red = `🔴` (or use colored `Badge` components)
- Click on agency name → links to `/clients/[id]`

- [ ] **Step 3: Extend client detail API**

In `src/app/api/admin/agencies/[id]/route.ts`, add to the response:

```typescript
// Add KPI data
const [{ data: kpiDefaults }, { data: kpiOverrides }, { data: problems }, { data: playbooks }] = await Promise.all([
  supabase.from('kpi_defaults').select('*'),
  supabase.from('agency_kpi_overrides').select('*').eq('agency_id', id),
  supabase.from('agency_problems').select('*').eq('agency_id', id).is('resolved_at', null),
  supabase.from('playbook_entries').select('*'),
]);
```

Return these as `kpis`, `problems`, `playbooks` in the response.

- [ ] **Step 4: Update client detail page**

In `src/app/(internal)/clients/[id]/page.tsx`, add:

1. **Problem Alert Box** at top of page (if problems exist):
   - Red/yellow banner per problem with "Playbook anzeigen" button
   - "Als gelöst markieren" button that PATCHes `/api/problems/[id]`

2. **KPI Soll/Ist section**:
   - Progress bars showing current vs target
   - Green bar if within target, red if not
   - Override button per KPI (opens inline input to set custom target)

3. **Playbook Modal** — when "Playbook anzeigen" is clicked, shows the full playbook entry in a Modal.

- [ ] **Step 5: Extend client-facing reports**

In `src/app/(portal)/reports/page.tsx`, add a KPI progress section that fetches `/api/kpi/agency/[agency_id]` and shows read-only Soll/Ist bars. No problem alerts, no playbook.

- [ ] **Step 6: Test and commit**

```bash
npx tsc --noEmit
git add src/lib/admin-dashboard.ts src/components/dashboard/admin-dashboard-view.tsx src/app/\(internal\)/clients/\[id\]/page.tsx src/app/api/admin/agencies/\[id\]/route.ts src/app/\(portal\)/reports/page.tsx
git commit -m "feat: admin dashboard traffic lights, client detail KPI/problems, playbook modals"
```

---

## Execution Order

- **Sequential:** Task 1 → Task 2 (migration before KPIs)
- **Sequential:** Task 2 → Task 3 (KPIs before problem detection)
- **Parallel group:** Task 4 + Task 5 (playbook + email are independent)
- **Sequential after all:** Task 6 (surveys use email from Task 5)
- **Last:** Task 7 (dashboard uses problems from Task 3, KPIs from Task 2, surveys from Task 6)

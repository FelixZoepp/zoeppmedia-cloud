# Phase 6: Dashboards, Verbrauch/Kosten, Alarme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kunden-Dashboard (Kennzahlen, Trichter, Quellenvergleich, Bot-Leistung, Jobtabelle + CSV-Export) und Agentur-Dashboard (Kundentabelle mit Ampel, WhatsApp-Zustand, Verbrauch/Kosten je Kunde/Monat, Alarme, Meta-Preistabelle) gemäß Spec §12 + §16 Phase 6.

**Architecture:** Ein reiner TS-Rechenkern (`src/lib/kpi/recruiting-kpis.ts`) berechnet alle Kennzahlen aus Rohzeilen — testbar ohne DB. Eine Fetch-Schicht (`src/lib/kpi/get-recruiting-stats.ts`) lädt die Rohdaten mit explizitem `agency_id`-Scoping. Verbrauch wird täglich per Cron in die neue Tabelle `usage_daily` aggregiert. Beide Dashboards sind Client-Komponenten, die je eine JSON-API abfragen.

**Tech Stack:** Next.js 16 App Router (params/searchParams als Promise), React 19, TS strict, Tailwind v4, Supabase (Admin-Client), Vitest, zod v4, recharts (bereits installiert).

**Spec:** `docs/superpowers/specs/2026-09-21-spec-recruiting-plattform.md` (§12 Dashboards und Reporting, §16 Phase 6, §11 Scheduler „täglich Aggregation in usage_daily", Datenmodell §5 `usage_daily`)

## Global Constraints

- Service-Role-Client umgeht RLS → **jede** Query auf mandantenbezogene Tabellen trägt explizit `.eq('agency_id', ...)`. Fehlt das Scoping: BLOCKER. Ausnahmen: PK-Lookups auf `agencies`; Iteration über alle Agenturen in Cron/Admin-Kontext (dort wird pro Agentur gescopet).
- Auth-Kette Portal-APIs exakt wie `src/app/api/lead-sources/route.ts`: `getCurrentUser()` → 401 `{ error: 'Nicht autorisiert' }`; bei Schreib-Routen danach `canWriteRole(user.role)` → 403; dann `getEffectiveAgencyId()` → 403 `{ error: 'Keine Agentur' }`. GET-Routen prüfen `canWriteRole` NICHT.
- Admin-APIs: `getCurrentUser()` → 401; `user.role !== 'admin'` → 403 `{ error: 'Nur für Platform-Admins' }`.
- Migrationen sind rein additiv (LIVE-DB mit 15 Agenturen). Kein DROP, kein ALTER bestehender Spalten. Der Orchestrator spielt die Migration ein — der Implementer schreibt nur die Datei.
- Bestehende Tests dürfen nicht gelöscht werden. Testzahl-Basis: **576** (47 Dateien). Jede Task nennt ihr Delta.
- Testlauf-Verifikation: `npx vitest run 2>&1 | grep -E "Test Files|Tests "`.
- Deutsche UI-Texte mit echten Umlauten. Button-Varianten nur `primary`/`secondary`/`soft`/`ghost`.
- Kennzahlen-Definitionen (Spec §12, verbindlich):
  - Antwortquote = Bewerbungen mit ≥1 eingehender Nachricht ÷ Bewerbungen mit gesendeter Eröffnung (≥1 ausgehende Nachricht)
  - Abschlussquote = Bewerbungen mit abgeschlossener Vorqualifizierung (`score_label` gesetzt) ÷ Bewerbungen mit Antwort
  - Qualifizierungsquote = Score A oder B ÷ abgeschlossene Vorqualifizierungen
  - Terminquote = Bewerbungen mit gebuchtem Termin ÷ qualifizierte Bewerber (A/B)
  - No-Show-Quote = No-Shows ÷ fällige Termine (Status `no_show` + `done`)
  - Zeit bis Erstkontakt = Median(erste ausgehende Nachricht − Bewerbungseingang)
  - Zeit bis Termin = Median(Terminbuchung − Bewerbungseingang)
- Quoten ohne Nenner (÷0) sind `null`, nie `NaN`.
- PostToolUse-Hook-SUGGESTIONs zu „observability instrumentation" ignorieren (Codebase-Muster hat keine Instrumentierung).

**Rulings (vom Orchestrator, gelten für alle Tasks):**
- **P6-R1:** Spec §12 verlangt SQL-/materialisierte Views mit stündlicher Aktualisierung. Bei 15 Agenturen laden direkte Queries + TS-Aggregation in <2 s und sind mit dem Mock-Testmuster des Repos prüfbar. Umsetzung als TS-Rechenkern; Views ggf. in Phase 7 (Härtung) nachrüstbar.
- **P6-R2:** Wochenbericht existiert bereits vollständig (`src/lib/email/weekly-report-send.ts`, Montag-Gate im Daily-Cron, env-gated `WEEKLY_REPORTS_ENABLED`). Kein Code in Phase 6; Ops-Punkt „`WEEKLY_REPORTS_ENABLED=true` setzen" geht ins Betriebshandbuch (Phase 7).
- **P6-R3:** Alarm „getrennte Nummer < 60 min": Agentur-Dashboard berechnet Alarme live beim Laden aus `whatsapp_accounts.status` (wird per Webhook sofort + per Hourly-Sync aktualisiert) → Anforderung erfüllt ohne eigenen Alarm-Cron.
- **P6-R4:** KI-Kosten sind Schätzwerte aus Token-Zahlen × Modellpreis-Konstanten (`ai_calls` speichert keine Kosten). Meta-Gebühren sind Schätzwerte aus `messages.cost_category` × `meta_pricing.price_eur` (Admin-pflegbar, Spec §17).

## Relevante Bestandsdaten (verifiziert)

| Tabelle | Spalten (Auszug) |
| --- | --- |
| `applications` | `id, agency_id, candidate_id, job_id, stage_id, source, status ('open','hired','rejected','withdrawn','not_reached'), score int, score_label ('A','B','C'), score_reasons jsonb, applied_at, created_at` |
| `jobs` | `id, agency_id, title, status ('draft','active','paused','closed')` |
| `pipeline_stages` | `id, agency_id, stage_type ('new','qualifying','qualified','interview','offer','hired','rejected')` |
| `conversations` | `id, agency_id, application_id, state ('bot_active','human_active','waiting','closed'), last_message_at` |
| `messages` | `id, agency_id, conversation_id, direction ('in','out'), sender_type, type, cost_category, template_id, created_at` |
| `appointments` | `id, agency_id, application_id, starts_at, status ('proposed','booked','confirmed','no_show','done','cancelled'), created_at` |
| `ai_calls` | `id, agency_id, model, input_tokens, output_tokens, created_at` |
| `whatsapp_accounts` | `agency_id, display_number, status ('connected','disconnected','banned'), quality_rating, messaging_limit` |
| `whatsapp_templates` | `agency_id, name, category, status ('pending','approved','rejected','paused','deleted')` |
| `events_inbox` | `agency_id, source, status ('pending','processing','done','failed','dead'), received_at` |
| `scheduled_jobs` | `agency_id, status (…,'dead')` |
| `agencies` | `id, name` |

Helfer: `createAdminClient()` (`@/lib/supabase/admin`), `getCurrentUser()`/`getEffectiveAgencyId()` (`@/lib/auth`), `canWriteRole()` (`@/lib/recruiting/scope`), `shouldAlertErrorRate()` (`@/lib/monitoring/ingest-monitor`). Sidebar: `src/components/app-sidebar.tsx` (`agencyGroups` Zeile ~123, `adminGroups` Zeile ~60).

---

### Task 1: Migration `usage_daily` + `meta_pricing` + Typen

**Files:**
- Create: `supabase/migrations/20260921000040_phase6_usage.sql`
- Modify: `src/lib/types/database.ts` (am Ende anhängen)

**Interfaces:**
- Produces: Tabellen `usage_daily` (UNIQUE(agency_id, day)) und `meta_pricing` (UNIQUE category, geseedet mit 4 Kategorien); TS-Typen `UsageDaily`, `MetaPricing`.
- Hinweis: KEIN Test nötig (reine Migration + Typen). Der Orchestrator spielt die Migration auf der Live-DB ein — du schreibst nur die Dateien.

- [ ] **Step 1: Migrationsdatei schreiben**

```sql
-- Phase 6: Verbrauchserfassung (Spec §5 usage_daily, §11 tägliche Aggregation, §12 Agentur-Dashboard)

CREATE TABLE usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  day date NOT NULL,
  messages_out int NOT NULL DEFAULT 0,
  messages_in int NOT NULL DEFAULT 0,
  templates_by_category jsonb NOT NULL DEFAULT '{}',
  ai_input_tokens bigint NOT NULL DEFAULT 0,
  ai_output_tokens bigint NOT NULL DEFAULT 0,
  ai_cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, day)
);
CREATE INDEX idx_usage_daily_agency_day ON usage_daily(agency_id, day DESC);
ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage_daily select" ON usage_daily FOR SELECT USING (can_access_agency(agency_id));

-- Preistabelle für geschätzte Meta-Gebühren, im Admin pflegbar (Spec §12, §17)
CREATE TABLE meta_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL UNIQUE,
  price_eur numeric(10,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE meta_pricing ENABLE ROW LEVEL SECURITY;
-- Keine Policies: Zugriff nur über Service-Role (Admin-APIs)

INSERT INTO meta_pricing (category, price_eur) VALUES
  ('marketing', 0.1400),
  ('utility', 0.0200),
  ('authentication', 0.0130),
  ('service', 0.0000);
```

- [ ] **Step 2: Typen ergänzen** (in `src/lib/types/database.ts` am Dateiende)

```ts
// --- Phase 6: Verbrauch & Kosten ---
export interface UsageDaily {
  id: string;
  agency_id: string;
  day: string; // YYYY-MM-DD
  messages_out: number;
  messages_in: number;
  templates_by_category: Record<string, number>;
  ai_input_tokens: number;
  ai_output_tokens: number;
  ai_cost_usd: number;
  created_at: string;
}

export interface MetaPricing {
  id: string;
  category: string;
  price_eur: number;
  updated_at: string;
}
```

- [ ] **Step 3: Build + Tests grün verifizieren**

Run: `npx tsc --noEmit` und `npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Expected: keine TS-Fehler; weiterhin 576 Tests grün.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260921000040_phase6_usage.sql src/lib/types/database.ts
git commit -m "feat(usage): Tabellen usage_daily und meta_pricing (Phase 6 Task 1)"
```

---

### Task 2: Verbrauchs-Aggregation + Daily-Cron-Anbindung

**Files:**
- Create: `src/lib/usage/aggregate.ts`
- Create: `src/lib/usage/__tests__/aggregate.test.ts`
- Modify: `src/app/api/cron/daily/route.ts` (neuer best-effort-Block am Ende, Muster wie `runIngestMonitor`)

**Interfaces:**
- Consumes: Tabellen aus Task 1.
- Produces: `estimateAiCostUsd(model: string, inputTokens: number, outputTokens: number): number`; `aggregateUsageForDay(svc: SupabaseClient, day: string): Promise<{ agencies: number; upserts: number }>` (day = `YYYY-MM-DD`, aggregiert genau diesen UTC-Tag); `yesterdayUtc(now?: Date): string`.

- [ ] **Step 1: Failing Tests schreiben** (`src/lib/usage/__tests__/aggregate.test.ts`)

Mock-Muster wie `src/lib/monitoring/__tests__/ingest-monitor.test.ts` (chainbarer Mock-Client mit per-Tabelle-Respondern). Testfälle:

```ts
import { describe, it, expect } from 'vitest';
import { estimateAiCostUsd, yesterdayUtc, aggregateUsageForDay } from '@/lib/usage/aggregate';

describe('estimateAiCostUsd', () => {
  it('berechnet Sonnet-Kosten (3/15 USD pro Mio Token)', () => {
    expect(estimateAiCostUsd('claude-sonnet-4-5', 1_000_000, 1_000_000)).toBeCloseTo(18, 4);
  });
  it('berechnet Haiku-Kosten (1/5 USD pro Mio Token)', () => {
    expect(estimateAiCostUsd('claude-haiku-4-5-20251001', 2_000_000, 0)).toBeCloseTo(2, 4);
  });
  it('fällt bei unbekanntem Modell auf Sonnet-Preise zurück', () => {
    expect(estimateAiCostUsd('gpt-x', 1_000_000, 0)).toBeCloseTo(3, 4);
  });
});

describe('yesterdayUtc', () => {
  it('liefert den Vortag als YYYY-MM-DD', () => {
    expect(yesterdayUtc(new Date('2026-09-21T08:00:00Z'))).toBe('2026-09-20');
  });
  it('geht über Monatsgrenzen', () => {
    expect(yesterdayUtc(new Date('2026-10-01T00:30:00Z'))).toBe('2026-09-30');
  });
});

describe('aggregateUsageForDay', () => {
  it('zählt Nachrichten, Kategorien und Tokens je Agentur und upserted', async () => {
    // Mock: 1 Agentur; messages: 2× out (cost_category 'utility', 'marketing'), 1× in;
    // ai_calls: input 1000 / output 500 (model 'claude-haiku-…')
    // Assertion: upsert auf usage_daily mit messages_out=2, messages_in=1,
    // templates_by_category={utility:1, marketing:1}, ai_input_tokens=1000,
    // ai_output_tokens=500, ai_cost_usd=estimateAiCostUsd(...), onConflict 'agency_id,day'
  });
  it('schreibt auch bei 0 Aktivität eine Nullzeile (Monatsübersicht bleibt vollständig)', async () => {
    // Mock: 1 Agentur, keine messages, keine ai_calls → upsert mit Nullwerten
  });
});
```

Die beiden `aggregateUsageForDay`-Tests voll ausimplementieren: Mock-Client sammelt `upsert`-Aufrufe in `state.usage_daily`; Assertions auf die Upsert-Payload inkl. `day`.

- [ ] **Step 2: Tests laufen lassen — rot**

Run: `npx vitest run src/lib/usage 2>&1 | tail -5`
Expected: FAIL (Modul existiert nicht).

- [ ] **Step 3: Implementierung** (`src/lib/usage/aggregate.ts`)

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

// Geschätzte USD-Preise pro 1 Mio Token (P6-R4)
const MODEL_PRICES: Array<{ match: string; input: number; output: number }> = [
  { match: 'haiku', input: 1, output: 5 },
  { match: 'opus', input: 15, output: 75 },
  { match: 'sonnet', input: 3, output: 15 },
];
const DEFAULT_PRICE = { input: 3, output: 15 };

export function estimateAiCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICES.find((p) => model.includes(p.match)) ?? DEFAULT_PRICE;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

export function yesterdayUtc(now: Date = new Date()): string {
  const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Aggregiert Verbrauch aller Agenturen für einen UTC-Tag in usage_daily (Spec §11). */
export async function aggregateUsageForDay(
  svc: SupabaseClient,
  day: string,
): Promise<{ agencies: number; upserts: number }> {
  const from = `${day}T00:00:00.000Z`;
  const to = `${day}T23:59:59.999Z`;

  const { data: agencies } = await svc.from('agencies').select('id');
  let upserts = 0;

  for (const agency of agencies ?? []) {
    const [msgRes, aiRes] = await Promise.all([
      svc
        .from('messages')
        .select('direction, cost_category')
        .eq('agency_id', agency.id)
        .gte('created_at', from)
        .lte('created_at', to),
      svc
        .from('ai_calls')
        .select('model, input_tokens, output_tokens')
        .eq('agency_id', agency.id)
        .gte('created_at', from)
        .lte('created_at', to),
    ]);

    let messagesOut = 0;
    let messagesIn = 0;
    const byCategory: Record<string, number> = {};
    for (const m of msgRes.data ?? []) {
      if (m.direction === 'out') {
        messagesOut += 1;
        if (m.cost_category) byCategory[m.cost_category] = (byCategory[m.cost_category] ?? 0) + 1;
      } else {
        messagesIn += 1;
      }
    }

    let aiIn = 0;
    let aiOut = 0;
    let aiCost = 0;
    for (const c of aiRes.data ?? []) {
      aiIn += c.input_tokens ?? 0;
      aiOut += c.output_tokens ?? 0;
      aiCost += estimateAiCostUsd(c.model ?? '', c.input_tokens ?? 0, c.output_tokens ?? 0);
    }

    const { error } = await svc.from('usage_daily').upsert(
      {
        agency_id: agency.id,
        day,
        messages_out: messagesOut,
        messages_in: messagesIn,
        templates_by_category: byCategory,
        ai_input_tokens: aiIn,
        ai_output_tokens: aiOut,
        ai_cost_usd: Math.round(aiCost * 10000) / 10000,
      },
      { onConflict: 'agency_id,day' },
    );
    if (!error) upserts += 1;
  }

  return { agencies: (agencies ?? []).length, upserts };
}
```

- [ ] **Step 4: Daily-Cron anbinden** — in `src/app/api/cron/daily/route.ts` direkt nach dem `runIngestMonitor`-Block, gleiches Muster:

```ts
// Phase 6: Verbrauchs-Aggregation für den Vortag (best effort)
try {
  const { aggregateUsageForDay, yesterdayUtc } = await import('@/lib/usage/aggregate');
  const usageResult = await aggregateUsageForDay(supabase, yesterdayUtc());
  results.usage_aggregation = usageResult;
} catch (e) {
  console.error('Verbrauchs-Aggregation fehlgeschlagen', e);
  results.usage_aggregation = { error: String(e) };
}
```

(Exakte Variablennamen `supabase`/`results` an den bestehenden Code der Route anpassen — vorher lesen.)

- [ ] **Step 5: Tests laufen lassen — grün**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests "`
Expected: 576 + 7 = **583** Tests grün (Delta +7).

- [ ] **Step 6: Commit**

```bash
git add src/lib/usage src/app/api/cron/daily/route.ts
git commit -m "feat(usage): tägliche Verbrauchs-Aggregation in usage_daily (Phase 6 Task 2)"
```

---

### Task 3: KPI-Rechenkern (pure Funktionen)

**Files:**
- Create: `src/lib/kpi/recruiting-kpis.ts`
- Create: `src/lib/kpi/__tests__/recruiting-kpis.test.ts`

**Interfaces:**
- Produces (verbatim, spätere Tasks bauen darauf):

```ts
export interface KpiAppRow {
  id: string;
  job_id: string;
  source: string;
  score_label: 'A' | 'B' | 'C' | null;
  status: string;
  stage_type: string | null;
  applied_at: string;
}
export interface KpiAppointmentRow {
  application_id: string;
  status: string;
  created_at: string;
}
export interface KpiInput {
  apps: KpiAppRow[];
  appsWithOutbound: Set<string>;       // application_ids mit ≥1 ausgehender Nachricht
  appsWithInbound: Set<string>;        // application_ids mit ≥1 eingehender Nachricht
  firstOutboundAt: Map<string, string>; // application_id → ISO-Zeit der ersten ausgehenden Nachricht
  appointments: KpiAppointmentRow[];
  botConversations: { total: number; handedOver: number; messagesPerApp: Map<string, number> };
}
export interface KpiTiles {
  bewerbungen: number;
  antwortquote: number | null;
  vorqualiAbgeschlossen: number;
  qualifiziert: number;
  termineGebucht: number;
  noShowQuote: number | null;
  einstellungen: number;
}
export interface FunnelStep { key: string; label: string; count: number; dropRate: number | null }
export interface SourceStats { source: string; count: number; qualifizierungsquote: number | null; terminquote: number | null }
export interface RecruitingKpis {
  tiles: KpiTiles;
  funnel: FunnelStep[];
  sources: SourceStats[];
  timeline: Array<{ day: string; bySource: Record<string, number> }>;
  bot: { abschlussquote: number | null; avgNachrichten: number | null; uebergabequote: number | null; topKnockouts: Array<{ reason: string; count: number }> };
  medianErstkontaktSek: number | null;
  medianTerminSek: number | null;
}
export function median(values: number[]): number | null;
export function computeRecruitingKpis(input: KpiInput, knockoutReasons: string[]): RecruitingKpis;
```

- Terminlogik: „gebucht" = Termin-Status in `('booked','confirmed','done','no_show')`; „fällig" = `('done','no_show')`; „Einstellung" = `status === 'hired'` ODER `stage_type === 'hired'`.
- `dropRate` je Funnel-Schritt = `1 − (count / vorherigem count)`, erster Schritt `null`, bei Vorgänger 0 → `null`.
- `timeline`: `applied_at` auf `YYYY-MM-DD` gekürzt, aufsteigend sortiert.
- `topKnockouts`: die 5 häufigsten Strings aus `knockoutReasons` (Aufrufer extrahiert sie aus `score_reasons`).

- [ ] **Step 1: Failing Tests schreiben** — Fixture mit **manuell auszählbaren** Daten (Abnahmekriterium §16: „Kennzahlen stimmen mit einer manuellen Auszählung von Seed-Daten überein"). Mindestens:

```ts
// Fixture: 10 Bewerbungen
//  - 8 mit Eröffnung (appsWithOutbound), davon 6 mit Antwort (appsWithInbound)
//  - 5 mit score_label: A, A, B, C, C  → vorqualiAbgeschlossen=5, qualifiziert=3
//  - Termine: app1 booked, app2 done, app3 no_show, app4 cancelled → termineGebucht=3
//  - fällige Termine: done+no_show=2, davon 1 no_show → noShowQuote=0.5
//  - 1 Bewerbung status='hired' → einstellungen=1
// Erwartungen:
//  antwortquote = 6/8 = 0.75
//  bot.abschlussquote = 5/6
//  qualifizierungsquote (im funnel/sources) = 3/5
//  terminquote = 3/3 = 1  (3 Apps mit gebuchtem Termin ÷ 3 qualifizierte)
// Weitere Tests:
//  - median([]) === null; median([1,3,2]) === 2; median([1,2,3,4]) === 2.5
//  - Quoten bei leerem Nenner === null (Input ohne Outbound → antwortquote null)
//  - funnel: 6 Schritte in Reihenfolge bewerbung/antwort/vorquali/qualifiziert/termin/eingestellt,
//    dropRate Schritt 2 = 1 - 6/10
//  - timeline gruppiert nach Tag und Quelle
//  - topKnockouts zählt und sortiert, max 5
//  - medianErstkontaktSek aus firstOutboundAt − applied_at
```

Alle Kommentar-Zeilen als echte Assertions ausschreiben (≥ 10 `it`-Blöcke).

- [ ] **Step 2: Tests rot** — `npx vitest run src/lib/kpi 2>&1 | tail -5` → FAIL.

- [ ] **Step 3: Implementierung** (`src/lib/kpi/recruiting-kpis.ts`) — pure Funktionen ohne Supabase-Import (außer keinem). Kernstücke:

```ts
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

const BOOKED_STATUSES = new Set(['booked', 'confirmed', 'done', 'no_show']);
const DUE_STATUSES = new Set(['done', 'no_show']);

export function computeRecruitingKpis(input: KpiInput, knockoutReasons: string[]): RecruitingKpis {
  const { apps, appsWithOutbound, appsWithInbound, firstOutboundAt, appointments, botConversations } = input;

  const withOpening = apps.filter((a) => appsWithOutbound.has(a.id));
  const withReply = apps.filter((a) => appsWithInbound.has(a.id));
  const completed = apps.filter((a) => a.score_label !== null);
  const qualified = apps.filter((a) => a.score_label === 'A' || a.score_label === 'B');
  const hired = apps.filter((a) => a.status === 'hired' || a.stage_type === 'hired');

  const appsWithBookedAppt = new Set(
    appointments.filter((t) => BOOKED_STATUSES.has(t.status)).map((t) => t.application_id),
  );
  const dueAppts = appointments.filter((t) => DUE_STATUSES.has(t.status));
  const noShows = appointments.filter((t) => t.status === 'no_show');

  // … tiles, funnel (mit dropRate), sources (groupBy source), timeline (groupBy Tag+Quelle),
  // bot (abschlussquote = completed/withReply; avgNachrichten = Mittel über messagesPerApp der
  // Apps mit Antwort; uebergabequote = handedOver/total), topKnockouts (Count-Map, Top 5),
  // medianErstkontaktSek = median((firstOutbound − applied_at)/1000 je App mit Eintrag),
  // medianTerminSek analog über früheste Termin-created_at je App mit gebuchtem Termin.
  // Vollständig ausimplementieren — keine Platzhalter im Code.
}
```

Der Implementer schreibt die Funktion komplett aus; die Tests aus Step 1 definieren jede Zahl exakt.

- [ ] **Step 4: Tests grün** — voller Lauf, Delta **+≥10** (≥ 586 gesamt).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi
git commit -m "feat(kpi): Rechenkern für Recruiting-Kennzahlen nach Spec §12 (Phase 6 Task 3)"
```

---

### Task 4: Fetch-Schicht + Kunden-Dashboard-API `GET /api/recruiting-stats`

**Files:**
- Create: `src/lib/kpi/get-recruiting-stats.ts`
- Create: `src/app/api/recruiting-stats/route.ts`
- Create: `src/app/api/recruiting-stats/__tests__/recruiting-stats.test.ts`

**Interfaces:**
- Consumes: `computeRecruitingKpis`, `KpiInput` usw. aus Task 3 (exakte Signaturen dort).
- Produces (verbatim):

```ts
export interface StatsFilters { from: string; to: string; jobId?: string; source?: string }
export interface JobTableRow {
  jobId: string; title: string; status: string;
  bewerbungen: number; antwortquote: number | null; qualifiziert: number;
  termine: number; einstellungen: number;
}
export interface RecruitingStatsPayload {
  kpis: RecruitingKpis;
  previousTiles: KpiTiles;          // gleiche Zeitraumlänge direkt davor
  jobsTable: JobTableRow[];
  tasks: {
    brauchtMensch: number;          // conversations state='human_active'
    qualifiziertOhneAktion: number; // qualifizierte (A/B) Apps ohne assigned_to
    termineHeute: number;           // appointments booked/confirmed mit starts_at heute (UTC)
  };
}
export async function getRecruitingStats(
  svc: SupabaseClient, agencyId: string, filters: StatsFilters,
): Promise<RecruitingStatsPayload>;
```

**Datenbeschaffung (alle Queries mit `.eq('agency_id', agencyId)`):**
1. `pipeline_stages`: `id, stage_type` → Map für `stage_type`-Auflösung.
2. `applications` aktueller Zeitraum: `id, job_id, source, score_label, score_reasons, status, stage_id, applied_at, assigned_to` mit `.gte('applied_at', from).lte('applied_at', to)` + optional `.eq('job_id', jobId)` / `.eq('source', source)`.
3. `applications` Vorzeitraum (gleiche Länge davor, nur für `previousTiles`): gleiche Spalten.
4. `conversations`: `id, application_id, state` (für alle App-IDs beider Zeiträume via `.in('application_id', ids)`; bei 0 IDs Query überspringen).
5. `messages`: `conversation_id, direction, sender_type, created_at` via `.in('conversation_id', convIds)`; in TS zu `appsWithOutbound/appsWithInbound/firstOutboundAt/messagesPerApp` reduzieren (Bot-Nachrichten = `direction==='out'`).
6. `appointments`: `application_id, status, starts_at, created_at` via `.in('application_id', ids)`.
7. `jobs`: `id, title, status` → `jobsTable` durch Gruppierung der aktuellen Apps je Job (nur Jobs mit ≥1 Bewerbung im Zeitraum ODER Status `active`).
8. Knockout-Gründe: aus `score_reasons` (jsonb-Array von Strings oder Objekten mit `reason`-Feld — beide Formen tolerieren, Strings extrahieren).

**Route** (`GET`): zod-Schema

```ts
const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  job_id: z.string().uuid().optional(),
  source: z.enum(['indeed', 'meta', 'form', 'manual']).optional(),
});
```

Auth exakt wie `lead-sources` GET (kein `canWriteRole`). `from`/`to` werden zu `T00:00:00.000Z`/`T23:59:59.999Z` erweitert. 400 bei Schemafehler.

- [ ] **Step 1: Failing Tests** — Mock-Muster wie `src/app/api/lead-sources/__tests__/lead-sources.test.ts` (vi.mock auf `@/lib/auth`, `@/lib/supabase/admin`). Testfälle: 401 ohne User; 403 ohne Agentur; 400 bei fehlendem/ungültigem `from`; 200-Happy-Path mit kleinem Fixture (2 Apps, 1 Conversation, 2 Messages, 1 Termin) mit Assertions auf `kpis.tiles.bewerbungen`, `previousTiles`, `jobsTable`-Länge, `tasks`-Zahlen; Agency-Scoping-Nachweis (Mock zeichnet `.eq('agency_id', …)`-Aufrufe auf — mindestens für die `applications`-Query asserten).
- [ ] **Step 2: Tests rot.**
- [ ] **Step 3: `get-recruiting-stats.ts` + Route implementieren** (Route dünn: auth → zod → `getRecruitingStats` → `NextResponse.json(payload)`).
- [ ] **Step 4: Voller Testlauf grün, Delta +≥5.**
- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/get-recruiting-stats.ts src/app/api/recruiting-stats
git commit -m "feat(stats): Kunden-Dashboard-API mit Kennzahlen, Trichter und Jobtabelle (Phase 6 Task 4)"
```

---

### Task 5: CSV-Export `GET /api/recruiting-stats/export`

**Files:**
- Create: `src/lib/kpi/csv.ts`
- Create: `src/app/api/recruiting-stats/export/route.ts`
- Create: `src/lib/kpi/__tests__/csv.test.ts`
- Test (erweitern): `src/app/api/recruiting-stats/__tests__/recruiting-stats.test.ts` um einen Export-Block ODER eigene Testdatei `src/app/api/recruiting-stats/export/__tests__/export.test.ts` (eigene Datei bevorzugt)

**Interfaces:**
- Consumes: `getRecruitingStats`, `JobTableRow` (Task 4).
- Produces: `toCsv(headers: string[], rows: Array<Array<string | number | null>>): string` — Trennzeichen `;` (deutsches Excel), Felder mit `;`, `"` oder Zeilenumbruch in `"…"` mit verdoppelten `"`, Zeilen mit `\r\n`, Präfix BOM `\uFEFF`. Quoten als Prozent mit deutschem Komma (`75,0 %`), `null` → leerString.

- [ ] **Step 1: Failing Tests für `toCsv`** (Escaping: Semikolon im Titel, Anführungszeichen, BOM-Präfix, CRLF) **und für die Route** (401; 200 mit `content-type: text/csv; charset=utf-8` und `content-disposition: attachment; filename="jobs-statistik.csv"`; Inhalt enthält Headerzeile `Job;Status;Bewerbungen;Antwortquote;Qualifiziert;Termine;Einstellungen`).
- [ ] **Step 2: rot.**
- [ ] **Step 3: Implementieren** — Route: gleiche Auth+zod wie Task 4, dann `getRecruitingStats`, dann `new NextResponse(csv, { headers: … })`.
- [ ] **Step 4: Voller Lauf grün, Delta +≥5.**
- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/csv.ts src/app/api/recruiting-stats/export src/lib/kpi/__tests__/csv.test.ts
git commit -m "feat(stats): CSV-Export der Jobtabelle (Phase 6 Task 5)"
```

---

### Task 6: Kunden-Dashboard-Seite `/statistiken`

**Files:**
- Create: `src/app/(portal)/statistiken/page.tsx`
- Create: `src/components/stats/recruiting-stats-view.tsx`
- Modify: `src/components/app-sidebar.tsx` (`agencyGroups` → Gruppe „Recruiting": neuer Eintrag nach `dashboard`: `{ id: 'statistiken', label: 'Statistiken', icon: <BarChart3 className="w-5 h-5" />, href: '/statistiken' }` — `BarChart3` ist dort bereits importiert)

**Interfaces:**
- Consumes: `GET /api/recruiting-stats?from&to&job_id&source` → `RecruitingStatsPayload`; `GET /api/recruiting-stats/export?…` (Link); `GET /api/jobs` existiert? NICHT voraussetzen — Job-Filter-Optionen aus `payload.jobsTable` ableiten.
- Kein Unit-Test (UI); Verifikation über `npx tsc --noEmit` + `npm run build` + voller Testlauf (Delta 0, keine Tests löschen).

**Page** (Muster `src/app/(portal)/settings/quellen/page.tsx` — Portal-Layout übernimmt Auth):

```tsx
import { RecruitingStatsView } from '@/components/stats/recruiting-stats-view';

export default function StatistikenPage() {
  return <RecruitingStatsView />;
}
```

**Komponente** (`'use client'`, Muster `lead-sources-manager.tsx`):
- State: `zeitraum` (`'7' | '30' | '90'`, Default `'30'`), `jobId`, `source`, `data: RecruitingStatsPayload | null`, `loading`.
- `useEffect`-Fetch: `from = heute − zeitraum Tage`, `to = heute` (je `toISOString().slice(0,10)`).
- Aufbau (alle Texte deutsch):
  1. `PageHeader label="RECRUITING" title="Statistiken" description="Kennzahlen nach Zeitraum, Job und Quelle"` mit Filterleiste (3× `Select`: Zeitraum 7/30/90 Tage, Job „Alle Jobs" + jobsTable-Einträge, Quelle Alle/Indeed/Meta/Formular/Manuell).
  2. Kachel-Grid (7 `Card padding="sm"`): Bewerbungen, Antwortquote, Vorquali abgeschlossen, Qualifiziert (A+B), Termine gebucht, No-Show-Quote, Einstellungen — je aktueller Wert + Delta zum Vorzeitraum (`previousTiles`) als grüner/roter Pfeiltext; Quoten als `XX %`, `null` → „–".
  3. Trichter: 6 horizontale Balken (div-Breite proportional zu `count / funnel[0].count`), rechts Abbruchquote je Schritt.
  4. Quellenvergleich: Tabelle (Quelle, Bewerbungen, Qualifizierungsquote, Terminquote).
  5. Verlauf: `recharts` `<AreaChart>` gestapelt nach Quelle aus `kpis.timeline` (Muster: `src/components/dashboard/candidates-chart.tsx` lesen und Stil übernehmen).
  6. Bot-Leistung: `Card` mit Abschlussquote, Ø Nachrichten, Übergabequote, Top-Knockouts als Liste.
  7. Aufgaben: `Card` mit den 3 Zahlen aus `tasks` (Braucht Mensch, Qualifiziert ohne Aktion, Termine heute).
  8. Jobtabelle mit allen `JobTableRow`-Spalten + Button `variant="secondary"` „CSV exportieren" als `<a href={/api/recruiting-stats/export?…}>` mit aktuellen Filtern.

- [ ] **Step 1: Page + Komponente + Sidebar-Link implementieren** (vorher `candidates-chart.tsx` und `lead-sources-manager.tsx` lesen und deren Muster folgen).
- [ ] **Step 2: Verifikation** — `npx tsc --noEmit`, `npm run build`, `npx vitest run 2>&1 | grep -E "Test Files|Tests "` (unverändert grün).
- [ ] **Step 3: Commit**

```bash
git add src/app/\(portal\)/statistiken src/components/stats src/components/app-sidebar.tsx
git commit -m "feat(stats): Kunden-Dashboard Statistiken-Seite mit Trichter und Export (Phase 6 Task 6)"
```

---

### Task 7: Agentur-Übersicht-API + Meta-Preistabelle-API

**Files:**
- Create: `src/lib/kpi/agency-overview.ts`
- Create: `src/app/api/admin/recruiting-overview/route.ts`
- Create: `src/app/api/admin/meta-pricing/route.ts`
- Create: `src/app/api/admin/recruiting-overview/__tests__/recruiting-overview.test.ts`
- Create: `src/app/api/admin/meta-pricing/__tests__/meta-pricing.test.ts`

**Interfaces:**
- Consumes: `shouldAlertErrorRate` aus `@/lib/monitoring/ingest-monitor`; `usage_daily`, `meta_pricing` (Task 1).
- Produces (verbatim):

```ts
export type Ampel = 'gruen' | 'gelb' | 'rot';
export interface AgencyAlarm { type: 'wa_disconnected' | 'template_rejected' | 'ingest_errors' | 'job_no_apps' | 'dead_jobs'; label: string }
export interface AgencyOverviewRow {
  agencyId: string; name: string;
  activeJobs: number; apps7: number; apps30: number;
  antwortquote30: number | null; qualifizierungsquote30: number | null; termine30: number;
  letzteAktivitaet: string | null;
  ampel: Ampel;
  whatsapp: { status: string | null; qualityRating: string | null; messagingLimit: string | null; rejectedTemplates: number };
  alarms: AgencyAlarm[];
  usageMonth: { messagesOut: number; templatesByCategory: Record<string, number>; metaCostEur: number; aiInputTokens: number; aiOutputTokens: number; aiCostUsd: number };
}
export function computeAmpel(row: Pick<AgencyOverviewRow, 'activeJobs' | 'apps7' | 'antwortquote30'> & { waStatus: string | null; rejectedTemplates: number }): Ampel;
export async function getAgencyOverview(svc: SupabaseClient, monthStart: string): Promise<AgencyOverviewRow[]>;
```

**Ampel-Regeln (pure Funktion, testbar):** `rot` wenn `waStatus === 'disconnected' || waStatus === 'banned'` ODER (`activeJobs > 0 && apps7 === 0`); sonst `gelb` wenn `rejectedTemplates > 0` ODER (`antwortquote30 !== null && antwortquote30 < 0.4`); sonst `gruen`.

**Alarme (live berechnet, P6-R3):** `wa_disconnected` (Status ≠ connected bei vorhandenem Account); `template_rejected` (≥1 Template `rejected`/`paused`); `ingest_errors` (`shouldAlertErrorRate(failedCount, totalCount)` über `events_inbox` der letzten 24 h, `source in ('indeed','meta','generic')`); `job_no_apps` (≥1 aktiver Job ohne Bewerbung in 7 Tagen); `dead_jobs` (≥1 `scheduled_jobs` mit `status='dead'`). Labels deutsch, z. B. „WhatsApp-Nummer getrennt".

**Datenbeschaffung je Agentur** (Schleife über `agencies`, jede Sub-Query `.eq('agency_id', id)`): jobs (`id,status`), applications 30d (`id, job_id, score_label, applied_at`), conversations (`id, application_id, last_message_at`) der 30d-Apps, messages 30d (`conversation_id, direction, created_at`), appointments 30d (`application_id, status`), whatsapp_accounts (`status, quality_rating, messaging_limit`, `.maybeSingle()` erste), whatsapp_templates Count rejected/paused, events_inbox 24h (`status`), scheduled_jobs dead Count, usage_daily des Monats (`.gte('day', monthStart)`) + `meta_pricing` (einmal global laden, Map `category → price_eur`; `metaCostEur = Σ templates_by_category[cat] × preis`).

`antwortquote30` = Apps mit ≥1 Inbound ÷ Apps mit ≥1 Outbound (wie Kennzahlen-Definition); `qualifizierungsquote30` = A/B ÷ score_label gesetzt; `letzteAktivitaet` = Max aus `last_message_at` und `applied_at`.

**Routen:**
- `GET /api/admin/recruiting-overview` → Admin-Guard (Global Constraints), `getAgencyOverview(svc, monthStart)` mit `monthStart = new Date().toISOString().slice(0,8) + '01'`; Antwort `{ agencies: AgencyOverviewRow[], month: monthStart }`.
- `GET /api/admin/meta-pricing` → Admin-Guard, `svc.from('meta_pricing').select('id, category, price_eur, updated_at').order('category')` → `{ pricing: [...] }`.
- `PATCH /api/admin/meta-pricing` → Admin-Guard, Body-zod `{ category: z.string().min(1), price_eur: z.number().min(0).max(10) }`, Update per `.eq('category', category)` + `updated_at: new Date().toISOString()`, 404 wenn Kategorie unbekannt (`.select().maybeSingle()` → null), sonst 200 mit aktualisierter Zeile.

- [ ] **Step 1: Failing Tests** — `computeAmpel` (4 Fälle: rot/rot/gelb/gruen); overview-Route: 401 ohne User, 403 als `agency_owner`, 200-Happy-Path (1 Agentur-Fixture, Assertions auf `apps30`, `ampel`, `alarms`-Länge, `usageMonth.metaCostEur` aus Preistabellen-Fixture); meta-pricing: 401/403, GET 200, PATCH 200 + Wertänderung, PATCH 404 unbekannte Kategorie, PATCH 400 negativer Preis.
- [ ] **Step 2: rot.**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Voller Lauf grün, Delta +≥10.**
- [ ] **Step 5: Commit**

```bash
git add src/lib/kpi/agency-overview.ts src/app/api/admin/recruiting-overview src/app/api/admin/meta-pricing
git commit -m "feat(admin): Agentur-Übersicht-API mit Ampel, Alarmen, Verbrauch und Meta-Preistabelle (Phase 6 Task 7)"
```

---

### Task 8: Agentur-Dashboard-Seite `/admin/recruiting`

**Files:**
- Create: `src/app/(internal)/admin/recruiting/page.tsx`
- Create: `src/components/admin/recruiting-overview-view.tsx`
- Modify: `src/components/app-sidebar.tsx` (`adminGroups`: in einer neuen Gruppe „Recruiting-Cloud" VOR „Marketing & Sales" — Eintrag `{ id: 'recruiting-cloud', label: 'Kunden-Übersicht', icon: <LayoutDashboard className="w-5 h-5" />, href: '/admin/recruiting' }`; `LayoutDashboard` ist bereits importiert)

**Interfaces:**
- Consumes: `GET /api/admin/recruiting-overview` → `{ agencies: AgencyOverviewRow[], month }`; `GET/PATCH /api/admin/meta-pricing`.
- Kein Unit-Test (UI); Verifikation über Build + unveränderten Testlauf.

**Page** (Muster `src/app/(internal)/admin/kpi/page.tsx` — Internal-Layout übernimmt Auth; zusätzlich in der Page: `user.role !== 'admin'` → `redirect('/admin')`, da Layout auch `employee` durchlässt und Spec §12 „nur Platform Admin" verlangt):

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { RecruitingOverviewView } from '@/components/admin/recruiting-overview-view';

export default async function AdminRecruitingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/admin');
  return <RecruitingOverviewView />;
}
```

**Komponente** (`'use client'`):
1. `PageHeader label="RECRUITING-CLOUD" title="Kunden-Übersicht" description="Zustand, Verbrauch und Alarme aller Mandanten"`.
2. Alarme-Panel oben: alle `alarms` aller Agenturen flach als Liste (`Badge tone="accent"` je Alarm, Agenturname davor); leer → „Keine aktiven Alarme".
3. Kundentabelle: Name, Ampel (farbiger Punkt: grün `bg-green-500`, gelb `bg-yellow-400`, rot `bg-red-500`), aktive Jobs, Bewerbungen 7/30 T, Antwortquote, Qualifizierungsquote, Termine 30 T, letzte Aktivität (relativ formatiert, `Intl` oder einfache Tage-Differenz), WhatsApp-Status + Qualität + Limit + abgelehnte Vorlagen.
4. Verbrauch/Kosten-Tabelle (aktueller Monat): je Kunde Nachrichten ausgehend, Vorlagen nach Kategorie (kompakt `marketing 12 · utility 30`), Meta-Kosten € (2 Nachkommastellen), KI-Tokens (in/out), KI-Kosten $ .
5. Meta-Preistabelle: 4 Zeilen mit `Input type="number" step="0.001"` + Button „Speichern" je Zeile → `PATCH /api/admin/meta-pricing`, Erfolg per `sonner`-Toast (Muster in `lead-sources-manager.tsx`).

- [ ] **Step 1: Page + Komponente + Sidebar-Gruppe implementieren.**
- [ ] **Step 2: Verifikation** — `npx tsc --noEmit`, `npm run build`, voller Testlauf unverändert grün.
- [ ] **Step 3: Commit**

```bash
git add src/app/\(internal\)/admin/recruiting src/components/admin/recruiting-overview-view.tsx src/components/app-sidebar.tsx
git commit -m "feat(admin): Agentur-Dashboard mit Kundentabelle, Verbrauch und Preistabelle (Phase 6 Task 8)"
```

---

## Self-Review (durchgeführt)

1. **Spec-Abdeckung §12/§16 Phase 6:** Kacheln+Vergleich ✅ (T3/T4/T6), Trichter ✅, Quellenvergleich ✅ (Kosten pro Bewerbung nur bei hinterlegtem Werbebudget — kein Budget-Feld je Quelle im Datenmodell vorhanden → entfällt, Spec macht es explizit konditional), Verlauf ✅, Bot-Leistung ✅, Aufgabenliste ✅, Jobtabelle+CSV ✅ (T5), Kundentabelle+Ampel ✅ (T7/T8), WhatsApp-Zustand ✅, Verbrauch+Kosten+Preistabelle ✅ (T1/T2/T7/T8), Alarme ✅ (P6-R3), Wochenbericht ✅ vorhanden (P6-R2, kein Code), Mandantenverwaltung ✅ existiert bereits (Admin-Bereich + Impersonation), Kennzahlen-Views → P6-R1 (TS statt SQL-Views).
2. **Platzhalter:** T3 Step 3 verweist bewusst auf die Tests als vollständige Zahlen-Spezifikation; der Kern (median/ratio/Sets) ist ausgeschrieben. Keine TBD/TODO.
3. **Typkonsistenz:** `RecruitingKpis`/`KpiTiles` (T3) → `RecruitingStatsPayload` (T4) → UI (T6); `AgencyOverviewRow` (T7) → UI (T8). Statuswerte gegen Migrationen verifiziert (appointments, jobs, applications, conversations, whatsapp_*).

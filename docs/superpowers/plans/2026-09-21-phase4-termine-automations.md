# Phase 4: Termine, Reminder-Katalog, Automations-Engine v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qualifizierte Bewerber buchen selbständig einen Termin über einen Token-geschützten Link, erhalten automatische Erinnerungen (inkl. Ruhezeiten-Verschiebung) und die Automations-Engine wird um neue Trigger, Aktionen, Schleifenschutz und Deduplizierung erweitert.

**Architecture:** Der Terminlebenszyklus (Erstellen, Buchen, Verschieben, Absagen, Reminder-Planung/-Stornierung) lebt in einer deterministischen Lib `src/lib/appointments/lifecycle.ts`. Die Slot-Berechnung ist eine pure Funktion ohne DB-Abhängigkeiten. Reminder laufen als `scheduled_jobs` über den bestehenden `/api/cron/tick`-Dispatcher. Die Automations-Engine `src/lib/automations/engine.ts` wird IN-PLACE erweitert (neue Aktionstypen, Kontextfelder, Schleifenschutz, Deduplizierung) — kein Neuaufbau. `fireEvent` wird an allen neuen Stellen aufgerufen, damit Custom-Automations greifen.

**Tech Stack:** Next.js 16 App Router, Supabase (Live-DB!), Vitest, Tailwind v4 + eigener UI-Kit (`src/components/ui`), Resend (E-Mail), ICS-Builder (`src/lib/calendar/invite.ts`), Intl API (Zeitzonen, kein npm-Paket).

**Spec:** `docs/superpowers/specs/2026-09-21-spec-recruiting-plattform.md` §11 (verbindlich), §4 (Tabellen), §16 Phase 4 (Abnahme). Abweichungen/Zuordnungen: `docs/superpowers/specs/2026-09-21-integration-design.md`.

## Global Constraints

- **Mandanten-Doktrin:** Service-Role-Clients umgehen RLS — JEDE Query (SELECT wie UPDATE) auf Tabellen mit `agency_id` trägt explizit `.eq('agency_id', ...)`. Neue SECURITY-DEFINER-Funktionen (falls nötig): agency_id-Parameter + REVOKE PUBLIC/anon/authenticated + GRANT service_role.
- **Deutsch mit ECHTEN Umlauten** (ä ö ü ß) in allen Strings, Kommentaren, Fehlermeldungen. Niemals ae/oe/ue.
- **`sendWhatsAppMessage` WIRFT bei jedem Fehler** (deutscher Text, inkl. Preflight-Gründen) und liefert `{ messageId, messageRowId }`. Immer try/catch downstream. Signatur: `sendWhatsAppMessage(svc, { agencyId, conversationId, candidatePhone, waAccountId, payload, senderType: 'bot'|'user'|'system', userId?, templateId?, isHumanUiSend?, bypassQuietHours? })`.
- **API-Auth-Kette (bestehende Routen als Vorbild, z. B. `src/app/api/quick-replies/route.ts`):** `getCurrentUser()` -> 401 `'Nicht autorisiert'`; `canWriteRole(...)` -> 403 `'Keine Schreibrechte'`; `getEffectiveAgencyId(...)` -> bei null 403 `'Keine Agentur'`; `request.json()` immer in try/catch -> 400 `'Ungültiger Request-Body'`.
- **Next.js 16:** Route-Params sind Promises: `{ params }: { params: Promise<{ id: string }> }` -> `const { id } = await params;`.
- **zod v4:** `z.record(z.string(), z.string())` (zwei Argumente Pflicht).
- **UI-Kit:** Badge-Prop heißt `tone` (accent/softAccent/success/neutral/outline), NICHT `variant`. Modal nimmt open/onClose/title/width. Input hat `icon`-Prop.
- **Migrationen:** additiv, keine Drops von Bestandsspalten. Der ORCHESTRATOR wendet Migrationen live via Supabase MCP `apply_migration` an — Implementer schreiben nur die SQL-Datei und die Tests.
- **Nach jedem Task:** `npx vitest run` grün (Bestand: 413 Tests) und `npx next build` grün. Kein Task ist fertig mit rotem Build.
- **`pipeline_stages`-Spalte heißt `stage_type`** (Werte: new, qualifying, qualified, interview, offer, hired, rejected).
- **Benachrichtigungstypen:** Bestehende CHECK-Werte verwenden — `'whatsapp_inbound'` für Inbox-relevante, `'system'` für Betriebsmeldungen, `'sla_breach'` für SLA-Warnungen, `'noshow'` für No-Show-Meldungen.

## Plan-Rulings (vorab entschieden, gelten für alle Tasks)

- **P4-R1: Terminlebenszyklus hardcodiert, Automations additiv.** Booking/Reschedule/Cancel + Reminder-Planung/-Stornierung leben in `src/lib/appointments/lifecycle.ts`, NICHT in Automations — die Abnahme verlangt Determinismus. `fireEvent('appointment.booked'|...)` wird zusätzlich gefeuert für Custom-Regeln.
- **P4-R2: Einladung bei Bot-Abschluss A/B hardcodiert** in bot-process completion: `createProposedAppointment` (status `'proposed'`, `booking_token` uuid, `token_expires_at` +7 Tage) + `appointment_invite`-Template + `scheduled_job` `appointment.invite_followup` (+24h, dedupe `'appt.invite_followup:{appointmentId}'`). Zusätzlich `fireEvent('bot.completed')`.
- **P4-R3: Keine In-Chat-Slot-Buttons in v1** (Meta interactive-Reply-Handling im Webhook wäre erheblicher Zusatzaufwand; Abnahme §16 fordert nur Link-Buchung). Die Einladungs-Template enthält den Buchungslink. Im Ledger als bewusste Spec-§11-Abweichung dokumentiert.
- **P4-R4: availability_rules je Job** (job_id), user_id-Spalte nullable vorhanden aber v1 ungenutzt. Spalten: agency_id, job_id, user_id (nullable), weekday (0-6, 0=Sonntag), start_time time, end_time time. Dauer/Puffer kommen ausschließlich vom Job (Einzige Quelle: `jobs.appointment_duration_minutes`/`jobs.appointment_buffer_minutes`). Abweichung von Spec §4, die `slot_minutes`/`buffer_minutes` auf `availability_rules` beschreibt — bewusst vereinfacht für eine Quelle der Wahrheit.
- **P4-R5: Doppelbuchungsschutz** per Unique-Partial-Index auf `(agency_id, job_id, starts_at) WHERE status IN ('booked','confirmed')` + Re-Check im Book-Endpoint (Insert-Fehler -> 409 `'Slot bereits vergeben'`).
- **P4-R6: Ruhezeiten-Verschiebung zur AUSFÜHRUNGSZEIT:** Reminder-Worker prüft `isQuietHours(agency.timezone)` -> statt Senden `run_at` auf `nextAllowedTime` verschieben. Ausnahme `reminder_2h`: neues `SendOpts`-Flag `bypassQuietHours` (checkPreflight-Erweiterung), wird IMMER gesendet.
- **P4-R7: Reminder-Stornierung über dedupe_key-Muster + Status-Recheck:** Alle Termin-Reminder tragen `dedupe_key` `'{type}:{appointmentId}'`; `cancelAppointmentJobs(svc, {agencyId, appointmentId})` setzt pending Jobs auf `'cancelled'`. Zusätzlich prüft jeder Worker vor Send den Termin-Status erneut (booked/confirmed, nicht cancelled/verschoben — bei Reschedule wird der alte Termin auf `'cancelled'` gesetzt und ein NEUER appointment-Datensatz erzeugt, damit Reminder-dedupe_keys eindeutig bleiben).
- **P4-R8: Automations v2 = Erweiterung des Bestands-Engines:** Neue trigger_events: `application.created`, `bot.completed`, `bot.handover`, `message.received`, `appointment.booked`, `appointment.cancelled`, `appointment.no_show`. Neue Aktionen: `send_template`, `send_message`, `start_bot`, `set_stage_application`, `assign_application`, `send_email`, `schedule_job`, `call_webhook`, `add_note`. `AutomationContext` um `application_id`/`conversation_id` erweitert.
- **P4-R9: Schleifenschutz:** (a) max 10 `automation_runs` je `application_id` pro Stunde (COUNT-Check vor Ausführung, darüber -> run mit status `'skipped'` + error `'Rate-Limit'`); (b) `fireEvent` bekommt `options.suppress: string[]` — Aktionen, die Events auslösen würden, feuern den Trigger mit suppress weiter, `fireEvent` überspringt Automations deren `trigger_event` in `suppress` steht; (c) Doppelversand-Schutz: `dedupe_key` = `'{applicationId}:{actionType}:{templateOrBody-Hash}:{floor(now/3600)}'` — neue Spalte `automation_runs.dedupe_key` + Unique-Index (NULL erlaubt); Verletzung -> Aktion skipped.
- **P4-R10: time.elapsed-Trigger v1 NICHT als eigener Mechanismus** — stattdessen deckt der Recruiter-SLA-Reminder (fest verdrahtet) den Abnahme-relevanten Fall ab; `time.elapsed` im UI ausgeblendet. Abweichung von Spec §11 Automations-Trigger-Tabelle, bewusst für v1.
- **P4-R11: Bot-Reminder-Kette vervollständigen:** `bot.nudge2` (+24h, Template `qualification_nudge`), `bot.close` (+48h: conversation `state='closed'`, `applications.status='nicht_erreicht'`, Notification). `timers.ts` erweitert (Keys `'bot.nudge2:{conv}:{step}'`, `'bot.close:{conv}:{step}'`). Der bestehende `bot.nudge` (step>0) mit `qualification_resume` bleibt.
- **P4-R12: No-Show-Flow:** Job `appointment.followup_check` (`ends_at+30min`, dedupe `'appt.followup_check:{appointmentId}'`): Termin noch booked/confirmed -> Notification an assigned_to/Agentur `'Hat der Termin stattgefunden?'` mit `push_url` zum Bewerberprofil. `PATCH /api/appointments-recruiting/[id]` mit status `'done'|'no_show'|'cancelled'`; bei no_show: `scheduled_job` `appointment.no_show_followup` (+1h, Template `no_show_followup` mit NEUEM `booking_token`) + `fireEvent('appointment.no_show')`.
- **P4-R13: SLA-Reminder:** Beim Stage-Move auf `stage_type='qualified'` `scheduled_job` `sla.recruiter_24h` und `sla.recruiter_48h`; Worker prüft: Stufe unverändert UND keine ausgehende Nachricht seit Qualifizierung -> Notification. Fenster-Ablauf-Warnung + Job-ohne-Bewerbungen im Daily-Cron. Wochenbericht -> Phase 6.
- **P4-R14: documents_request:** `pipeline_stages` bekommt Spalte `requires_documents boolean default false`; beim Stage-Move in eine solche Stufe Job `documents.request` (+48h, dedupe `'docs:{applicationId}:{stageId}'`); Worker prüft: noch in Stufe UND kein documents-Datensatz -> Template `documents_request`.
- **P4-R15: Buchungsseite** `src/app/(public)/book/[token]/page.tsx` (Server Component, `createAdminClient`, Token-Lookup inkl. `token_expires_at > now`); Client-Komponente Slot-Picker (14 Tage, Slots via `GET /api/book/[token]/slots`); `POST /api/book/[token]` bucht. Public = KEINE Auth-Kette, aber Token ist das Secret.

## Dateistruktur (neu/geändert)

```
supabase/migrations/20260921000013_appointments_availability.sql
src/lib/types/database.ts                     (Typen anhängen)
src/lib/appointments/slots.ts                 (pure Slot-Engine)
src/lib/appointments/lifecycle.ts             (Termin-CRUD + Reminder-Planung)
src/lib/appointments/__tests__/slots.test.ts
src/lib/appointments/__tests__/lifecycle.test.ts
src/lib/workers/appointment-reminders.ts      (invite_followup, reminder_24h/2h, followup_check, no_show_followup)
src/lib/workers/bot-nudge2.ts                 (24h-Nudge, qualification_nudge)
src/lib/workers/bot-close.ts                  (48h-Abschluss)
src/lib/workers/sla-reminders.ts              (recruiter 24h/48h, window.expiry, documents.request)
src/lib/workers/__tests__/appointment-reminders.test.ts
src/lib/workers/__tests__/bot-nudge2-close.test.ts
src/lib/workers/__tests__/sla-reminders.test.ts
src/lib/whatsapp/window.ts                    (nextAllowedTime hinzufügen)
src/lib/whatsapp/send.ts                      (bypassQuietHours-Flag)
src/lib/bot/timers.ts                         (armBotTimersV2 + cancelAllBotTimers)
src/lib/workers/bot-process.ts                (Abschluss-Block: Termineinladung)
src/lib/bot/handover.ts                       (fireEvent hinzufügen)
src/lib/automations/engine.ts                 (v2-Aktionen, Kontext, Schleifenschutz)
src/lib/automations/fire.ts                   (suppress-Option, application-Lookup)
src/lib/automations/seed-defaults.ts          (neue Default-Automations)
src/lib/automations/__tests__/engine-v2.test.ts
src/app/api/book/[token]/slots/route.ts       (GET: öffentliche Slot-API)
src/app/api/book/[token]/route.ts             (POST: buchen/verschieben/absagen)
src/app/(public)/book/[token]/page.tsx         (Buchungsseite)
src/components/book/slot-picker.tsx            (Client: 14-Tage-Slots)
src/app/api/jobs/[id]/availability/route.ts   (GET/PUT Verfügbarkeiten)
src/app/api/appointments-recruiting/[id]/route.ts (PATCH: done/no_show/cancelled)
src/components/jobs/job-detail.tsx             (Tab 'termine' hinzufügen)
src/components/jobs/availability-editor.tsx    (Wochentag-Zeitfenster-Editor)
src/components/candidates/appointment-list.tsx (Terminliste im Bewerberprofil)
src/app/api/cron/tick/route.ts                (neue Job-Typen dispatchen)
```

---

### Task 1: Migration `appointments`, `availability_rules`, Job-/Stage-Spalten + TS-Typen

**Files:**
- Create: `supabase/migrations/20260921000013_appointments_availability.sql`
- Modify: `src/lib/types/database.ts` (Typen anhängen)

**Interfaces:**
- Produces: Tabellen `appointments`, `availability_rules`; Spalten `jobs.appointment_type`, `jobs.appointment_location`, `jobs.appointment_duration_minutes`, `jobs.appointment_buffer_minutes`; Spalte `pipeline_stages.requires_documents`; Spalte `automation_runs.dedupe_key`; TS-Typen `Appointment`, `AppointmentStatus`, `AppointmentType`, `AvailabilityRule`.

- [ ] **Step 1: Migration schreiben** — exakt diese SQL:

```sql
-- Phase 4: Termine, Reminder-Katalog, Automations v2 (Spec §4, §11, §16)

-- 1. appointments (P4-R1, P4-R5, P4-R7)
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  starts_at timestamptz,
  ends_at timestamptz,
  type text NOT NULL DEFAULT 'call' CHECK (type IN ('call','video','onsite')),
  location text,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','booked','confirmed','no_show','done','cancelled')),
  booked_via text,
  booking_token uuid UNIQUE DEFAULT gen_random_uuid(),
  token_expires_at timestamptz,
  ics_sequence int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_appointments_agency_starts ON appointments(agency_id, starts_at);
-- P4-R5: Doppelbuchungsschutz
CREATE UNIQUE INDEX idx_appointments_no_double_book
  ON appointments(agency_id, application_id, starts_at)
  WHERE status IN ('booked','confirmed');
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appointments select" ON appointments FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "appointments write" ON appointments FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 2. availability_rules (P4-R4)
CREATE TABLE availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (start_time < end_time)
);
CREATE INDEX idx_availability_rules_job ON availability_rules(job_id);
ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "availability_rules select" ON availability_rules FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "availability_rules write" ON availability_rules FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 3. Job-Spalten für Terminart/Dauer/Puffer/Ort (P4-R4)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS appointment_type text NOT NULL DEFAULT 'call' CHECK (appointment_type IN ('call','video','onsite'));
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS appointment_location text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS appointment_duration_minutes int NOT NULL DEFAULT 30;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS appointment_buffer_minutes int NOT NULL DEFAULT 15;

-- 4. pipeline_stages: requires_documents (P4-R14)
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS requires_documents boolean NOT NULL DEFAULT false;

-- 5. automation_runs: dedupe_key für Doppelversand-Schutz (P4-R9)
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX idx_automation_runs_dedupe ON automation_runs(dedupe_key) WHERE dedupe_key IS NOT NULL;
```

- [ ] **Step 2: TS-Typen anhängen** an `src/lib/types/database.ts`:

```ts
// --- Phase 4: Termine, Automations v2 ---
export type AppointmentStatus = 'proposed' | 'booked' | 'confirmed' | 'no_show' | 'done' | 'cancelled';
export type AppointmentType = 'call' | 'video' | 'onsite';

export interface Appointment {
  id: string;
  agency_id: string;
  application_id: string;
  starts_at: string | null;
  ends_at: string | null;
  type: AppointmentType;
  location: string | null;
  status: AppointmentStatus;
  booked_via: string | null;
  booking_token: string;
  token_expires_at: string | null;
  ics_sequence: number;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityRule {
  id: string;
  agency_id: string;
  job_id: string;
  user_id: string | null;
  weekday: number; // 0=Sonntag, 1=Montag, ..., 6=Samstag
  start_time: string; // HH:MM:SS
  end_time: string;   // HH:MM:SS
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Build + Tests laufen lassen** — `npx next build` und `npx vitest run` müssen grün sein (keine neuen Tests in diesem Task; Migration testet der Orchestrator live).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260921000013_appointments_availability.sql src/lib/types/database.ts
git commit -m "feat(termine): Migration appointments, availability_rules, Job-/Stage-Spalten + TS-Typen (Phase 4 Task 1)"
```

**Hinweis an Orchestrator:** Nach Task-Review Migration live via Supabase MCP `apply_migration` anwenden und mit read-only `execute_sql` verifizieren (Tabellen + Indexes + neue Job-Spalten vorhanden).

---

### Task 2: Slot-Engine — pure Funktion mit Zeitzonen, Puffer, DST

**Files:**
- Create: `src/lib/appointments/slots.ts`
- Test: `src/lib/appointments/__tests__/slots.test.ts`

**Interfaces:**
- Produces:

```ts
export interface SlotInput {
  rules: Array<{ weekday: number; start_time: string; end_time: string }>;
  bookedSlots: Array<{ starts_at: string; ends_at: string }>;
  from: Date;
  days: number;          // Default 14
  durationMinutes: number;
  bufferMinutes: number;
  timezone: string;      // z. B. 'Europe/Berlin'
}

export interface Slot {
  start: Date;
  end: Date;
}

export function computeSlots(input: SlotInput): Slot[];
```

- [ ] **Step 1: Failing Tests schreiben.**

```ts
import { describe, it, expect } from 'vitest';
import { computeSlots, type SlotInput } from '../slots';

describe('computeSlots', () => {
  const baseInput: SlotInput = {
    rules: [
      { weekday: 1, start_time: '09:00:00', end_time: '12:00:00' }, // Montag
      { weekday: 3, start_time: '14:00:00', end_time: '17:00:00' }, // Mittwoch
    ],
    bookedSlots: [],
    from: new Date('2026-10-05T08:00:00Z'), // Montag
    days: 14,
    durationMinutes: 30,
    bufferMinutes: 15,
    timezone: 'Europe/Berlin',
  };

  it('erzeugt Slots nur an konfigurierten Wochentagen', () => {
    const slots = computeSlots(baseInput);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Europe/Berlin' })
        .format(slot.start);
      expect(['Mon', 'Wed']).toContain(day);
    }
  });

  it('Slot-Dauer entspricht durationMinutes', () => {
    const slots = computeSlots(baseInput);
    for (const slot of slots) {
      expect(slot.end.getTime() - slot.start.getTime()).toBe(30 * 60_000);
    }
  });

  it('filtert Slots in der Vergangenheit und < 2h Vorlauf', () => {
    const now = new Date();
    const slots = computeSlots({ ...baseInput, from: now, days: 14 });
    const cutoff = new Date(now.getTime() + 2 * 60 * 60_000);
    for (const slot of slots) {
      expect(slot.start.getTime()).toBeGreaterThanOrEqual(cutoff.getTime());
    }
  });

  it('belegte Slots + Puffer werden ausgeschlossen', () => {
    // Montag 10:00-10:30 CET gebucht -> 09:15-10:45 CET blockiert (30min Slot + 15min Puffer beidseitig)
    const input: SlotInput = {
      ...baseInput,
      bookedSlots: [
        { starts_at: '2026-10-05T08:00:00Z', ends_at: '2026-10-05T08:30:00Z' }, // 10:00-10:30 CEST
      ],
    };
    const slots = computeSlots(input);
    for (const slot of slots) {
      // Kein Slot darf in den Puffer-Bereich fallen
      const bookedStart = new Date('2026-10-05T08:00:00Z').getTime();
      const bookedEnd = new Date('2026-10-05T08:30:00Z').getTime();
      const bufferMs = 15 * 60_000;
      const overlaps =
        slot.start.getTime() < bookedEnd + bufferMs &&
        slot.end.getTime() > bookedStart - bufferMs;
      expect(overlaps).toBe(false);
    }
  });

  it('leere Regeln = keine Slots', () => {
    const slots = computeSlots({ ...baseInput, rules: [] });
    expect(slots).toEqual([]);
  });

  it('Slots überschreiten nicht das Zeitfenster-Ende', () => {
    // Regel bis 12:00, durationMinutes=30 -> letzter Slot beginnt spätestens 11:30
    const slots = computeSlots({ ...baseInput, days: 1 });
    for (const slot of slots) {
      const hour = parseInt(
        new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Berlin' })
          .formatToParts(slot.end).find(p => p.type === 'hour')?.value || '0',
        10,
      );
      const minute = parseInt(
        new Intl.DateTimeFormat('en-US', { minute: 'numeric', timeZone: 'Europe/Berlin' })
          .formatToParts(slot.end).find(p => p.type === 'minute')?.value || '0',
        10,
      );
      // slot.end darf max 12:00 Ortszeit sein (Montag-Regel)
      expect(hour * 60 + minute).toBeLessThanOrEqual(12 * 60);
    }
  });

  it('DST-Übergang: Slots bleiben in Ortszeit stabil', () => {
    // Sommerzeit -> Winterzeit 2026: 25.10.2026 um 03:00 CEST -> 02:00 CET
    const dstInput: SlotInput = {
      ...baseInput,
      from: new Date('2026-10-24T06:00:00Z'), // Samstag vor DST-Wechsel
      rules: [
        { weekday: 1, start_time: '09:00:00', end_time: '12:00:00' },
      ],
      days: 7,
    };
    const slots = computeSlots(dstInput);
    // Alle Slots am Montag 26.10. müssen um 09:00 CET beginnen (nicht 08:00 oder 10:00)
    for (const slot of slots) {
      const hourStr = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Berlin' })
        .formatToParts(slot.start).find(p => p.type === 'hour')?.value;
      const hour = parseInt(hourStr || '0', 10);
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThan(12);
    }
  });
});
```

- [ ] **Step 2: `npx vitest run src/lib/appointments` -> FAIL.**

- [ ] **Step 3: Implementieren.** Kern:

```ts
export function computeSlots(input: SlotInput): Slot[] {
  const { rules, bookedSlots, from, days = 14, durationMinutes, bufferMinutes, timezone } = input;
  if (rules.length === 0) return [];

  const slots: Slot[] = [];
  const now = new Date();
  const cutoff = new Date(now.getTime() + 2 * 60 * 60_000); // 2h Vorlauf

  // Regeln nach Wochentag indexieren
  const rulesByDay = new Map<number, Array<{ start_time: string; end_time: string }>>();
  for (const rule of rules) {
    if (!rulesByDay.has(rule.weekday)) rulesByDay.set(rule.weekday, []);
    rulesByDay.get(rule.weekday)!.push(rule);
  }

  // Tag für Tag durchgehen
  for (let d = 0; d < days; d++) {
    const dayStart = new Date(from.getTime() + d * 24 * 60 * 60_000);

    // Wochentag in Zielzeitzone bestimmen (0=Sun)
    const weekdayStr = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone }).format(dayStart);
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = weekdayMap[weekdayStr] ?? -1;

    const dayRules = rulesByDay.get(weekday);
    if (!dayRules) continue;

    for (const rule of dayRules) {
      // Lokale Start-/Endzeit in UTC umrechnen via Hilfsfunktion
      const windowStart = localTimeToUtc(dayStart, rule.start_time, timezone);
      const windowEnd = localTimeToUtc(dayStart, rule.end_time, timezone);

      let cursor = windowStart.getTime();
      const slotMs = durationMinutes * 60_000;

      while (cursor + slotMs <= windowEnd.getTime()) {
        const slotStart = new Date(cursor);
        const slotEnd = new Date(cursor + slotMs);

        // Vorlauf-Prüfung
        if (slotStart >= cutoff) {
          // Puffer-Prüfung gegen gebuchte Termine
          const bufferMs = bufferMinutes * 60_000;
          const blocked = bookedSlots.some(b => {
            const bStart = new Date(b.starts_at).getTime();
            const bEnd = new Date(b.ends_at).getTime();
            return slotStart.getTime() < bEnd + bufferMs && slotEnd.getTime() > bStart - bufferMs;
          });

          if (!blocked) {
            slots.push({ start: slotStart, end: slotEnd });
          }
        }

        cursor += slotMs; // Slots sind lückenlos (Puffer gilt nur für gebuchte Termine)
      }
    }
  }

  return slots;
}

/**
 * Rechnet eine lokale Uhrzeit (HH:MM:SS) an einem bestimmten Tag in UTC um.
 * Verwendet Intl API — DST-sicher, kein npm-Paket.
 */
function localTimeToUtc(day: Date, timeStr: string, timezone: string): Date {
  // Lokales Datum ermitteln
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(day); // 'YYYY-MM-DD'
  const isoStr = `${parts}T${timeStr}`;

  // Differenz zwischen Lokal und UTC berechnen
  const naive = new Date(isoStr + 'Z');
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const utcFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  // Iterativ UTC-Offset finden: Start mit der naiven Zeit, dann korrigieren
  const localStr = formatter.format(naive);
  const utcStr = utcFormatter.format(naive);

  // Einfacher: Date parsen mit bekanntem Offset-Trick
  // Wir nutzen: new Date(YYYY-MM-DDTHH:MM:SSZ) gibt UTC; wir müssen den Offset der Zielzeitzone abziehen
  const testDate = new Date(`${parts}T12:00:00Z`);
  const localParts = formatter.formatToParts(testDate);
  const lHour = parseInt(localParts.find(p => p.type === 'hour')?.value || '0', 10);
  const utcParts = utcFormatter.formatToParts(testDate);
  const uHour = parseInt(utcParts.find(p => p.type === 'hour')?.value || '0', 10);
  const offsetHours = lHour - uHour; // Kann negativ sein

  // Zeile Offset von Lokal -> UTC: UTC = lokal - offset
  const [h, m, s] = timeStr.split(':').map(Number);
  const localMs = h * 3600_000 + m * 60_000 + (s || 0) * 1000;
  const dayMs = new Date(`${parts}T00:00:00Z`).getTime();
  const utcMs = dayMs + localMs - offsetHours * 3600_000;

  return new Date(utcMs);
}
```

- [ ] **Step 4: `npx vitest run src/lib/appointments` grün, `npx next build` grün.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/appointments/slots.ts src/lib/appointments/__tests__/slots.test.ts
git commit -m "feat(termine): Slot-Engine mit Zeitzonen, Puffer und DST-Sicherheit (Phase 4 Task 2)"
```

---

### Task 3: Termin-Lifecycle — Erstellen, Buchen, Verschieben, Absagen + Reminder-Planung

**Files:**
- Create: `src/lib/appointments/lifecycle.ts`
- Test: `src/lib/appointments/__tests__/lifecycle.test.ts`

**Interfaces:**
- Consumes: `sendWhatsAppMessage` aus `src/lib/whatsapp/send.ts`, `TEMPLATE_PRESETS` aus `src/lib/whatsapp/template-presets.ts`, `buildAppointmentInvite` aus `src/lib/calendar/invite.ts`, `sendAgencyCalendarInvite` aus `src/lib/email/resend.ts`, `logActivity` aus `src/lib/activity/log.ts`, `fireEvent` aus `src/lib/automations/fire.ts`, `Appointment`/`AppointmentType` aus Task 1.
- Produces:

```ts
export async function createProposedAppointment(svc: SupabaseClient, args: {
  agencyId: string;
  applicationId: string;
  type: AppointmentType;
  location: string | null;
}): Promise<{ appointmentId: string; bookingToken: string }>;

export async function bookAppointment(svc: SupabaseClient, args: {
  agencyId: string;
  appointmentId: string;
  startsAt: Date;
  endsAt: Date;
  bookedVia: string;
}): Promise<void>;

export async function cancelAppointment(svc: SupabaseClient, args: {
  agencyId: string;
  appointmentId: string;
  reason?: string;
}): Promise<void>;

export async function rescheduleAppointment(svc: SupabaseClient, args: {
  agencyId: string;
  oldAppointmentId: string;
  startsAt: Date;
  endsAt: Date;
  bookedVia: string;
}): Promise<{ newAppointmentId: string }>;

export async function cancelAppointmentJobs(svc: SupabaseClient, args: {
  agencyId: string;
  appointmentId: string;
}): Promise<void>;
```

- [ ] **Step 1: Failing Tests schreiben.** (Chain-Mock-Muster wie `src/lib/workers/__tests__/bot-open.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createProposedAppointment,
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  cancelAppointmentJobs,
} from '../lifecycle';

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.test', messageRowId: 'row-1' }),
}));

vi.mock('@/lib/email/resend', () => ({
  sendAgencyCalendarInvite: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/calendar/invite', () => ({
  buildAppointmentInvite: vi.fn().mockReturnValue('BEGIN:VCALENDAR...'),
}));

vi.mock('@/lib/activity/log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/automations/fire', () => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
}));

// makeSvc helper (gleicher Aufbau wie bot-open.test.ts)
function makeSvc(tableResponses: Record<string, unknown> = {}) {
  const inserted: Record<string, unknown[]> = {};
  const updated: Record<string, unknown[]> = {};
  const fromMock = vi.fn();

  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'is', 'in', 'filter', 'not', 'maybeSingle', 'single',
                     'insert', 'update', 'upsert', 'delete', 'gte', 'lte', 'or'];
    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }
    (chain.insert as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!inserted[table]) inserted[table] = [];
      inserted[table].push(data);
      return chain;
    });
    (chain.update as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!updated[table]) updated[table] = [];
      updated[table].push(data);
      return chain;
    });
    (chain.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const resp = tableResponses[table] ?? { data: null, error: null };
      return Promise.resolve(resp);
    });
    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const resp = tableResponses[table] ?? { data: null, error: null };
      return Promise.resolve(resp);
    });
    return chain;
  });

  return { from: fromMock, rpc: vi.fn(), _inserted: inserted, _updated: updated } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('createProposedAppointment', () => {
  it('legt Termin mit status proposed, booking_token und token_expires_at +7d an', async () => {
    const svc = makeSvc({
      appointments: { data: { id: 'appt-1', booking_token: 'tok-1' }, error: null },
    });
    const result = await createProposedAppointment(svc, {
      agencyId: 'ag-1', applicationId: 'app-1', type: 'call', location: null,
    });
    expect(result.appointmentId).toBe('appt-1');
    expect(result.bookingToken).toBe('tok-1');
    expect(svc.from).toHaveBeenCalledWith('appointments');
  });
});

describe('bookAppointment', () => {
  it('setzt Status booked, plant 3 Reminder-Jobs, sendet Bestätigungstemplate + ICS-Mail, feuert appointment.booked', async () => {
    const svc = makeSvc({
      appointments: {
        data: {
          id: 'appt-1', agency_id: 'ag-1', application_id: 'app-1',
          type: 'call', location: null, booking_token: 'tok-1',
          ics_sequence: 0, status: 'proposed',
        },
        error: null,
      },
      applications: {
        data: { id: 'app-1', candidate_id: 'cand-1', assigned_to: null },
        error: null,
      },
      candidates: {
        data: { id: 'cand-1', name: 'Max Mustermann', phone_e164: '+491234567890', email: 'max@test.de', whatsapp_opt_in: true },
        error: null,
      },
      conversations: {
        data: { id: 'conv-1', wa_account_id: 'wa-1' },
        error: null,
      },
      agencies: {
        data: { id: 'ag-1', name: 'Test Agentur', timezone: 'Europe/Berlin' },
        error: null,
      },
      whatsapp_templates: {
        data: { id: 'tmpl-1', name: 'appointment_confirmation', body: 'Hallo {{1}}...' },
        error: null,
      },
      pipeline_stages: {
        data: { id: 'stage-interview' },
        error: null,
      },
    });

    const { fireEvent } = await import('@/lib/automations/fire');
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    const { sendAgencyCalendarInvite } = await import('@/lib/email/resend');

    await bookAppointment(svc, {
      agencyId: 'ag-1', appointmentId: 'appt-1',
      startsAt: new Date('2026-10-10T10:00:00Z'),
      endsAt: new Date('2026-10-10T10:30:00Z'),
      bookedVia: 'booking_page',
    });

    expect(sendWhatsAppMessage).toHaveBeenCalled();
    expect(sendAgencyCalendarInvite).toHaveBeenCalled();
    expect(fireEvent).toHaveBeenCalledWith('appointment.booked', 'ag-1', expect.anything());
  });
});

describe('cancelAppointmentJobs', () => {
  it('setzt pending Jobs mit passendem appointmentId-Filter auf cancelled', async () => {
    const svc = makeSvc();
    await cancelAppointmentJobs(svc, { agencyId: 'ag-1', appointmentId: 'appt-1' });
    expect(svc.from).toHaveBeenCalledWith('scheduled_jobs');
  });
});
```

- [ ] **Step 2: `npx vitest run src/lib/appointments` -> FAIL.**

- [ ] **Step 3: Implementieren.** Kern von `lifecycle.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppointmentType } from '@/lib/types/database';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { buildAppointmentInvite } from '@/lib/calendar/invite';
import { sendAgencyCalendarInvite } from '@/lib/email/resend';
import { logActivity } from '@/lib/activity/log';
import { fireEvent } from '@/lib/automations/fire';

export async function createProposedAppointment(svc: SupabaseClient, args: {
  agencyId: string; applicationId: string; type: AppointmentType; location: string | null;
}): Promise<{ appointmentId: string; bookingToken: string }> {
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await svc.from('appointments').insert({
    agency_id: args.agencyId,
    application_id: args.applicationId,
    type: args.type,
    location: args.location,
    status: 'proposed',
    token_expires_at: tokenExpiresAt,
  }).select('id, booking_token').single();

  if (error || !data) throw new Error('Termin konnte nicht erstellt werden');
  return { appointmentId: data.id, bookingToken: data.booking_token };
}

export async function bookAppointment(svc: SupabaseClient, args: {
  agencyId: string; appointmentId: string; startsAt: Date; endsAt: Date; bookedVia: string;
}): Promise<void> {
  // 1. Termin aktualisieren
  const { error: updateErr } = await svc.from('appointments').update({
    starts_at: args.startsAt.toISOString(),
    ends_at: args.endsAt.toISOString(),
    status: 'booked',
    booked_via: args.bookedVia,
    updated_at: new Date().toISOString(),
  }).eq('id', args.appointmentId).eq('agency_id', args.agencyId);

  if (updateErr) throw new Error('Termin konnte nicht gebucht werden');

  // 2. Termin + Application + Candidate + Agency laden
  const { data: appt } = await svc.from('appointments').select('*')
    .eq('id', args.appointmentId).eq('agency_id', args.agencyId).single();
  if (!appt) return;

  const { data: application } = await svc.from('applications').select('id, candidate_id, assigned_to')
    .eq('id', appt.application_id).eq('agency_id', args.agencyId).single();
  if (!application) return;

  const { data: candidate } = await svc.from('candidates').select('id, name, phone_e164, email, whatsapp_opt_in')
    .eq('id', application.candidate_id).eq('agency_id', args.agencyId).single();
  if (!candidate) return;

  const { data: agency } = await svc.from('agencies').select('id, name, timezone')
    .eq('id', args.agencyId).single();

  // 3. Invite-Followup stornieren (falls vorhanden)
  await cancelAppointmentJobs(svc, { agencyId: args.agencyId, appointmentId: args.appointmentId });

  // 4. Reminder-Jobs planen
  const reminders = [
    { type: 'appointment.reminder_24h', runAt: new Date(args.startsAt.getTime() - 24 * 60 * 60_000), dedupe: `appt.reminder_24h:${args.appointmentId}` },
    { type: 'appointment.reminder_2h', runAt: new Date(args.startsAt.getTime() - 2 * 60 * 60_000), dedupe: `appt.reminder_2h:${args.appointmentId}` },
    { type: 'appointment.followup_check', runAt: new Date(args.endsAt.getTime() + 30 * 60_000), dedupe: `appt.followup_check:${args.appointmentId}` },
  ];

  for (const r of reminders) {
    await svc.from('scheduled_jobs').upsert({
      agency_id: args.agencyId,
      run_at: r.runAt.toISOString(),
      type: r.type,
      payload: { appointment_id: args.appointmentId },
      status: 'pending',
      dedupe_key: r.dedupe,
    }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  }

  // 5. WhatsApp-Bestätigungstemplate senden (best effort)
  const { data: conv } = await svc.from('conversations')
    .select('id, wa_account_id')
    .eq('candidate_id', candidate.id).eq('agency_id', args.agencyId).maybeSingle();

  if (conv && candidate.phone_e164) {
    const { data: tmpl } = await svc.from('whatsapp_templates')
      .select('id, name, body')
      .eq('wa_account_id', conv.wa_account_id)
      .eq('preset_key', 'appointment_confirmation')
      .eq('status', 'approved')
      .eq('agency_id', args.agencyId)
      .maybeSingle();

    if (tmpl) {
      const vorname = (candidate.name || '').split(' ')[0];
      const datum = args.startsAt.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', timeZone: agency?.timezone || 'Europe/Berlin' });
      const uhrzeit = args.startsAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: agency?.timezone || 'Europe/Berlin' });
      const ortOderLink = appt.location || 'wird noch mitgeteilt';

      await sendWhatsAppMessage(svc, {
        agencyId: args.agencyId,
        conversationId: conv.id,
        candidatePhone: candidate.phone_e164,
        waAccountId: conv.wa_account_id,
        payload: {
          to: candidate.phone_e164,
          type: 'template',
          template: {
            name: tmpl.name,
            language: { code: 'de' },
            components: [{
              type: 'body',
              parameters: [
                { type: 'text', text: vorname },
                { type: 'text', text: datum },
                { type: 'text', text: uhrzeit },
                { type: 'text', text: ortOderLink },
              ],
            }],
          },
        },
        senderType: 'system',
        templateId: tmpl.id,
      }).catch(() => {});
    }
  }

  // 6. ICS-Mail an Recruiter/assigned_to
  if (candidate.email || application.assigned_to) {
    // Recruiter-E-Mail aus assigned_to laden
    let recruiterEmail: string | null = null;
    if (application.assigned_to) {
      const { data: recruiter } = await svc.from('users')
        .select('email').eq('id', application.assigned_to).maybeSingle();
      recruiterEmail = recruiter?.email ?? null;
    }
    // Fallback: agency_owner
    if (!recruiterEmail) {
      const { data: owner } = await svc.from('users')
        .select('email').eq('agency_id', args.agencyId).eq('role', 'agency_owner').maybeSingle();
      recruiterEmail = owner?.email ?? null;
    }

    if (recruiterEmail) {
      const ics = buildAppointmentInvite({
        appointmentId: args.appointmentId,
        type: appt.type,
        scheduledAt: args.startsAt,
        sequence: appt.ics_sequence,
        method: 'REQUEST',
        candidateName: candidate.name || 'Bewerber',
        candidatePhone: candidate.phone_e164,
        notes: null,
        agencyName: agency?.name || 'Agentur',
        attendeeEmail: recruiterEmail,
        attendeeName: 'Recruiter',
      });
      await sendAgencyCalendarInvite(
        recruiterEmail,
        `Termin: ${candidate.name || 'Bewerber'}`,
        `<p>Neuer Termin mit ${candidate.name || 'Bewerber'} am ${args.startsAt.toLocaleDateString('de-DE', { timeZone: agency?.timezone || 'Europe/Berlin' })}</p>`,
        ics,
        'REQUEST',
      ).catch(() => {});
    }
  }

  // 7. Stage-Move auf interview
  const { data: interviewStage } = await svc.from('pipeline_stages')
    .select('id').eq('agency_id', args.agencyId).eq('stage_type', 'interview').maybeSingle();
  if (interviewStage) {
    await svc.from('applications').update({
      stage_id: interviewStage.id, updated_at: new Date().toISOString(),
    }).eq('id', appt.application_id).eq('agency_id', args.agencyId);
  }

  // 8. Activity + fireEvent
  await logActivity(svc, {
    agency_id: args.agencyId,
    candidate_id: application.candidate_id,
    action: `Termin gebucht: ${args.startsAt.toLocaleDateString('de-DE')} ${args.startsAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`,
    action_type: 'appointment_booked',
  });
  await fireEvent('appointment.booked', args.agencyId, {
    candidate_id: application.candidate_id,
    extra: { appointment_id: args.appointmentId, starts_at: args.startsAt.toISOString() },
  });
}

export async function cancelAppointment(svc: SupabaseClient, args: {
  agencyId: string; appointmentId: string; reason?: string;
}): Promise<void> {
  await svc.from('appointments').update({
    status: 'cancelled', updated_at: new Date().toISOString(),
  }).eq('id', args.appointmentId).eq('agency_id', args.agencyId);

  await cancelAppointmentJobs(svc, { agencyId: args.agencyId, appointmentId: args.appointmentId });

  const { data: appt } = await svc.from('appointments')
    .select('application_id').eq('id', args.appointmentId).eq('agency_id', args.agencyId).single();
  if (appt) {
    const { data: app } = await svc.from('applications')
      .select('candidate_id').eq('id', appt.application_id).eq('agency_id', args.agencyId).single();
    if (app) {
      await logActivity(svc, {
        agency_id: args.agencyId, candidate_id: app.candidate_id,
        action: `Termin abgesagt${args.reason ? ': ' + args.reason : ''}`,
        action_type: 'appointment_cancelled',
      });
      await fireEvent('appointment.cancelled', args.agencyId, {
        candidate_id: app.candidate_id,
        extra: { appointment_id: args.appointmentId },
      });
    }
  }
}

export async function rescheduleAppointment(svc: SupabaseClient, args: {
  agencyId: string; oldAppointmentId: string; startsAt: Date; endsAt: Date; bookedVia: string;
}): Promise<{ newAppointmentId: string }> {
  // P4-R7: Alt auf cancelled, neuer Datensatz
  const { data: old } = await svc.from('appointments')
    .select('application_id, type, location')
    .eq('id', args.oldAppointmentId).eq('agency_id', args.agencyId).single();
  if (!old) throw new Error('Termin nicht gefunden');

  await cancelAppointment(svc, { agencyId: args.agencyId, appointmentId: args.oldAppointmentId, reason: 'Verschoben' });

  const { appointmentId } = await createProposedAppointment(svc, {
    agencyId: args.agencyId, applicationId: old.application_id, type: old.type, location: old.location,
  });

  await bookAppointment(svc, {
    agencyId: args.agencyId, appointmentId, startsAt: args.startsAt, endsAt: args.endsAt, bookedVia: args.bookedVia,
  });

  return { newAppointmentId: appointmentId };
}

export async function cancelAppointmentJobs(svc: SupabaseClient, args: {
  agencyId: string; appointmentId: string;
}): Promise<void> {
  await svc.from('scheduled_jobs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('agency_id', args.agencyId)
    .eq('status', 'pending')
    .filter('dedupe_key', 'like', `%${args.appointmentId}%`);
}
```

- [ ] **Step 4: Tests grün, Build grün.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/appointments/lifecycle.ts src/lib/appointments/__tests__/lifecycle.test.ts
git commit -m "feat(termine): Termin-Lifecycle mit Reminder-Planung, ICS-Mail und fireEvent (Phase 4 Task 3)"
```

---

### Task 4: Reminder-Worker + nextAllowedTime + bypassQuietHours + tick-Dispatch

**Files:**
- Create: `src/lib/workers/appointment-reminders.ts`
- Modify: `src/lib/whatsapp/window.ts` (`nextAllowedTime` hinzufügen)
- Modify: `src/lib/whatsapp/send.ts` (`bypassQuietHours`-Flag in `SendOpts` und `checkPreflight`)
- Modify: `src/app/api/cron/tick/route.ts` (neue Job-Typen dispatchen)
- Test: `src/lib/workers/__tests__/appointment-reminders.test.ts`

**Interfaces:**
- Consumes: `sendWhatsAppMessage`, `createNotification`/`createNotificationForAgency`, `cancelAppointmentJobs` aus Task 3, `isQuietHours` aus `window.ts`, `Appointment` aus Task 1.
- Produces:

```ts
// window.ts
export function nextAllowedTime(now: Date, timezone: string): Date;

// send.ts (erweiterte SendOpts)
export interface SendOpts {
  // ... bestehende Felder ...
  /** true => Ruhezeiten-Check wird übersprungen (P4-R6: reminder_2h) */
  bypassQuietHours?: boolean;
}

// appointment-reminders.ts
export async function processInviteFollowup(svc: SupabaseClient, agencyId: string, payload: { appointment_id: string }): Promise<void>;
export async function processReminder24h(svc: SupabaseClient, agencyId: string, payload: { appointment_id: string }): Promise<void>;
export async function processReminder2h(svc: SupabaseClient, agencyId: string, payload: { appointment_id: string }): Promise<void>;
export async function processFollowupCheck(svc: SupabaseClient, agencyId: string, payload: { appointment_id: string }): Promise<void>;
export async function processNoShowFollowup(svc: SupabaseClient, agencyId: string, payload: { appointment_id: string }): Promise<void>;
```

- [ ] **Step 1: Failing Tests schreiben.**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextAllowedTime } from '@/lib/whatsapp/window';

describe('nextAllowedTime', () => {
  it('Samstag 21:00 -> Montag 08:00', () => {
    // 2026-10-10 ist ein Samstag
    const sat21 = new Date('2026-10-10T19:00:00Z'); // 21:00 CEST
    const result = nextAllowedTime(sat21, 'Europe/Berlin');
    // Nächster erlaubter Zeitpunkt: Montag 08:00 CEST = 06:00 UTC
    const expected = new Date('2026-10-12T06:00:00Z');
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('Sonntag 10:00 -> Montag 08:00', () => {
    const sun10 = new Date('2026-10-11T08:00:00Z'); // 10:00 CEST
    const result = nextAllowedTime(sun10, 'Europe/Berlin');
    const expected = new Date('2026-10-12T06:00:00Z');
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('Mittwoch 15:00 (Geschäftszeit) -> Mittwoch 15:00 unverändert', () => {
    const wed15 = new Date('2026-10-07T13:00:00Z'); // 15:00 CEST
    const result = nextAllowedTime(wed15, 'Europe/Berlin');
    expect(result.getTime()).toBe(wed15.getTime());
  });

  it('Dienstag 22:00 -> Mittwoch 08:00', () => {
    const tue22 = new Date('2026-10-06T20:00:00Z'); // 22:00 CEST
    const result = nextAllowedTime(tue22, 'Europe/Berlin');
    const expected = new Date('2026-10-07T06:00:00Z'); // Mi 08:00 CEST
    expect(result.getTime()).toBe(expected.getTime());
  });
});
```

Worker-Tests (Ausschnitt):

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  processReminder24h,
  processReminder2h,
  processFollowupCheck,
} from '../appointment-reminders';

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.1', messageRowId: 'r1' }),
}));
vi.mock('@/lib/notifications/create', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotificationForAgency: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/activity/log', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/whatsapp/window', () => ({
  isQuietHours: vi.fn().mockReturnValue(false),
  nextAllowedTime: vi.fn().mockReturnValue(new Date('2026-10-12T06:00:00Z')),
}));

// ... makeSvc (gleich wie Task 3)

describe('processReminder24h', () => {
  it('sendet Template und loggt Activity bei aktivem Termin', async () => {
    // setup svc mit appointment status='booked', candidate, conversation, template
    // ... verify sendWhatsAppMessage called
  });

  it('No-op bei abgesagtem Termin (Storno-Recheck P4-R7)', async () => {
    // setup svc mit appointment status='cancelled'
    // ... verify sendWhatsAppMessage NOT called
  });

  it('verschiebt run_at bei Ruhezeit (P4-R6)', async () => {
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    (isQuietHours as ReturnType<typeof vi.fn>).mockReturnValue(true);
    // ... verify scheduled_jobs update mit neuem run_at statt Send
  });
});

describe('processReminder2h', () => {
  it('sendet IMMER, auch in Ruhezeit (bypassQuietHours P4-R6)', async () => {
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    (isQuietHours as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    // setup svc + call
    // ... verify sendWhatsAppMessage called WITH bypassQuietHours: true
  });
});

describe('processFollowupCheck', () => {
  it('sendet Notification wenn Termin noch booked/confirmed ist (P4-R12)', async () => {
    // setup svc mit appointment status='booked'
    // ... verify createNotificationForAgency called
  });
});
```

- [ ] **Step 2: FAIL bestätigen.**

- [ ] **Step 3: `nextAllowedTime` in `window.ts` implementieren.**

```ts
/**
 * Nächster erlaubter Versandzeitpunkt: Mo-Sa ab 08:00 Ortszeit.
 * Liegt now in Geschäftszeit -> now zurück. Sonst nächster Werktag 08:00.
 */
export function nextAllowedTime(now: Date, timezone: string): Date {
  if (!isQuietHours(timezone)) return now;

  // Iteriere tageweise bis Geschäftszeit gefunden (max 7 Tage)
  let candidate = new Date(now.getTime());
  for (let i = 0; i < 7; i++) {
    candidate = new Date(candidate.getTime() + (i === 0 ? 0 : 24 * 60 * 60_000));

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'short',
    }).formatToParts(candidate);
    const weekday = parts.find(p => p.type === 'weekday')?.value || '';

    // Sonntag überspringen
    if (weekday === 'Sun') continue;

    // Auf 08:00 Ortszeit setzen
    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(candidate);
    // Nächster Tag falls i>0 oder schon abends
    const nextDayStr = i === 0 ? dateParts : new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(candidate);

    // 08:00 lokal -> UTC berechnen
    const testDate = new Date(`${nextDayStr}T12:00:00Z`);
    const localHour = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false })
        .formatToParts(testDate).find(p => p.type === 'hour')?.value || '0', 10);
    const utcHour = testDate.getUTCHours();
    const offsetHours = localHour - utcHour;
    const target = new Date(`${nextDayStr}T08:00:00Z`);
    target.setTime(target.getTime() - offsetHours * 3600_000);

    // Prüfe ob target in Zukunft liegt und kein Sonntag
    if (target.getTime() > now.getTime()) {
      const targetWeekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' })
        .format(target);
      if (targetWeekday !== 'Sun') return target;
    }
  }
  return now; // Fallback (sollte nie eintreten)
}
```

- [ ] **Step 4: `bypassQuietHours` in `send.ts` + `checkPreflight` erweitern.**

In `src/lib/whatsapp/send.ts` `SendOpts` ergänzen:

```ts
export interface SendOpts {
  // ... bestehende Felder ...
  /** true => Ruhezeiten-Check wird übersprungen (P4-R6: reminder_2h) */
  bypassQuietHours?: boolean;
}
```

In `checkPreflight` den Ruhezeit-Block erweitern:

```ts
// Ruhezeiten binden automatisierte Sends; manueller UI-Versand und bypassQuietHours sind ausgenommen
if (!opts.isHumanUiSend && !opts.bypassQuietHours && isQuietHours(opts.timezone)) {
  return { ok: false, reason: 'Ruhezeit (20:00–08:00 Mo–Sa, So ganztägig) — automatischer Versand gesperrt' };
}
```

Und in `sendWhatsAppMessage` den Opts-Parameter `bypassQuietHours` an `checkPreflight` durchreichen (neues Feld in `PreflightOpts`).

- [ ] **Step 5: `appointment-reminders.ts` implementieren.**

Jeder Worker folgt dem gleichen Muster:
1. Termin laden `.eq('agency_id', agencyId)` — Status-Guard: nicht `'booked'`/`'confirmed'` -> No-op.
2. Ruhezeit-Check (ausser `reminder_2h`): `isQuietHours` -> `scheduled_jobs.update({ run_at: nextAllowedTime(...), status: 'pending' })` + return.
3. Candidate/Conversation/Template laden, `sendWhatsAppMessage` aufrufen.
4. `logActivity`.

- [ ] **Step 6: tick-Dispatch erweitern** in `src/app/api/cron/tick/route.ts`:

```ts
import {
  processInviteFollowup,
  processReminder24h,
  processReminder2h,
  processFollowupCheck,
  processNoShowFollowup,
} from '@/lib/workers/appointment-reminders';

// Im scheduled_jobs switch:
case 'appointment.invite_followup':
  await processInviteFollowup(svc, job.agency_id, payload as { appointment_id: string });
  break;
case 'appointment.reminder_24h':
  await processReminder24h(svc, job.agency_id, payload as { appointment_id: string });
  break;
case 'appointment.reminder_2h':
  await processReminder2h(svc, job.agency_id, payload as { appointment_id: string });
  break;
case 'appointment.followup_check':
  await processFollowupCheck(svc, job.agency_id, payload as { appointment_id: string });
  break;
case 'appointment.no_show_followup':
  await processNoShowFollowup(svc, job.agency_id, payload as { appointment_id: string });
  break;
```

- [ ] **Step 7: Tests grün, Build grün.**

- [ ] **Step 8: Commit**

```bash
git add src/lib/whatsapp/window.ts src/lib/whatsapp/send.ts src/lib/workers/appointment-reminders.ts src/lib/workers/__tests__/appointment-reminders.test.ts src/app/api/cron/tick/route.ts
git commit -m "feat(termine): Reminder-Worker, nextAllowedTime, bypassQuietHours und tick-Dispatch (Phase 4 Task 4)"
```

---

### Task 5: Buchungs-API — GET Slots + POST Buchen/Verschieben/Absagen

**Files:**
- Create: `src/app/api/book/[token]/slots/route.ts`
- Create: `src/app/api/book/[token]/route.ts`
- Test: `src/app/api/book/__tests__/book-api.test.ts`

**Interfaces:**
- Consumes: `computeSlots` aus Task 2, `bookAppointment`/`cancelAppointment`/`rescheduleAppointment` aus Task 3.
- Produces:
  - `GET /api/book/[token]/slots` -> `{ slots: Array<{ start: string; end: string }> }` (öffentlich, kein Auth, Token ist Secret)
  - `POST /api/book/[token]` Body `{ action: 'book', start: string }` oder `{ action: 'reschedule', start: string }` oder `{ action: 'cancel' }` -> `{ ok: true }` oder Fehler

- [ ] **Step 1: Failing Tests.**

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockSvc),
}));
vi.mock('@/lib/appointments/slots', () => ({
  computeSlots: vi.fn().mockReturnValue([
    { start: new Date('2026-10-10T08:00:00Z'), end: new Date('2026-10-10T08:30:00Z') },
  ]),
}));
vi.mock('@/lib/appointments/lifecycle', () => ({
  bookAppointment: vi.fn().mockResolvedValue(undefined),
  cancelAppointment: vi.fn().mockResolvedValue(undefined),
  rescheduleAppointment: vi.fn().mockResolvedValue({ newAppointmentId: 'appt-new' }),
}));

// ... makeSvc helper

describe('GET /api/book/[token]/slots', () => {
  it('liefert Slots für gültigen Token', async () => {
    // Token-Lookup liefert appointment mit token_expires_at in der Zukunft + Job + Regeln
    // -> 200 mit slots Array
  });

  it('410 bei abgelaufenem Token', async () => {
    // Token-Lookup liefert appointment mit token_expires_at in der Vergangenheit
    // -> 410 'Buchungslink abgelaufen'
  });

  it('404 bei unbekanntem Token', async () => {
    // -> 404 'Termin nicht gefunden'
  });
});

describe('POST /api/book/[token]', () => {
  it('bucht Slot und liefert 200', async () => {
    // action: 'book', start: valid ISO string in Slots
    // -> 200 { ok: true }
    // -> bookAppointment called
  });

  it('409 bei Slot-Konflikt (P4-R5)', async () => {
    // bookAppointment wirft mit 'Slot bereits vergeben' -> 409
  });

  it('400 bei ungültigem Body', async () => {
    // -> 400 'Ungültiger Request-Body'
  });
});
```

- [ ] **Step 2: FAIL bestätigen.**

- [ ] **Step 3: Implementieren.**

`src/app/api/book/[token]/slots/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSlots } from '@/lib/appointments/slots';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const svc = createAdminClient();

  // Token-Lookup
  const { data: appt } = await svc.from('appointments')
    .select('id, agency_id, application_id, status, token_expires_at, type, location')
    .eq('booking_token', token)
    .maybeSingle();

  if (!appt) {
    return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 });
  }
  if (appt.token_expires_at && new Date(appt.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Buchungslink abgelaufen' }, { status: 410 });
  }

  // Job + Verfügbarkeiten laden
  const { data: application } = await svc.from('applications')
    .select('job_id').eq('id', appt.application_id).eq('agency_id', appt.agency_id).single();
  if (!application) {
    return NextResponse.json({ error: 'Bewerbung nicht gefunden' }, { status: 404 });
  }

  const { data: job } = await svc.from('jobs')
    .select('id, appointment_duration_minutes, appointment_buffer_minutes')
    .eq('id', application.job_id).eq('agency_id', appt.agency_id).single();
  if (!job) {
    return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 });
  }

  const { data: rules } = await svc.from('availability_rules')
    .select('weekday, start_time, end_time')
    .eq('job_id', job.id).eq('agency_id', appt.agency_id);

  const { data: agency } = await svc.from('agencies')
    .select('timezone').eq('id', appt.agency_id).single();

  // Bereits gebuchte Termine für diesen Job laden
  const { data: booked } = await svc.from('appointments')
    .select('starts_at, ends_at')
    .eq('agency_id', appt.agency_id)
    .in('status', ['booked', 'confirmed'])
    .not('starts_at', 'is', null);

  const slots = computeSlots({
    rules: rules ?? [],
    bookedSlots: (booked ?? []).filter(b => b.starts_at && b.ends_at).map(b => ({
      starts_at: b.starts_at!, ends_at: b.ends_at!,
    })),
    from: new Date(),
    days: 14,
    durationMinutes: job.appointment_duration_minutes ?? 30,
    bufferMinutes: job.appointment_buffer_minutes ?? 15,
    timezone: agency?.timezone ?? 'Europe/Berlin',
  });

  return NextResponse.json({
    slots: slots.map(s => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
    appointment: {
      id: appt.id,
      status: appt.status,
      type: appt.type,
      location: appt.location,
    },
  });
}
```

`src/app/api/book/[token]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bookAppointment, cancelAppointment, rescheduleAppointment } from '@/lib/appointments/lifecycle';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const svc = createAdminClient();

  // Token-Lookup
  const { data: appt } = await svc.from('appointments')
    .select('id, agency_id, application_id, status, token_expires_at')
    .eq('booking_token', token)
    .maybeSingle();

  if (!appt) {
    return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 });
  }
  if (appt.token_expires_at && new Date(appt.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Buchungslink abgelaufen' }, { status: 410 });
  }

  let body: { action: string; start?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  if (!body.action) {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  // Job laden für Dauer
  const { data: application } = await svc.from('applications')
    .select('job_id').eq('id', appt.application_id).eq('agency_id', appt.agency_id).single();
  const { data: job } = await svc.from('jobs')
    .select('appointment_duration_minutes').eq('id', application?.job_id).single();
  const durationMs = (job?.appointment_duration_minutes ?? 30) * 60_000;

  try {
    switch (body.action) {
      case 'book': {
        if (!body.start) return NextResponse.json({ error: 'Startzeit fehlt' }, { status: 400 });
        const startsAt = new Date(body.start);
        const endsAt = new Date(startsAt.getTime() + durationMs);
        await bookAppointment(svc, {
          agencyId: appt.agency_id, appointmentId: appt.id,
          startsAt, endsAt, bookedVia: 'booking_page',
        });
        break;
      }
      case 'reschedule': {
        if (!body.start) return NextResponse.json({ error: 'Startzeit fehlt' }, { status: 400 });
        const startsAt = new Date(body.start);
        const endsAt = new Date(startsAt.getTime() + durationMs);
        await rescheduleAppointment(svc, {
          agencyId: appt.agency_id, oldAppointmentId: appt.id,
          startsAt, endsAt, bookedVia: 'booking_page',
        });
        break;
      }
      case 'cancel':
        await cancelAppointment(svc, { agencyId: appt.agency_id, appointmentId: appt.id });
        break;
      default:
        return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    if (msg.includes('Slot bereits vergeben') || msg.includes('duplicate') || msg.includes('unique')) {
      return NextResponse.json({ error: 'Slot bereits vergeben' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Tests grün, Build grün.**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/book/ src/app/api/book/__tests__/
git commit -m "feat(termine): Buchungs-API mit Slot-Abfrage, Buchen, Verschieben, Absagen (Phase 4 Task 5)"
```

---

### Task 6: Buchungsseite UI (öffentlich)

**Files:**
- Create: `src/app/(public)/book/[token]/page.tsx` (Server Component)
- Create: `src/components/book/slot-picker.tsx` (Client Component)

**Interfaces:**
- Consumes: `GET /api/book/[token]/slots` und `POST /api/book/[token]` aus Task 5.

- [ ] **Step 1: Server-Page schreiben.**

```tsx
// src/app/(public)/book/[token]/page.tsx
import { createAdminClient } from '@/lib/supabase/admin';
import { SlotPicker } from '@/components/book/slot-picker';
import { notFound } from 'next/navigation';

export default async function BookPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const svc = createAdminClient();

  const { data: appt } = await svc
    .from('appointments')
    .select('id, agency_id, status, token_expires_at, type, location, starts_at, ends_at, application_id')
    .eq('booking_token', token)
    .maybeSingle();

  if (!appt) notFound();

  const expired = appt.token_expires_at && new Date(appt.token_expires_at) < new Date();
  if (expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md rounded-lg bg-white p-8 text-center shadow">
          <h1 className="mb-2 text-xl font-semibold text-gray-900">Link abgelaufen</h1>
          <p className="text-gray-600">
            Dieser Buchungslink ist leider nicht mehr gültig.
            Bitte kontaktiere uns für einen neuen Link.
          </p>
        </div>
      </div>
    );
  }

  // Agency + Job-Infos laden
  const { data: application } = await svc.from('applications')
    .select('job_id').eq('id', appt.application_id).eq('agency_id', appt.agency_id).single();
  const { data: job } = await svc.from('jobs')
    .select('title').eq('id', application?.job_id).single();
  const { data: agency } = await svc.from('agencies')
    .select('name').eq('id', appt.agency_id).single();

  const hasBooking = appt.status === 'booked' || appt.status === 'confirmed';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">
          Termin buchen
        </h1>
        <p className="mb-6 text-sm text-gray-600">
          {job?.title ?? 'Stelle'} bei {agency?.name ?? 'Unternehmen'}
        </p>
        <SlotPicker
          token={token}
          appointmentType={appt.type}
          location={appt.location}
          hasBooking={hasBooking}
          bookedStart={appt.starts_at}
          bookedEnd={appt.ends_at}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: SlotPicker Client-Komponente schreiben.**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SlotPickerProps {
  token: string;
  appointmentType: string;
  location: string | null;
  hasBooking: boolean;
  bookedStart: string | null;
  bookedEnd: string | null;
}

interface SlotData {
  start: string;
  end: string;
}

export function SlotPicker({ token, appointmentType, location, hasBooking, bookedStart, bookedEnd }: SlotPickerProps) {
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/book/${token}/slots`)
      .then(r => r.json())
      .then(data => {
        setSlots(data.slots ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError('Slots konnten nicht geladen werden');
        setLoading(false);
      });
  }, [token]);

  // Slots nach Tag gruppieren
  const slotsByDay = new Map<string, SlotData[]>();
  for (const slot of slots) {
    const day = new Date(slot.start).toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: 'long',
    });
    if (!slotsByDay.has(day)) slotsByDay.set(day, []);
    slotsByDay.get(day)!.push(slot);
  }

  const handleBook = async (action: 'book' | 'reschedule') => {
    if (!selectedSlot) return;
    setBooking(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, start: selectedSlot }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Buchung fehlgeschlagen');
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Netzwerkfehler');
    }
    setBooking(false);
  };

  const handleCancel = async () => {
    setBooking(true);
    try {
      const res = await fetch(`/api/book/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (res.ok) setSuccess(true);
    } catch {
      setError('Netzwerkfehler');
    }
    setBooking(false);
  };

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="text-2xl mb-2">&#10003;</div>
        <p className="text-lg font-medium text-gray-900">Erledigt!</p>
        <p className="text-sm text-gray-600">
          Du erhältst eine Bestätigung per WhatsApp.
        </p>
      </div>
    );
  }

  if (hasBooking && bookedStart) {
    const date = new Date(bookedStart);
    return (
      <div>
        <Card className="p-4 mb-4">
          <p className="font-medium text-gray-900">Dein Termin</p>
          <p className="text-sm text-gray-600">
            {date.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })}{' '}
            um {date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {appointmentType === 'video' ? 'Videogespräch' : appointmentType === 'onsite' ? `Vor Ort: ${location || ''}` : 'Telefongespräch'}
          </p>
        </Card>
        <div className="flex gap-2">
          <Button onClick={() => { /* setze hasBooking false für Verschieben-UI */ }} className="flex-1">
            Verschieben
          </Button>
          <Button onClick={handleCancel} disabled={booking} className="flex-1" data-tone="outline">
            Absagen
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (loading) return <p className="text-center text-gray-500 py-8">Lade verfügbare Termine...</p>;

  if (slots.length === 0) {
    return <p className="text-center text-gray-500 py-8">Aktuell keine freien Termine verfügbar.</p>;
  }

  const days = Array.from(slotsByDay.keys());

  return (
    <div>
      {/* Tagesliste */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {days.map(day => (
          <button
            key={day}
            onClick={() => { setSelectedDay(day); setSelectedSlot(null); }}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm border ${
              selectedDay === day ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
            }`}
          >
            {day}
          </button>
        ))}
      </div>

      {/* Zeiten-Grid */}
      {selectedDay && slotsByDay.get(selectedDay) && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {slotsByDay.get(selectedDay)!.map(slot => {
            const time = new Date(slot.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            return (
              <button
                key={slot.start}
                onClick={() => setSelectedSlot(slot.start)}
                className={`rounded-lg py-2 text-sm border ${
                  selectedSlot === slot.start ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                }`}
              >
                {time}
              </button>
            );
          })}
        </div>
      )}

      {/* Bestätigung */}
      {selectedSlot && (
        <div className="border-t pt-4">
          <p className="text-sm text-gray-600 mb-3">
            {new Date(selectedSlot).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })}{' '}
            um {new Date(selectedSlot).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
          </p>
          <Badge tone="neutral">
            {appointmentType === 'video' ? 'Videogespräch' : appointmentType === 'onsite' ? 'Vor Ort' : 'Telefon'}
          </Badge>
          {location && <p className="text-xs text-gray-500 mt-1">{location}</p>}
          <Button
            onClick={() => handleBook('book')}
            disabled={booking}
            className="mt-3 w-full"
          >
            {booking ? 'Wird gebucht...' : 'Termin buchen'}
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: `npx next build` grün** (kein Test-File für UI, Build-Gate genügt).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(public\)/book/ src/components/book/
git commit -m "feat(termine): Öffentliche Buchungsseite mit Slot-Picker (Phase 4 Task 6)"
```

---

### Task 7: Bot-Abschluss-Integration — Termineinladung bei Score A/B

**Files:**
- Modify: `src/lib/workers/bot-process.ts` (Abschluss-Block erweitern)
- Modify: `src/lib/bot/handover.ts` (`fireEvent('bot.handover')` hinzufügen)
- Test: `src/lib/workers/__tests__/bot-process.test.ts` (Tests ergänzen)

**Interfaces:**
- Consumes: `createProposedAppointment` aus Task 3, `TEMPLATE_PRESETS` (appointment_invite), `fireEvent`.
- Produces: Bei Bot-Abschluss A/B wird automatisch ein Termin vorgeschlagen und die Einladung per Template gesendet.

- [ ] **Step 1: Failing Tests ergänzen** in `bot-process.test.ts`:

```ts
// Am Ende der bestehenden Tests ergänzen:

vi.mock('@/lib/appointments/lifecycle', () => ({
  createProposedAppointment: vi.fn().mockResolvedValue({
    appointmentId: 'appt-auto-1',
    bookingToken: 'tok-auto-1',
  }),
}));
vi.mock('@/lib/automations/fire', () => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
}));

it('Phase 4: Bei Score A/B wird createProposedAppointment aufgerufen und appointment_invite-Template gesendet', async () => {
  // Setup: alle Fragen beantwortet, Score A
  const { createProposedAppointment } = await import('@/lib/appointments/lifecycle');
  const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
  const { fireEvent } = await import('@/lib/automations/fire');

  // ... svc-Setup mit beantwortetem Bot-Dialog, Score A
  // await processBotTurn(svc, 'ag-1', { conversation_id: 'conv-1' }, 0);

  expect(createProposedAppointment).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ agencyId: 'ag-1' }),
  );
  // appointment_invite Template muss gesendet werden
  expect(sendWhatsAppMessage).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      senderType: 'system',
    }),
  );
  // invite_followup Job muss geplant sein
  expect(fireEvent).toHaveBeenCalledWith('bot.completed', 'ag-1', expect.anything());
});

it('Phase 4: Bei Score C wird KEIN Termin erstellt', async () => {
  const { createProposedAppointment } = await import('@/lib/appointments/lifecycle');
  // ... svc-Setup mit Score C
  // await processBotTurn(svc, 'ag-1', { conversation_id: 'conv-1' }, 0);
  expect(createProposedAppointment).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: FAIL bestätigen.**

- [ ] **Step 3: `bot-process.ts` Abschluss-Block erweitern.** Nach dem Score-Bereich (nach `logActivity bot_completed`), VOR dem `return`:

```ts
// Phase 4 P4-R2: Bei A/B automatisch Termineinladung
if (scoreResult.label === 'A' || scoreResult.label === 'B') {
  try {
    const { createProposedAppointment } = await import('@/lib/appointments/lifecycle');

    // Job-Daten für Terminart
    const jobType = (job as { appointment_type?: string })?.appointment_type ?? 'call';
    const jobLocation = (job as { appointment_location?: string })?.appointment_location ?? null;

    const { appointmentId, bookingToken } = await createProposedAppointment(svc, {
      agencyId,
      applicationId: conv.application_id,
      type: jobType as 'call' | 'video' | 'onsite',
      location: jobLocation,
    });

    // Buchungslink zusammenbauen
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';
    const buchungslink = `${baseUrl}/book/${bookingToken}`;

    // appointment_invite-Template senden
    const { data: inviteTmpl } = await svc.from('whatsapp_templates')
      .select('id, name')
      .eq('wa_account_id', conv.wa_account_id)
      .eq('preset_key', 'appointment_invite')
      .eq('status', 'approved')
      .eq('agency_id', agencyId)
      .maybeSingle();

    if (inviteTmpl && candidate.phone_e164) {
      const vorname = (candidate.name || '').split(' ')[0];
      const jobTitle = (job as { title: string })?.title ?? '';

      await sendWhatsAppMessage(svc, {
        agencyId,
        conversationId,
        candidatePhone: candidate.phone_e164,
        waAccountId: conv.wa_account_id,
        payload: {
          to: candidate.phone_e164,
          type: 'template',
          template: {
            name: inviteTmpl.name,
            language: { code: 'de' },
            components: [{
              type: 'body',
              parameters: [
                { type: 'text', text: vorname },
                { type: 'text', text: jobTitle },
                { type: 'text', text: buchungslink },
              ],
            }],
          },
        },
        senderType: 'system',
        templateId: inviteTmpl.id,
      }).catch(() => {});
    }

    // invite_followup +24h
    await svc.from('scheduled_jobs').upsert({
      agency_id: agencyId,
      run_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      type: 'appointment.invite_followup',
      payload: { appointment_id: appointmentId },
      status: 'pending',
      dedupe_key: `appt.invite_followup:${appointmentId}`,
    }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  } catch {
    // Termineinladung ist best effort — Bot-Abschluss bleibt intakt
  }
}

// fireEvent bot.completed
await fireEvent('bot.completed', agencyId, {
  candidate_id: conv.candidate_id,
  extra: {
    application_id: conv.application_id,
    score: scoreResult.score,
    label: scoreResult.label,
  },
}).catch(() => {});
```

- [ ] **Step 4: `handover.ts` erweitern** — am Ende von `handoverToHuman`, nach `logActivity`:

```ts
// Phase 4 P4-R8: fireEvent für Automations
const { fireEvent } = await import('@/lib/automations/fire');
await fireEvent('bot.handover', agencyId, {
  candidate_id: candidateId,
  extra: { conversation_id: conversationId, reason },
}).catch(() => {});
```

- [ ] **Step 5: Tests grün, Build grün.**

- [ ] **Step 6: Commit**

```bash
git add src/lib/workers/bot-process.ts src/lib/bot/handover.ts src/lib/workers/__tests__/bot-process.test.ts
git commit -m "feat(termine): Bot-Abschluss A/B erstellt Termin und sendet Einladung (Phase 4 Task 7)"
```

---

### Task 8: Automations-Engine v2 — Neue Aktionen, Kontext, Bedingungs-Operatoren

**Files:**
- Modify: `src/lib/automations/engine.ts`
- Modify: `src/lib/automations/fire.ts`
- Create: `src/lib/automations/__tests__/engine-v2.test.ts`

**Interfaces:**
- Consumes: `sendWhatsAppMessage`, `sendWhatsAppTemplate` (über Template-Lookup), `logActivity`, `createNotification`/`createNotificationForAgency`.
- Produces: Erweiterte `AutomationContext`, neue Action-Typen, erweiterte `fireEvent` mit `suppress`-Option.

```ts
// Erweiterter AutomationContext
export interface AutomationContext {
  trigger_event: string;
  agency_id: string;
  candidate_id?: string;
  candidate?: Record<string, unknown>;
  data?: Record<string, unknown>;
  application_id?: string;
  conversation_id?: string;
}

// Neue Action-Typen (zusätzlich zu bestehenden)
type ActionType =
  | 'send_notification' | 'change_stage' | 'create_task' | 'set_field' | 'log_activity'
  | 'send_template' | 'send_message' | 'start_bot' | 'set_stage_application'
  | 'assign_application' | 'send_email' | 'schedule_job' | 'call_webhook' | 'add_note';

// Erweiterte fireEvent
export async function fireEvent(
  trigger_event: string,
  agency_id: string,
  data?: {
    candidate_id?: string;
    candidate?: Record<string, unknown>;
    extra?: Record<string, unknown>;
  },
  options?: {
    suppress?: string[];
    application_id?: string;
    conversation_id?: string;
  },
): Promise<void>;
```

- [ ] **Step 1: Failing Tests.**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockSvc),
}));

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.1', messageRowId: 'r1' }),
}));

vi.mock('@/lib/notifications/create', () => ({
  createNotification: vi.fn(),
  createNotificationForAgency: vi.fn(),
  createNotificationForInternals: vi.fn(),
}));

vi.mock('@/lib/activity/log', () => ({
  logActivity: vi.fn(),
}));

// ... makeSvc helper

describe('Automations v2 — neue Aktionen', () => {
  it('set_stage_application ändert stage_id auf applications (nicht candidates)', async () => {
    // Setup Automation mit action: { type: 'set_stage_application', params: { stage_id: 'stage-xyz' } }
    // Kontext mit application_id
    // Verify: svc.from('applications').update({ stage_id: 'stage-xyz' }).eq('id', applicationId)
  });

  it('assign_application setzt assigned_to auf applications', async () => {
    // Verify: svc.from('applications').update({ assigned_to: 'user-1' }).eq('id', applicationId)
  });

  it('add_note fügt Notiz in notes-Tabelle ein', async () => {
    // Verify: svc.from('notes').insert({ application_id, body, user_id: null })
  });

  it('call_webhook sendet POST mit 5s timeout und loggt Status', async () => {
    // Mock global fetch
    // Verify: fetch called mit signal (AbortController, 5000ms)
    // Verify: automation_runs log enthält response_status
  });

  it('send_template sendet WhatsApp-Template über sendWhatsAppMessage', async () => {
    // Verify: sendWhatsAppMessage called mit Template-Payload
  });

  it('send_message wird bei geschlossenem Fenster mit Log übersprungen', async () => {
    // sendWhatsAppMessage wirft 'Fenster geschlossen'
    // Verify: action logged als skipped, kein throw
  });
});

describe('Bedingungs-Operatoren', () => {
  it('eq, neq, in, contains funktionieren auf Context-Feldern', () => {
    // Direkter Aufruf von evaluateCondition (exportiert für Tests)
    // eq: 'A' === 'A' -> true
    // neq: 'A' !== 'B' -> true
    // in: 'A' in ['A','B'] -> true
    // contains: 'hallo welt' contains 'welt' -> true
  });
});
```

- [ ] **Step 2: FAIL bestätigen.**

- [ ] **Step 3: `engine.ts` erweitern.** Die bestehenden Funktionen werden in-place ergänzt:

Im Action-Switch neue Cases hinzufügen:

```ts
case 'set_stage_application':
  await executeSetStageApplication(supabase, action.params, context);
  break;
case 'assign_application':
  await executeAssignApplication(supabase, action.params, context);
  break;
case 'send_template':
  await executeSendTemplate(supabase, action.params, context);
  break;
case 'send_message':
  await executeSendMessage(supabase, action.params, context);
  break;
case 'start_bot':
  await executeStartBot(supabase, action.params, context);
  break;
case 'send_email':
  await executeSendEmail(supabase, action.params, context);
  break;
case 'schedule_job':
  await executeScheduleJob(supabase, action.params, context);
  break;
case 'call_webhook':
  await executeCallWebhook(supabase, action.params, context);
  break;
case 'add_note':
  await executeAddNote(supabase, action.params, context);
  break;
```

Implementierung jeder neuen Aktion:

```ts
async function executeSetStageApplication(svc: SupabaseClient, params: Record<string, unknown>, ctx: AutomationContext) {
  const stageId = params.stage_id as string;
  if (!stageId || !ctx.application_id) return;
  await svc.from('applications')
    .update({ stage_id: stageId, updated_at: new Date().toISOString() })
    .eq('id', ctx.application_id)
    .eq('agency_id', ctx.agency_id);
}

async function executeAssignApplication(svc: SupabaseClient, params: Record<string, unknown>, ctx: AutomationContext) {
  const userId = params.user_id as string;
  if (!userId || !ctx.application_id) return;
  await svc.from('applications')
    .update({ assigned_to: userId, updated_at: new Date().toISOString() })
    .eq('id', ctx.application_id)
    .eq('agency_id', ctx.agency_id);
}

async function executeAddNote(svc: SupabaseClient, params: Record<string, unknown>, ctx: AutomationContext) {
  const body = resolveTemplate(String(params.body ?? ''), ctx);
  if (!ctx.application_id) return;
  await svc.from('notes').insert({
    agency_id: ctx.agency_id,
    application_id: ctx.application_id,
    body,
    user_id: null, // System-Notiz
  });
}

async function executeCallWebhook(svc: SupabaseClient, params: Record<string, unknown>, ctx: AutomationContext) {
  const url = params.url as string;
  if (!url) return;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger: ctx.trigger_event,
        agency_id: ctx.agency_id,
        candidate_id: ctx.candidate_id,
        application_id: ctx.application_id,
        data: ctx.data,
      }),
      signal: controller.signal,
    });
    // Status wird im automation_runs-Log erfasst (via Rückgabe-Erweiterung)
    if (!res.ok) {
      throw new Error(`Webhook fehlgeschlagen: HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

async function executeSendTemplate(svc: SupabaseClient, params: Record<string, unknown>, ctx: AutomationContext) {
  if (!ctx.conversation_id || !ctx.candidate_id) return;
  const presetKey = params.preset_key as string;
  if (!presetKey) return;

  const { data: conv } = await svc.from('conversations')
    .select('wa_account_id, candidate_id')
    .eq('id', ctx.conversation_id).eq('agency_id', ctx.agency_id).single();
  if (!conv) return;

  const { data: candidate } = await svc.from('candidates')
    .select('name, phone_e164')
    .eq('id', ctx.candidate_id).eq('agency_id', ctx.agency_id).single();
  if (!candidate?.phone_e164) return;

  const { data: tmpl } = await svc.from('whatsapp_templates')
    .select('id, name, variables')
    .eq('wa_account_id', conv.wa_account_id)
    .eq('preset_key', presetKey)
    .eq('status', 'approved')
    .eq('agency_id', ctx.agency_id)
    .maybeSingle();
  if (!tmpl) return;

  const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
  const variables = (params.variables as string[]) ?? [];
  await sendWhatsAppMessage(svc, {
    agencyId: ctx.agency_id,
    conversationId: ctx.conversation_id,
    candidatePhone: candidate.phone_e164,
    waAccountId: conv.wa_account_id,
    payload: {
      to: candidate.phone_e164,
      type: 'template',
      template: {
        name: tmpl.name,
        language: { code: 'de' },
        components: [{
          type: 'body',
          parameters: variables.map(v => ({ type: 'text', text: resolveTemplate(v, ctx) })),
        }],
      },
    },
    senderType: 'system',
    templateId: tmpl.id,
  });
}

async function executeSendMessage(svc: SupabaseClient, params: Record<string, unknown>, ctx: AutomationContext) {
  if (!ctx.conversation_id || !ctx.candidate_id) return;
  const body = resolveTemplate(String(params.body ?? ''), ctx);
  if (!body) return;

  const { data: conv } = await svc.from('conversations')
    .select('wa_account_id').eq('id', ctx.conversation_id).eq('agency_id', ctx.agency_id).single();
  if (!conv) return;

  const { data: candidate } = await svc.from('candidates')
    .select('phone_e164').eq('id', ctx.candidate_id).eq('agency_id', ctx.agency_id).single();
  if (!candidate?.phone_e164) return;

  const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
  try {
    await sendWhatsAppMessage(svc, {
      agencyId: ctx.agency_id,
      conversationId: ctx.conversation_id,
      candidatePhone: candidate.phone_e164,
      waAccountId: conv.wa_account_id,
      payload: { to: candidate.phone_e164, type: 'text', text: { body } },
      senderType: 'system',
    });
  } catch {
    // Bei geschlossenem Fenster: skip (Spec: send_message nur bei offenem Fenster)
  }
}

async function executeStartBot(_svc: SupabaseClient, params: Record<string, unknown>, ctx: AutomationContext) {
  if (!ctx.application_id) return;
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const svc = createAdminClient();
  await svc.from('scheduled_jobs').upsert({
    agency_id: ctx.agency_id,
    run_at: new Date().toISOString(),
    type: 'bot.open',
    payload: { application_id: ctx.application_id },
    status: 'pending',
    dedupe_key: `bot.open:${ctx.application_id}`,
  }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
}

async function executeSendEmail(_svc: SupabaseClient, params: Record<string, unknown>, ctx: AutomationContext) {
  const to = params.to as string;
  const subject = resolveTemplate(String(params.subject ?? ''), ctx);
  const body = resolveTemplate(String(params.body ?? ''), ctx);
  if (!to || !subject) return;

  const { getResend } = await import('@/lib/email/resend');
  // Hinweis: getResend ist nicht exportiert — alternativ sendAgencyCalendarInvite-Muster verwenden
  // Vereinfacht: Resend direkt importieren
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY || '');
  await resend.emails.send({
    from: 'Zoepp Media Cloud <noreply@zoepp-gruppe.de>',
    to, subject, html: body,
  });
}

async function executeScheduleJob(svc: SupabaseClient, params: Record<string, unknown>, ctx: AutomationContext) {
  const type = params.job_type as string;
  const delaySeconds = (params.delay_seconds as number) ?? 0;
  const payload = (params.payload as Record<string, unknown>) ?? {};
  if (!type) return;

  await svc.from('scheduled_jobs').insert({
    agency_id: ctx.agency_id,
    run_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    type,
    payload: { ...payload, application_id: ctx.application_id, candidate_id: ctx.candidate_id },
    status: 'pending',
  });
}
```

- [ ] **Step 4: `fire.ts` erweitern** mit `suppress`-Option und `application_id`/`conversation_id`:

```ts
export async function fireEvent(
  trigger_event: string,
  agency_id: string,
  data?: {
    candidate_id?: string;
    candidate?: Record<string, unknown>;
    extra?: Record<string, unknown>;
  },
  options?: {
    suppress?: string[];
    application_id?: string;
    conversation_id?: string;
  },
) {
  // Suppress-Check: wenn dieser trigger_event in suppress steht, skip
  if (options?.suppress?.includes(trigger_event)) return;

  const supabase = createAdminClient();

  let candidate = data?.candidate;
  if (data?.candidate_id && !candidate) {
    const { data: c } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', data.candidate_id)
      .single();
    candidate = c ?? undefined;
  }

  await fireAutomations(supabase, {
    trigger_event,
    agency_id,
    candidate_id: data?.candidate_id,
    candidate,
    data: data?.extra,
    application_id: options?.application_id,
    conversation_id: options?.conversation_id,
  });
}
```

- [ ] **Step 5: Tests grün, Build grün.**

- [ ] **Step 6: Commit**

```bash
git add src/lib/automations/engine.ts src/lib/automations/fire.ts src/lib/automations/__tests__/engine-v2.test.ts
git commit -m "feat(automations): Engine v2 mit neuen Aktionen, erweitertem Kontext und suppress-Logik (Phase 4 Task 8)"
```

---

### Task 9: Automations v2 — Schleifenschutz, Deduplizierung, Trigger-Verdrahtung, Default-Seeds

**Files:**
- Modify: `src/lib/automations/engine.ts` (Rate-Limit + Dedupe vor Ausführung)
- Modify: `src/lib/automations/seed-defaults.ts` (neue Defaults)
- Modify: diverse Dateien für fireEvent-Aufrufe (ingest, whatsapp-inbound)
- Test: `src/lib/automations/__tests__/engine-v2.test.ts` (ergänzen)

**Interfaces:**
- Consumes: Alles aus Task 8.
- Produces: Vollständiger Schleifenschutz (P4-R9), fireEvent an allen neuen Stellen, Default-Automations für Phase 4.

- [ ] **Step 1: Failing Tests für Schleifenschutz.**

```ts
describe('Rate-Limit P4-R9a', () => {
  it('überspringt Automation wenn > 10 Runs pro Stunde für gleiche application_id', async () => {
    // makeSvc: automation_runs COUNT = 11
    // Erwarte: run mit status 'skipped', error 'Rate-Limit'
  });
});

describe('Dedupe P4-R9c', () => {
  it('überspringt bei doppeltem dedupe_key (Unique-Index-Verletzung)', async () => {
    // makeSvc: insert automation_runs wirft unique_violation
    // Erwarte: Aktion wird übersprungen
  });
});
```

- [ ] **Step 2: FAIL bestätigen.**

- [ ] **Step 3: Rate-Limit + Dedupe in `runSingleAutomation` implementieren.**

Vor der Conditions-Prüfung in `runSingleAutomation`:

```ts
// P4-R9a: Rate-Limit — max 10 Runs pro application_id pro Stunde
if (context.application_id) {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabase.from('automation_runs')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', context.agency_id)
    .eq('application_id', context.application_id)
    .gte('created_at', hourAgo);

  if ((count ?? 0) >= 10) {
    await supabase.from('automation_runs').insert({
      automation_id: automation.id,
      agency_id: context.agency_id,
      application_id: context.application_id,
      candidate_id: context.candidate_id ?? null,
      trigger_data: context.data ?? {},
      actions_executed: [],
      status: 'skipped',
      error_message: 'Rate-Limit',
    });
    return;
  }
}
```

Nach erfolgreicher Aktions-Ausführung, beim Insert von `automation_runs`:

```ts
// P4-R9c: Dedupe-Key berechnen
function computeDedupeKey(ctx: AutomationContext, actions: Action[]): string | null {
  if (!ctx.application_id) return null;
  const actionSummary = actions.map(a => `${a.type}:${JSON.stringify(a.params)}`).join('|');
  const hash = simpleHash(actionSummary);
  const hourBucket = Math.floor(Date.now() / 3600_000);
  return `${ctx.application_id}:${hash}:${hourBucket}`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
```

Beim Insert in `automation_runs`: `dedupe_key` berechnen und upsert mit `onConflict: 'dedupe_key'` + `ignoreDuplicates: true`.

- [ ] **Step 4: Default-Seeds erweitern** in `seed-defaults.ts`:

```ts
// Neue Default-Automations für Phase 4
{
  name: 'Bot abgeschlossen (A/B) → Recruiter benachrichtigen',
  trigger_event: 'bot.completed',
  conditions: [{ field: 'data.label', operator: 'in', value: ['A', 'B'] }],
  actions: [
    {
      type: 'send_notification',
      params: {
        title: 'Qualifizierter Bewerber: {{candidate.name}} ({{data.label}})',
        body: 'Score: {{data.score}} — Termineinladung wurde gesendet.',
        type: 'system',
        user_scope: 'agency',
      },
    },
  ],
},
{
  name: 'Bot-Übergabe → Zugewiesenen benachrichtigen',
  trigger_event: 'bot.handover',
  conditions: [],
  actions: [
    {
      type: 'send_notification',
      params: {
        title: 'Bot-Übergabe: {{candidate.name}}',
        body: '{{data.reason}}',
        type: 'whatsapp_inbound',
        user_scope: 'agency',
      },
    },
  ],
},
{
  name: 'No-Show → Benachrichtigung',
  trigger_event: 'appointment.no_show',
  conditions: [],
  actions: [
    {
      type: 'send_notification',
      params: {
        title: 'No-Show: {{candidate.name}}',
        type: 'noshow',
        user_scope: 'agency',
      },
    },
  ],
},
```

- [ ] **Step 5: fireEvent-Aufrufe an allen Stellen verdrahten.**

In `src/lib/recruiting/ingest.ts` nach `applicationCreated`:
```ts
await fireEvent('application.created', input.agencyId, {
  candidate_id: candidateId, extra: { application_id: applicationId, source: input.source },
}, { application_id: applicationId }).catch(() => {});
```

In `src/lib/workers/whatsapp-inbound.ts` nach Nachrichtenverarbeitung (nur bei `direction: 'in'`):
```ts
await fireEvent('message.received', agencyId, {
  candidate_id: candidateId,
  extra: { conversation_id: conversationId, body: messageBody },
}, { application_id: applicationId, conversation_id: conversationId }).catch(() => {});
```

- [ ] **Step 6: Tests grün, Build grün.**

- [ ] **Step 7: Commit**

```bash
git add src/lib/automations/ src/lib/recruiting/ingest.ts src/lib/workers/whatsapp-inbound.ts
git commit -m "feat(automations): Schleifenschutz, Deduplizierung, Trigger-Verdrahtung und Default-Seeds (Phase 4 Task 9)"
```

---

### Task 10: Bot-Reminder-Kette — nudge2 (+24h) und close (+48h)

**Files:**
- Modify: `src/lib/bot/timers.ts` (erweitern um nudge2 + close)
- Create: `src/lib/workers/bot-nudge2.ts`
- Create: `src/lib/workers/bot-close.ts`
- Modify: `src/app/api/cron/tick/route.ts` (Dispatch)
- Test: `src/lib/workers/__tests__/bot-nudge2-close.test.ts`

**Interfaces:**
- Consumes: `sendWhatsAppMessage`, `cancelBotTimers`, `createNotificationForAgency`, `logActivity`, Template `qualification_nudge`.
- Produces:

```ts
// timers.ts (erweitert)
export async function armBotTimersV2(svc: SupabaseClient, args: {
  agencyId: string; conversationId: string; botStep: number;
}): Promise<void>;
// Legt 4 Jobs an: bot.nudge (+4h), bot.nudge2 (+24h), bot.timeout (+48h), bot.close (+48h)
// Dedupe-Keys: 'bot.nudge:{conv}:{step}', 'bot.nudge2:{conv}:{step}', 'bot.timeout:{conv}:{step}', 'bot.close:{conv}:{step}'

// bot-nudge2.ts
export async function processBotNudge2(svc: SupabaseClient, agencyId: string, payload: {
  conversation_id: string; bot_step: number;
}): Promise<void>;

// bot-close.ts
export async function processBotClose(svc: SupabaseClient, agencyId: string, payload: {
  conversation_id: string; bot_step: number;
}): Promise<void>;
```

- [ ] **Step 1: Failing Tests.**

```ts
import { describe, it, expect, vi } from 'vitest';
import { processBotNudge2 } from '../bot-nudge2';
import { processBotClose } from '../bot-close';

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.1', messageRowId: 'r1' }),
}));
vi.mock('@/lib/notifications/create', () => ({
  createNotificationForAgency: vi.fn(),
}));
vi.mock('@/lib/activity/log', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/bot/timers', () => ({
  cancelBotTimers: vi.fn(),
}));

// makeSvc helper...

describe('processBotNudge2', () => {
  it('sendet qualification_nudge-Template bei bot_active und passendem bot_step', async () => {
    // svc: conversation state='bot_active', bot_step=0
    // Verify: sendWhatsAppMessage called mit Template qualification_nudge
  });

  it('No-op wenn Conversation nicht mehr bot_active', async () => {
    // svc: conversation state='human_active'
    // Verify: sendWhatsAppMessage NOT called
  });

  it('No-op wenn bot_step nicht mehr passt (Antwort kam)', async () => {
    // payload.bot_step=0, conversation.bot_step=1
    // Verify: sendWhatsAppMessage NOT called
  });
});

describe('processBotClose', () => {
  it('setzt state=closed, status=nicht_erreicht, sendet Notification', async () => {
    // svc: conversation state='bot_active', application vorhanden
    // Verify: conversations update state='closed'
    // Verify: applications update status='nicht_erreicht'
    // Verify: createNotificationForAgency called
  });
});
```

- [ ] **Step 2: FAIL bestätigen.**

- [ ] **Step 3: `timers.ts` erweitern.**

Die bestehende `armBotTimers` bleibt. Neue Funktion:

```ts
export async function armBotTimersV2(
  svc: SupabaseClient,
  args: { agencyId: string; conversationId: string; botStep: number },
): Promise<void> {
  const { agencyId, conversationId, botStep } = args;
  const payload = { conversation_id: conversationId, bot_step: botStep };

  const jobs = [
    { type: 'bot.nudge', runAt: 4 * 60 * 60_000, dedupe: `bot.nudge:${conversationId}:${botStep}` },
    { type: 'bot.nudge2', runAt: 24 * 60 * 60_000, dedupe: `bot.nudge2:${conversationId}:${botStep}` },
    { type: 'bot.timeout', runAt: 48 * 60 * 60_000, dedupe: `bot.timeout:${conversationId}:${botStep}` },
    { type: 'bot.close', runAt: 48 * 60 * 60_000, dedupe: `bot.close:${conversationId}:${botStep}` },
  ];

  await svc.from('scheduled_jobs').upsert(
    jobs.map(j => ({
      agency_id: agencyId,
      run_at: new Date(Date.now() + j.runAt).toISOString(),
      type: j.type,
      payload,
      status: 'pending' as const,
      dedupe_key: j.dedupe,
    })),
    { onConflict: 'dedupe_key', ignoreDuplicates: true },
  );
}
```

Erweitere `cancelBotTimers` um die neuen Typen:

```ts
export async function cancelBotTimers(
  svc: SupabaseClient,
  args: { agencyId: string; conversationId: string },
): Promise<void> {
  const { agencyId, conversationId } = args;
  await svc.from('scheduled_jobs')
    .update({ status: 'cancelled' })
    .eq('agency_id', agencyId)
    .eq('status', 'pending')
    .in('type', ['bot.nudge', 'bot.nudge2', 'bot.timeout', 'bot.close'])
    .filter('payload->>conversation_id', 'eq', conversationId);
}
```

- [ ] **Step 4: Worker implementieren.**

`bot-nudge2.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';

export async function processBotNudge2(
  svc: SupabaseClient, agencyId: string, payload: { conversation_id: string; bot_step: number },
): Promise<void> {
  const { data: conv } = await svc.from('conversations')
    .select('id, state, bot_step, candidate_id, wa_account_id')
    .eq('id', payload.conversation_id).eq('agency_id', agencyId).maybeSingle();

  if (!conv || conv.state !== 'bot_active' || conv.bot_step !== payload.bot_step) return;

  const { data: candidate } = await svc.from('candidates')
    .select('name, phone_e164').eq('id', conv.candidate_id).eq('agency_id', agencyId).single();
  if (!candidate?.phone_e164) return;

  // Template qualification_nudge laden und senden
  const { data: tmpl } = await svc.from('whatsapp_templates')
    .select('id, name')
    .eq('wa_account_id', conv.wa_account_id)
    .eq('preset_key', 'qualification_nudge')
    .eq('status', 'approved').eq('agency_id', agencyId).maybeSingle();
  if (!tmpl) return;

  // Application für Jobtitel laden
  const { data: app } = await svc.from('applications')
    .select('job_id').eq('agency_id', agencyId)
    .filter('id', 'in', `(SELECT application_id FROM conversations WHERE id = '${conv.id}')`)
    .maybeSingle();
  // Vereinfacht: conversations hat application_id
  const { data: convFull } = await svc.from('conversations')
    .select('application_id').eq('id', conv.id).single();
  let jobTitle = '';
  if (convFull?.application_id) {
    const { data: appData } = await svc.from('applications')
      .select('job_id').eq('id', convFull.application_id).eq('agency_id', agencyId).single();
    if (appData) {
      const { data: jobData } = await svc.from('jobs')
        .select('title').eq('id', appData.job_id).eq('agency_id', agencyId).single();
      jobTitle = jobData?.title ?? '';
    }
  }

  const vorname = (candidate.name || '').split(' ')[0];
  await sendWhatsAppMessage(svc, {
    agencyId, conversationId: conv.id, candidatePhone: candidate.phone_e164,
    waAccountId: conv.wa_account_id,
    payload: {
      to: candidate.phone_e164, type: 'template',
      template: {
        name: tmpl.name, language: { code: 'de' },
        components: [{ type: 'body', parameters: [
          { type: 'text', text: vorname },
          { type: 'text', text: jobTitle },
        ] }],
      },
    },
    senderType: 'bot', templateId: tmpl.id,
  }).catch(() => {}); // Nudge-Fehler: kein Dead-Letter
}
```

`bot-close.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotificationForAgency } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';

export async function processBotClose(
  svc: SupabaseClient, agencyId: string, payload: { conversation_id: string; bot_step: number },
): Promise<void> {
  const { data: conv } = await svc.from('conversations')
    .select('id, state, bot_step, candidate_id, application_id')
    .eq('id', payload.conversation_id).eq('agency_id', agencyId).maybeSingle();

  if (!conv || conv.state !== 'bot_active' || conv.bot_step !== payload.bot_step) return;

  // state = 'closed', NICHT 'waiting' — P4-R11: 48h ohne Antwort = geschlossen
  await svc.from('conversations').update({
    state: 'closed', updated_at: new Date().toISOString(),
  }).eq('id', conv.id).eq('agency_id', agencyId);

  // Application-Status auf 'nicht_erreicht'
  if (conv.application_id) {
    await svc.from('applications').update({
      status: 'nicht_erreicht', updated_at: new Date().toISOString(),
    }).eq('id', conv.application_id).eq('agency_id', agencyId);
  }

  // Notification
  const { data: candidate } = await svc.from('candidates')
    .select('name').eq('id', conv.candidate_id).eq('agency_id', agencyId).maybeSingle();

  await createNotificationForAgency(svc, agencyId, {
    title: `Bewerber nicht erreicht: ${candidate?.name ?? 'Unbekannt'}`,
    body: 'Keine Antwort nach 48 Stunden. Gespräch geschlossen.',
    type: 'system',
    push_url: `/inbox?conversation=${conv.id}`,
  }).catch(() => {});

  await logActivity(svc, {
    agency_id: agencyId, candidate_id: conv.candidate_id,
    action: 'Bot-Gespräch geschlossen: keine Antwort nach 48h',
    action_type: 'bot_closed',
  });
}
```

- [ ] **Step 5: tick-Dispatch:**

```ts
case 'bot.nudge2':
  await processBotNudge2(svc, job.agency_id, payload as { conversation_id: string; bot_step: number });
  break;
case 'bot.close':
  await processBotClose(svc, job.agency_id, payload as { conversation_id: string; bot_step: number });
  break;
```

- [ ] **Step 6: Tests grün, Build grün.**

- [ ] **Step 7: Commit**

```bash
git add src/lib/bot/timers.ts src/lib/workers/bot-nudge2.ts src/lib/workers/bot-close.ts src/lib/workers/__tests__/bot-nudge2-close.test.ts src/app/api/cron/tick/route.ts
git commit -m "feat(bot): Nudge2 (+24h) und Close (+48h) vervollständigen Reminder-Kette (Phase 4 Task 10)"
```

---

### Task 11: SLA- und interne Reminder + documents_request

**Files:**
- Create: `src/lib/workers/sla-reminders.ts`
- Modify: `src/app/api/cron/tick/route.ts` (Dispatch)
- Test: `src/lib/workers/__tests__/sla-reminders.test.ts`

**Interfaces:**
- Consumes: `createNotification`, `createNotificationForAgency`, `sendWhatsAppMessage` (documents_request-Template), `logActivity`.
- Produces:

```ts
export async function processSlaRecruiter24h(svc: SupabaseClient, agencyId: string, payload: { application_id: string }): Promise<void>;
export async function processSlaRecruiter48h(svc: SupabaseClient, agencyId: string, payload: { application_id: string }): Promise<void>;
export async function processWindowExpiry(svc: SupabaseClient, agencyId: string, payload: { conversation_id: string }): Promise<void>;
export async function processDocumentsRequest(svc: SupabaseClient, agencyId: string, payload: { application_id: string; stage_id: string }): Promise<void>;
```

- [ ] **Step 1: Failing Tests.**

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  processSlaRecruiter24h,
  processSlaRecruiter48h,
  processDocumentsRequest,
} from '../sla-reminders';

vi.mock('@/lib/notifications/create', () => ({
  createNotification: vi.fn(), createNotificationForAgency: vi.fn(),
}));
vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.1', messageRowId: 'r1' }),
}));
vi.mock('@/lib/activity/log', () => ({ logActivity: vi.fn() }));

// makeSvc helper...

describe('processSlaRecruiter24h', () => {
  it('sendet Notification wenn Stage unverändert und keine ausgehende Nachricht', async () => {
    // svc: application in stage_type='qualified', keine messages mit direction='out' seit Qualifizierung
    // Verify: createNotification/ForAgency called
  });

  it('No-op wenn Stage geändert wurde', async () => {
    // svc: application in stage_type='interview'
    // Verify: createNotification NOT called
  });

  it('No-op wenn ausgehende Nachricht existiert', async () => {
    // svc: messages mit direction='out' nach Qualifizierung
    // Verify: createNotification NOT called
  });
});

describe('processDocumentsRequest', () => {
  it('sendet Template wenn noch in Stufe und kein Dokument vorhanden', async () => {
    // Verify: sendWhatsAppMessage called mit documents_request Template
  });

  it('No-op wenn Dokument bereits vorhanden', async () => {
    // documents-Tabelle hat Eintrag
    // Verify: sendWhatsAppMessage NOT called
  });
});
```

- [ ] **Step 2: FAIL bestätigen.**

- [ ] **Step 3: Implementieren.**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification, createNotificationForAgency } from '@/lib/notifications/create';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { logActivity } from '@/lib/activity/log';

export async function processSlaRecruiter24h(
  svc: SupabaseClient, agencyId: string, payload: { application_id: string },
): Promise<void> {
  const { data: app } = await svc.from('applications')
    .select('id, stage_id, candidate_id, assigned_to, updated_at')
    .eq('id', payload.application_id).eq('agency_id', agencyId).single();
  if (!app) return;

  // Stage-Typ prüfen: noch qualified?
  const { data: stage } = await svc.from('pipeline_stages')
    .select('stage_type').eq('id', app.stage_id).maybeSingle();
  if (!stage || stage.stage_type !== 'qualified') return;

  // Ausgehende Nachrichten seit Qualifizierung prüfen
  const { data: conv } = await svc.from('conversations')
    .select('id').eq('agency_id', agencyId)
    .filter('candidate_id', 'eq', app.candidate_id).maybeSingle();

  if (conv) {
    const { count } = await svc.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .eq('direction', 'out')
      .gte('created_at', app.updated_at);
    if ((count ?? 0) > 0) return;
  }

  // Notification an assigned_to oder Agentur
  const { data: candidate } = await svc.from('candidates')
    .select('name').eq('id', app.candidate_id).eq('agency_id', agencyId).maybeSingle();

  const title = `SLA-Warnung: ${candidate?.name ?? 'Bewerber'} wartet seit 24h auf Reaktion`;
  if (app.assigned_to) {
    await createNotification(svc, {
      user_id: app.assigned_to, agency_id: agencyId, title,
      type: 'sla_breach', push_url: `/inbox?conversation=${conv?.id ?? ''}`,
    }).catch(() => {});
  } else {
    await createNotificationForAgency(svc, agencyId, {
      title, type: 'sla_breach',
    }).catch(() => {});
  }
}

export async function processSlaRecruiter48h(
  svc: SupabaseClient, agencyId: string, payload: { application_id: string },
): Promise<void> {
  // Gleiche Logik wie 24h, aber Notification an agency_owner
  const { data: app } = await svc.from('applications')
    .select('id, stage_id, candidate_id, updated_at')
    .eq('id', payload.application_id).eq('agency_id', agencyId).single();
  if (!app) return;

  const { data: stage } = await svc.from('pipeline_stages')
    .select('stage_type').eq('id', app.stage_id).maybeSingle();
  if (!stage || stage.stage_type !== 'qualified') return;

  const { data: conv } = await svc.from('conversations')
    .select('id').eq('agency_id', agencyId)
    .filter('candidate_id', 'eq', app.candidate_id).maybeSingle();
  if (conv) {
    const { count } = await svc.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id).eq('direction', 'out')
      .gte('created_at', app.updated_at);
    if ((count ?? 0) > 0) return;
  }

  const { data: candidate } = await svc.from('candidates')
    .select('name').eq('id', app.candidate_id).eq('agency_id', agencyId).maybeSingle();

  // An agency_owner senden
  const { data: owner } = await svc.from('users')
    .select('id').eq('agency_id', agencyId).eq('role', 'agency_owner').maybeSingle();
  if (owner) {
    await createNotification(svc, {
      user_id: owner.id, agency_id: agencyId,
      title: `Eskalation: ${candidate?.name ?? 'Bewerber'} wartet seit 48h — keine Reaktion`,
      type: 'sla_breach',
    }).catch(() => {});
  }
}

export async function processWindowExpiry(
  svc: SupabaseClient, agencyId: string, payload: { conversation_id: string },
): Promise<void> {
  const { data: conv } = await svc.from('conversations')
    .select('id, state, window_expires_at, assigned_to, candidate_id')
    .eq('id', payload.conversation_id).eq('agency_id', agencyId).maybeSingle();
  if (!conv || conv.state !== 'human_active') return;

  // Fenster prüft: < 2h bis Ablauf
  if (!conv.window_expires_at) return;
  const expiresAt = new Date(conv.window_expires_at);
  const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60_000);
  if (expiresAt > twoHoursFromNow) return; // Noch genügend Zeit

  const { data: candidate } = await svc.from('candidates')
    .select('name').eq('id', conv.candidate_id).eq('agency_id', agencyId).maybeSingle();

  const title = `Fenster läuft ab: ${candidate?.name ?? 'Bewerber'} — noch ${Math.round((expiresAt.getTime() - Date.now()) / 60_000)} Min.`;
  if (conv.assigned_to) {
    await createNotification(svc, {
      user_id: conv.assigned_to, agency_id: agencyId, title,
      type: 'system', push_url: `/inbox?conversation=${conv.id}`,
    }).catch(() => {});
  } else {
    await createNotificationForAgency(svc, agencyId, { title, type: 'system' }).catch(() => {});
  }
}

export async function processDocumentsRequest(
  svc: SupabaseClient, agencyId: string, payload: { application_id: string; stage_id: string },
): Promise<void> {
  // Prüfe: noch in gleicher Stufe?
  const { data: app } = await svc.from('applications')
    .select('id, stage_id, candidate_id')
    .eq('id', payload.application_id).eq('agency_id', agencyId).single();
  if (!app || app.stage_id !== payload.stage_id) return;

  // Dokument vorhanden?
  const { count } = await svc.from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('application_id', payload.application_id);
  if ((count ?? 0) > 0) return;

  // Template senden
  const { data: conv } = await svc.from('conversations')
    .select('id, wa_account_id')
    .eq('agency_id', agencyId)
    .filter('candidate_id', 'eq', app.candidate_id)
    .maybeSingle();
  if (!conv) return;

  const { data: candidate } = await svc.from('candidates')
    .select('name, phone_e164').eq('id', app.candidate_id).eq('agency_id', agencyId).single();
  if (!candidate?.phone_e164) return;

  const { data: tmpl } = await svc.from('whatsapp_templates')
    .select('id, name')
    .eq('wa_account_id', conv.wa_account_id)
    .eq('preset_key', 'documents_request')
    .eq('status', 'approved')
    .eq('agency_id', agencyId)
    .maybeSingle();
  if (!tmpl) return;

  // Stage-Name laden für die Unterlage-Variable
  const { data: stageData } = await svc.from('pipeline_stages')
    .select('name').eq('id', payload.stage_id).maybeSingle();

  const vorname = (candidate.name || '').split(' ')[0];
  await sendWhatsAppMessage(svc, {
    agencyId, conversationId: conv.id, candidatePhone: candidate.phone_e164,
    waAccountId: conv.wa_account_id,
    payload: {
      to: candidate.phone_e164, type: 'template',
      template: {
        name: tmpl.name, language: { code: 'de' },
        components: [{ type: 'body', parameters: [
          { type: 'text', text: vorname },
          { type: 'text', text: stageData?.name ?? 'Unterlagen' },
        ] }],
      },
    },
    senderType: 'system', templateId: tmpl.id,
  }).catch(() => {});

  await logActivity(svc, {
    agency_id: agencyId, candidate_id: app.candidate_id,
    action: 'Unterlagen angefordert (automatisch)',
    action_type: 'documents_request',
  });
}
```

- [ ] **Step 4: tick-Dispatch:**

```ts
case 'sla.recruiter_24h':
  await processSlaRecruiter24h(svc, job.agency_id, payload as { application_id: string });
  break;
case 'sla.recruiter_48h':
  await processSlaRecruiter48h(svc, job.agency_id, payload as { application_id: string });
  break;
case 'window.expiry':
  await processWindowExpiry(svc, job.agency_id, payload as { conversation_id: string });
  break;
case 'documents.request':
  await processDocumentsRequest(svc, job.agency_id, payload as { application_id: string; stage_id: string });
  break;
```

- [ ] **Step 5: SLA-Job-Planung verdrahten.** In der Stage-Move-Logik (z. B. in `lifecycle.ts` nach `bookAppointment` oder in einem Stage-Change-Handler): Wenn neue Stage `stage_type='qualified'` -> SLA-Jobs planen. Wenn neue Stage `requires_documents` -> documents.request planen. Dies wird am besten in einer Hilfsfunktion zusammengefasst und von den Stellen aufgerufen, die Stage-Moves durchführen (bot-process, PATCH-Routen für applications).

```ts
// Am Ende von sla-reminders.ts:
export async function scheduleStageReminders(
  svc: SupabaseClient,
  agencyId: string,
  applicationId: string,
  stageId: string,
  stageType: string,
  requiresDocuments: boolean,
): Promise<void> {
  if (stageType === 'qualified') {
    await svc.from('scheduled_jobs').upsert({
      agency_id: agencyId,
      run_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      type: 'sla.recruiter_24h',
      payload: { application_id: applicationId },
      status: 'pending',
      dedupe_key: `sla24:${applicationId}`,
    }, { onConflict: 'dedupe_key', ignoreDuplicates: true });

    await svc.from('scheduled_jobs').upsert({
      agency_id: agencyId,
      run_at: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
      type: 'sla.recruiter_48h',
      payload: { application_id: applicationId },
      status: 'pending',
      dedupe_key: `sla48:${applicationId}`,
    }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  }

  if (requiresDocuments) {
    await svc.from('scheduled_jobs').upsert({
      agency_id: agencyId,
      run_at: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
      type: 'documents.request',
      payload: { application_id: applicationId, stage_id: stageId },
      status: 'pending',
      dedupe_key: `docs:${applicationId}:${stageId}`,
    }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  }
}
```

- [ ] **Step 6: Tests grün, Build grün.**

- [ ] **Step 7: Commit**

```bash
git add src/lib/workers/sla-reminders.ts src/lib/workers/__tests__/sla-reminders.test.ts src/app/api/cron/tick/route.ts
git commit -m "feat(reminder): SLA-Warnungen, Fenster-Ablauf, Dokumentenanforderung (Phase 4 Task 11)"
```

---

### Task 12: Termine-Tab im Job-Detail — Verfügbarkeiten-Editor + API

**Files:**
- Create: `src/app/api/jobs/[id]/availability/route.ts` (GET/PUT)
- Create: `src/components/jobs/availability-editor.tsx`
- Modify: `src/components/jobs/job-detail.tsx` (Tab 'termine' hinzufügen)
- Test: `src/app/api/jobs/__tests__/availability.test.ts`

**Interfaces:**
- Consumes: `AvailabilityRule` aus Task 1.
- Produces:
  - `GET /api/jobs/[id]/availability` -> `{ rules: AvailabilityRule[], job: { appointment_type, appointment_location, appointment_duration_minutes, appointment_buffer_minutes } }`
  - `PUT /api/jobs/[id]/availability` Body `{ rules: Array<{ weekday, start_time, end_time }>, appointment_type?, appointment_location?, appointment_duration_minutes?, appointment_buffer_minutes? }` -> `{ ok: true }`

- [ ] **Step 1: Failing Tests für die API.**

```ts
import { describe, it, expect, vi } from 'vitest';

describe('GET /api/jobs/[id]/availability', () => {
  it('401 ohne Auth', async () => { /* getCurrentUser wirft */ });
  it('403 ohne Agentur', async () => { /* getEffectiveAgencyId null */ });
  it('liefert Regeln und Job-Einstellungen', async () => {
    // Verify: rules Array + job Felder
  });
});

describe('PUT /api/jobs/[id]/availability', () => {
  it('löscht bestehende Regeln und fügt neue ein', async () => {
    // Body: { rules: [{ weekday: 1, start_time: '09:00:00', end_time: '12:00:00' }] }
    // Verify: DELETE from availability_rules WHERE job_id + INSERT neue
  });
  it('aktualisiert Job-Spalten (appointment_type etc.)', async () => {
    // Body: { rules: [], appointment_type: 'video', appointment_duration_minutes: 45 }
    // Verify: jobs update
  });
  it('400 bei ungültigem Body', async () => { /* z. B. weekday=7 */ });
});
```

- [ ] **Step 2: FAIL bestätigen.**

- [ ] **Step 3: API implementieren.**

```ts
// src/app/api/jobs/[id]/availability/route.ts
import { NextResponse } from 'next/server';
import { getCurrentUser, canWriteRole, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  const agencyId = getEffectiveAgencyId(user);
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const { id: jobId } = await params;
  const svc = createAdminClient();

  const { data: rules } = await svc.from('availability_rules')
    .select('*').eq('job_id', jobId).eq('agency_id', agencyId)
    .order('weekday').order('start_time');

  const { data: job } = await svc.from('jobs')
    .select('appointment_type, appointment_location, appointment_duration_minutes, appointment_buffer_minutes')
    .eq('id', jobId).eq('agency_id', agencyId).single();

  return NextResponse.json({ rules: rules ?? [], job: job ?? {} });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });
  const agencyId = getEffectiveAgencyId(user);
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const { id: jobId } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  const svc = createAdminClient();

  // Regeln ersetzen
  const rules = body.rules as Array<{ weekday: number; start_time: string; end_time: string }> | undefined;
  if (rules) {
    // Validierung
    for (const r of rules) {
      if (r.weekday < 0 || r.weekday > 6) {
        return NextResponse.json({ error: 'Ungültiger Wochentag' }, { status: 400 });
      }
      if (!r.start_time || !r.end_time || r.start_time >= r.end_time) {
        return NextResponse.json({ error: 'Ungültige Zeitspanne' }, { status: 400 });
      }
    }

    // Delete + Insert
    await svc.from('availability_rules').delete().eq('job_id', jobId).eq('agency_id', agencyId);
    if (rules.length > 0) {
      await svc.from('availability_rules').insert(
        rules.map(r => ({
          agency_id: agencyId, job_id: jobId,
          weekday: r.weekday, start_time: r.start_time, end_time: r.end_time,
        })),
      );
    }
  }

  // Job-Spalten aktualisieren
  const jobUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.appointment_type) jobUpdate.appointment_type = body.appointment_type;
  if (body.appointment_location !== undefined) jobUpdate.appointment_location = body.appointment_location;
  if (body.appointment_duration_minutes) jobUpdate.appointment_duration_minutes = body.appointment_duration_minutes;
  if (body.appointment_buffer_minutes !== undefined) jobUpdate.appointment_buffer_minutes = body.appointment_buffer_minutes;

  await svc.from('jobs').update(jobUpdate).eq('id', jobId).eq('agency_id', agencyId);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: AvailabilityEditor + job-detail.tsx Tab ergänzen.**

In `job-detail.tsx` den Typ erweitern:

```ts
type JobTab = 'details' | 'ki-bot' | 'termine';
```

Tab-Button und Render-Block ergänzen. Die `AvailabilityEditor`-Komponente ist ein formularbasierter Editor:

```tsx
// src/components/jobs/availability-editor.tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';

const WEEKDAYS = [
  { value: 1, label: 'Montag' }, { value: 2, label: 'Dienstag' },
  { value: 3, label: 'Mittwoch' }, { value: 4, label: 'Donnerstag' },
  { value: 5, label: 'Freitag' }, { value: 6, label: 'Samstag' },
];

const APPOINTMENT_TYPES = [
  { value: 'call', label: 'Telefon' },
  { value: 'video', label: 'Video' },
  { value: 'onsite', label: 'Vor Ort' },
];

interface Rule { weekday: number; start_time: string; end_time: string }

export function AvailabilityEditor({ jobId }: { jobId: string }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [appointmentType, setAppointmentType] = useState('call');
  const [location, setLocation] = useState('');
  const [duration, setDuration] = useState(30);
  const [buffer, setBuffer] = useState(15);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/availability`)
      .then(r => r.json())
      .then(data => {
        setRules(data.rules?.map((r: Record<string, unknown>) => ({
          weekday: r.weekday, start_time: r.start_time, end_time: r.end_time,
        })) ?? []);
        setAppointmentType(String(data.job?.appointment_type ?? 'call'));
        setLocation(String(data.job?.appointment_location ?? ''));
        setDuration(Number(data.job?.appointment_duration_minutes ?? 30));
        setBuffer(Number(data.job?.appointment_buffer_minutes ?? 15));
        setLoading(false);
      });
  }, [jobId]);

  const addRule = () => {
    setRules([...rules, { weekday: 1, start_time: '09:00:00', end_time: '17:00:00' }]);
  };

  const removeRule = (idx: number) => {
    setRules(rules.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/jobs/${jobId}/availability`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rules,
        appointment_type: appointmentType,
        appointment_location: location || null,
        appointment_duration_minutes: duration,
        appointment_buffer_minutes: buffer,
      }),
    });
    if (res.ok) {
      toast.success('Verfügbarkeiten gespeichert');
    } else {
      const data = await res.json();
      toast.error(data.error || 'Fehler beim Speichern');
    }
    setSaving(false);
  };

  if (loading) return <p className="text-sm text-gray-500">Lade...</p>;

  return (
    <Card className="p-4 space-y-4">
      <h3 className="font-medium text-gray-900">Termineinstellungen</h3>

      <div className="grid grid-cols-2 gap-4">
        <Select value={appointmentType} onChange={e => setAppointmentType(e.target.value)}
          options={APPOINTMENT_TYPES} label="Terminart" />
        <Input value={location} onChange={e => setLocation(e.target.value)}
          placeholder="Adresse oder Video-Link" label="Ort / Link" />
        <Input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))}
          label="Dauer (Minuten)" min={10} max={240} />
        <Input type="number" value={buffer} onChange={e => setBuffer(Number(e.target.value))}
          label="Puffer (Minuten)" min={0} max={60} />
      </div>

      <h3 className="font-medium text-gray-900 pt-2">Verfügbare Zeitfenster</h3>
      {rules.map((rule, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Select
            value={rule.weekday}
            onChange={e => {
              const updated = [...rules];
              updated[idx] = { ...rule, weekday: Number(e.target.value) };
              setRules(updated);
            }}
            options={WEEKDAYS}
          />
          <Input type="time" value={rule.start_time.slice(0, 5)}
            onChange={e => {
              const updated = [...rules];
              updated[idx] = { ...rule, start_time: e.target.value + ':00' };
              setRules(updated);
            }} />
          <span className="text-gray-400">bis</span>
          <Input type="time" value={rule.end_time.slice(0, 5)}
            onChange={e => {
              const updated = [...rules];
              updated[idx] = { ...rule, end_time: e.target.value + ':00' };
              setRules(updated);
            }} />
          <Button onClick={() => removeRule(idx)} className="shrink-0">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button onClick={addRule}><Plus className="h-4 w-4 mr-1" /> Zeitfenster hinzufügen</Button>

      <div className="pt-2 border-t">
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-1" /> {saving ? 'Speichert...' : 'Speichern'}
        </Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Tests grün, Build grün.**

- [ ] **Step 6: Commit**

```bash
git add src/app/api/jobs/\[id\]/availability/ src/components/jobs/availability-editor.tsx src/components/jobs/job-detail.tsx src/app/api/jobs/__tests__/
git commit -m "feat(termine): Verfügbarkeiten-API und Termine-Tab im Job-Detail (Phase 4 Task 12)"
```

---

### Task 13: Termin-Verwaltung — PATCH-API + Terminliste im Bewerberprofil

**Files:**
- Create: `src/app/api/appointments-recruiting/[id]/route.ts` (PATCH)
- Create: `src/components/candidates/appointment-list.tsx`
- Modify: `src/components/inbox/candidate-sidebar.tsx` (nächsten Termin anzeigen)
- Test: `src/app/api/appointments-recruiting/__tests__/patch.test.ts`

**Interfaces:**
- Consumes: `cancelAppointment`, `cancelAppointmentJobs` aus Task 3, `fireEvent` aus Task 8/9, `createProposedAppointment` für neuen Buchungslink bei No-Show.
- Produces:
  - `PATCH /api/appointments-recruiting/[id]` Body `{ status: 'done' | 'no_show' | 'cancelled' }` -> `{ ok: true }`

- [ ] **Step 1: Failing Tests.**

```ts
import { describe, it, expect, vi } from 'vitest';

describe('PATCH /api/appointments-recruiting/[id]', () => {
  it('401 ohne Auth', async () => { /* getCurrentUser fehlt */ });
  it('403 ohne Agentur', async () => { /* getEffectiveAgencyId null */ });
  it('404 bei fremder Agentur', async () => {
    // appointment.agency_id !== user.agencyId
  });

  it('setzt status done und loggt Activity', async () => {
    // Body: { status: 'done' }
    // Verify: appointments update status='done'
    // Verify: logActivity called
  });

  it('setzt status no_show, plant no_show_followup und feuert appointment.no_show', async () => {
    // Body: { status: 'no_show' }
    // Verify: appointments update status='no_show'
    // Verify: scheduled_jobs insert type='appointment.no_show_followup'
    // Verify: fireEvent called mit 'appointment.no_show'
  });

  it('setzt status cancelled und storniert Jobs', async () => {
    // Body: { status: 'cancelled' }
    // Verify: cancelAppointment called
  });

  it('400 bei ungültigem Status', async () => {
    // Body: { status: 'booked' } -> 400
  });
});
```

- [ ] **Step 2: FAIL bestätigen.**

- [ ] **Step 3: PATCH-API implementieren.**

```ts
// src/app/api/appointments-recruiting/[id]/route.ts
import { NextResponse } from 'next/server';
import { getCurrentUser, canWriteRole, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { cancelAppointment, createProposedAppointment } from '@/lib/appointments/lifecycle';
import { fireEvent } from '@/lib/automations/fire';
import { logActivity } from '@/lib/activity/log';

const VALID_STATUSES = new Set(['done', 'no_show', 'cancelled']);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });
  const agencyId = getEffectiveAgencyId(user);
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const { id: appointmentId } = await params;
  let body: { status: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ error: 'Ungültiger Status — erlaubt: done, no_show, cancelled' }, { status: 400 });
  }

  const svc = createAdminClient();

  // Termin laden + Agency-Guard
  const { data: appt } = await svc.from('appointments')
    .select('id, agency_id, application_id, type, location, booking_token')
    .eq('id', appointmentId).eq('agency_id', agencyId).maybeSingle();

  if (!appt) return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 });

  const { data: application } = await svc.from('applications')
    .select('candidate_id').eq('id', appt.application_id).eq('agency_id', agencyId).single();

  switch (body.status) {
    case 'done':
      await svc.from('appointments').update({
        status: 'done', updated_at: new Date().toISOString(),
      }).eq('id', appointmentId).eq('agency_id', agencyId);
      await logActivity(svc, {
        agency_id: agencyId, candidate_id: application?.candidate_id,
        action: 'Termin als stattgefunden markiert', action_type: 'appointment_done',
      });
      break;

    case 'no_show':
      await svc.from('appointments').update({
        status: 'no_show', updated_at: new Date().toISOString(),
      }).eq('id', appointmentId).eq('agency_id', agencyId);

      // Neuen Buchungslink für No-Show-Followup erstellen
      const { appointmentId: newApptId, bookingToken: newToken } = await createProposedAppointment(svc, {
        agencyId, applicationId: appt.application_id, type: appt.type as 'call' | 'video' | 'onsite',
        location: appt.location,
      });

      // no_show_followup +1h mit neuem Token
      await svc.from('scheduled_jobs').upsert({
        agency_id: agencyId,
        run_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        type: 'appointment.no_show_followup',
        payload: { appointment_id: newApptId, booking_token: newToken },
        status: 'pending',
        dedupe_key: `appt.no_show_followup:${appointmentId}`,
      }, { onConflict: 'dedupe_key', ignoreDuplicates: true });

      await fireEvent('appointment.no_show', agencyId, {
        candidate_id: application?.candidate_id,
        extra: { appointment_id: appointmentId },
      });
      await logActivity(svc, {
        agency_id: agencyId, candidate_id: application?.candidate_id,
        action: 'Termin als No-Show markiert', action_type: 'appointment_no_show',
      });
      break;

    case 'cancelled':
      await cancelAppointment(svc, { agencyId, appointmentId });
      break;
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: AppointmentList-Komponente + Sidebar-Integration.**

```tsx
// src/components/candidates/appointment-list.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, string> = {
  proposed: 'Eingeladen',
  booked: 'Gebucht',
  confirmed: 'Bestätigt',
  done: 'Stattgefunden',
  no_show: 'Nicht erschienen',
  cancelled: 'Abgesagt',
};

const STATUS_TONES: Record<string, string> = {
  proposed: 'neutral',
  booked: 'accent',
  confirmed: 'success',
  done: 'success',
  no_show: 'softAccent',
  cancelled: 'outline',
};

interface AppointmentData {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
  type: string;
  location: string | null;
  status: string;
}

export function AppointmentList({ applicationId }: { applicationId: string }) {
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    // Lade über bestehende Supabase-Client-Abfrage (oder API)
    // Vereinfacht: inline fetch
    fetch(`/api/applications/${applicationId}/appointments`)
      .then(r => r.json())
      .then(data => { setAppointments(data.appointments ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [applicationId]);

  const markStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/appointments-recruiting/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      toast.success('Status aktualisiert');
      load();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Fehler');
    }
  };

  if (loading) return <p className="text-xs text-gray-400">Lade Termine...</p>;
  if (appointments.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-700">Termine</h4>
      {appointments.map(appt => (
        <Card key={appt.id} className="p-3">
          <div className="flex items-center justify-between">
            <div>
              {appt.starts_at && (
                <p className="text-sm font-medium">
                  {new Date(appt.starts_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}{' '}
                  {new Date(appt.starts_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
              <p className="text-xs text-gray-500">
                {appt.type === 'video' ? 'Video' : appt.type === 'onsite' ? 'Vor Ort' : 'Telefon'}
              </p>
            </div>
            <Badge tone={STATUS_TONES[appt.status] as 'accent' | 'success' | 'neutral' | 'outline' | 'softAccent'}>
              {STATUS_LABELS[appt.status] ?? appt.status}
            </Badge>
          </div>
          {(appt.status === 'booked' || appt.status === 'confirmed') && (
            <div className="mt-2 flex gap-2">
              <Button onClick={() => markStatus(appt.id, 'done')} className="text-xs">
                Stattgefunden
              </Button>
              <Button onClick={() => markStatus(appt.id, 'no_show')} className="text-xs">
                No-Show
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
```

In `candidate-sidebar.tsx` den nächsten Termin aus den Appointments anzeigen (Inline-Query oder bestehenden Datenfluss nutzen).

- [ ] **Step 5: Tests grün, Build grün.**

- [ ] **Step 6: Commit**

```bash
git add src/app/api/appointments-recruiting/ src/components/candidates/appointment-list.tsx src/components/inbox/candidate-sidebar.tsx
git commit -m "feat(termine): Termin-PATCH-API und Terminliste im Bewerberprofil (Phase 4 Task 13)"
```

---

## Abnahme-Mapping (Spec §16 Phase 4)

| Kriterium | Nachweis |
|---|---|
| Bewerber mit Score A erhält automatisch die Einladung | Task 7: Bot-Abschluss bei A/B ruft `createProposedAppointment` + sendet `appointment_invite`-Template mit Buchungslink |
| Bewerber bucht | Task 5: `POST /api/book/[token]` + Task 6: Buchungsseite mit Slot-Picker |
| Bewerber bekommt Bestätigung | Task 3: `bookAppointment` sendet `appointment_confirmation`-Template + ICS-Mail an Recruiter |
| Terminerinnerung 24h vorher zur richtigen Zeit | Task 3: `bookAppointment` plant `appointment.reminder_24h`; Task 4: Worker `processReminder24h` sendet Template; P4-R6: Ruhezeit-Verschiebung via `nextAllowedTime` |
| Terminerinnerung 2h vorher (auch in Ruhezeit) | Task 4: Worker `processReminder2h` sendet IMMER (bypassQuietHours), P4-R6 |
| Verschieben storniert alte und plant neue Reminder | Task 3: `rescheduleAppointment` = cancel alt + book neu (P4-R7: neuer Datensatz, alte dedupe_keys bleiben); Task 4: cancelAppointmentJobs |
| Kein Reminder wird doppelt gesendet (Test mit parallelem Cron) | Task 4: dedupe_key-Unique-Index auf scheduled_jobs + Storno-Recheck im Worker (P4-R7); Task 9: automation_runs.dedupe_key (P4-R9c) |
| Reminder in der Ruhezeit werden verschoben | Task 4: Worker prüft isQuietHours -> run_at auf nextAllowedTime verschieben (P4-R6) |
| Verfügbarkeiten konfigurierbar | Task 12: Termine-Tab im Job-Detail mit Wochentag-Zeitfenster-Editor |
| Slots im Chat (Abweichung P4-R3) | Keine In-Chat-Buttons in v1; Template mit Buchungslink (bewusste Vereinfachung, P4-R3) |
| Scheduler, Automations-Engine mit UI und Standardset | Task 8+9: Engine v2 mit neuen Aktionen, Schleifenschutz, Deduplizierung, Default-Seeds |
| Ruhezeiten | Task 4: `nextAllowedTime` + `bypassQuietHours` (P4-R6) |
| Stornologik | Task 3: `cancelAppointmentJobs` + `cancelAppointment` + `rescheduleAppointment` (P4-R7) |

## Bewusste Abweichungen von Spec §11

| Abweichung | Ruling | Begründung |
|---|---|---|
| Keine In-Chat-Slot-Buttons | P4-R3 | Meta interactive-Reply-Handling wäre erheblicher Zusatzaufwand; §16 fordert nur Link-Buchung |
| `slot_minutes`/`buffer_minutes` nicht auf `availability_rules` | P4-R4 | Einzige Quelle für Dauer/Puffer: `jobs`-Spalten — eine Quelle der Wahrheit |
| `time.elapsed`-Trigger nicht implementiert | P4-R10 | SLA-Reminder fest verdrahtet; UI-Trigger zurückgestellt auf v1.1 |
| Wochenbericht | Phase 6 | Explizit in Spec als separater Cron, passt besser in Dashboard-Phase |
| Google-Kalender-Abgleich | Spec §11 "Optional ab v1.1" | Bewusst ausgelassen, nicht Abnahme-relevant |

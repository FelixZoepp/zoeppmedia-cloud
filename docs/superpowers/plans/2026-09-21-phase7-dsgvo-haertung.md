# Phase 7: DSGVO, Härtung & Launch-Readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DSGVO-Compliance (Consent-Versionierung, Datenschutz-Links, Retention, Auskunft/Löschung), Sicherheits-Härtung (Rate-Limits, Turnstile, 2FA, Audit) und Launch-Readiness (CI, Lasttest, Betriebshandbuch) für die Recruiting-Plattform.

**Architecture:** Additive Migration erweitert audit_log-CHECKs, agencies.privacy_url, candidates-Consent-Felder und rate_limit_counters. Neue Libs unter src/lib/consent, src/lib/security, src/lib/dsgvo. Retention läuft als Best-Effort-Block im Daily-Cron. Export/Löschung als agency-gescopte API-Routen mit Audit. 2FA über Supabase MFA TOTP, env-gated Pflicht für Admins.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (service-role + RLS), Vitest, zod v4, pdf-lib (neu), Cloudflare Turnstile (env-gated), GitHub Actions.

**Spec:** docs/superpowers/specs/2026-09-21-spec-recruiting-plattform.md (§14 DSGVO, §16 Phase 7, §17)

## Global Constraints

- Service-Role umgeht RLS: JEDE Query auf agency-gescopte Tabellen (candidates, applications, messages, conversations, jobs, documents, usage_daily …) trägt explizit `.eq('agency_id', …)` oder ist über eine bereits agency-gescopte Parent-ID gescoped. Fehlendes Scoping = BLOCKER.
- Migrationen additiv, keine bestehende Tabelle/Spalte ändern oder löschen. Der Orchestrator wendet Migrationen via Supabase MCP an — der Implementierer schreibt NUR die Datei.
- Baseline: 697 Tests / 55 Dateien grün (HEAD 9da5614). Bestehende Tests dürfen nicht gelöscht oder abgeschwächt werden. Verifikation: `npx vitest run 2>&1 | grep -E "Test Files|Tests "`.
- Deutsche UI-Texte mit echten Umlauten (ä/ö/ü/ß), kein "ae/oe/ue".
- Auth-Ketten: Portal-Routen: getCurrentUser → 401 'Nicht autorisiert'; getEffectiveAgencyId → 403 'Keine Agentur'; Schreibzugriffe zusätzlich canWriteRole → 403 'Keine Schreibrechte'. Admin-Routen: 401, dann `user.role !== 'admin'` → 403. Cron-Routen: CRON_SECRET-Bearer-Check (500 wenn unset, 401 wenn falsch).
- Next 16: Routen-`params` ist ein Promise — `const { id } = await params`.
- Source-Enum überall: `['indeed','meta','form','manual']`.
- Env-gated Features dürfen das Live-System ohne gesetzte Keys NICHT brechen (Turnstile, REQUIRE_ADMIN_2FA): Fallback = Feature aus, Verhalten wie bisher.
- Neue Dependency nur pdf-lib. Kein Redis, kein zusätzlicher Infra-Dienst.

## Rulings

- P7-R1: DSGVO-Export-PDF via pdf-lib (rein serverseitig, keine Browser-Abhängigkeit). Kosten bei Irrtum: Layout simpel, ggf. Nacharbeit.
- P7-R2: Login-Audit, 12h-Sessions, Lockout nach 10 Fehlversuchen sind Supabase-Auth-Konfiguration (Dashboard) — Ops-Items im Betriebshandbuch (Task 9), kein App-Code. Code-Audit nur für export/anonymize/config-Änderungen.
- P7-R3: Rate-Limiting DB-basiert, fixed window über Tabelle rate_limit_counters, fail-open bei DB-Fehler. Kein Redis. Kosten: kein exaktes Sliding Window — für 20 req/10min ausreichend.
- P7-R4: Turnstile env-gated: ohne TURNSTILE_SECRET_KEY verifiziert der Server immer true; ohne NEXT_PUBLIC_TURNSTILE_SITE_KEY rendert das Formular kein Widget. Live-System bricht nicht.
- P7-R5: 2FA über Supabase MFA TOTP. Admin-Pflicht als env-Flag REQUIRE_ADMIN_2FA ('true' → Hard-Gate), Default nur Hinweis-Banner (Lockout-Risiko beim Flip ohne Enrollment).
- P7-R6: FB-M2 kein Fix — executeChangeStage/candidate_stages bedient das alte Kanban, nicht die applications-Stages; CSV-Import-Initial-Stage hat kein SLA-Problem.
- P7-R7: FB-M3 kein Fix — sync-whatsapp-Cron ist per `.eq('wa_account_id', account.id)` gescoped, doktrin-konform.
- CI prüft nur tsc + vitest; `next build` braucht Secrets und läuft ohnehin auf Vercel.
- Datenschutz-Link im Bot: erste Bot-Nachricht ist das Meta-Template application_received (nicht modifizierbar) → Link-Pflicht als System-Prompt-Regel in buildSystemBlocks für die erste Freitext-Nachricht.

## File Structure

- Create: `supabase/migrations/20260921000050_phase7_dsgvo.sql` — Audit-CHECK-Erweiterung, privacy_url, Consent-Felder, rate_limit_counters
- Create: `src/lib/consent/version.ts` — CONSENT_VERSION, CONSENT_TEXT
- Create: `src/lib/security/rate-limit.ts` + Test — checkRateLimit (fixed window)
- Create: `src/lib/security/turnstile.ts` + Test — verifyTurnstile
- Create: `src/lib/dsgvo/retention.ts` + Test — runRetention, anonymizeCandidate
- Create: `src/lib/dsgvo/export.ts` + Test — buildDsgvoExport (JSON-Struktur), renderDsgvoPdf
- Create: `src/app/api/candidates/[id]/dsgvo-export/route.ts`, `src/app/api/candidates/[id]/dsgvo-delete/route.ts`
- Create: `src/components/security/two-factor-setup.tsx`
- Create: `.github/workflows/ci.yml`, `src/lib/security/__tests__/tenant-doctrine.test.ts` (Pfad: neben rate-limit-Test), `scripts/loadtest-apply.mjs`, `docs/betriebshandbuch.md`
- Modify: `src/lib/audit/log.ts` (Typ-Erweiterung), `src/lib/automations/engine.ts` (FB-M1-Scoping), `src/app/api/candidates/[id]/recordings/route.ts` (TTL), `src/app/api/webhooks/meta/route.ts` (Query-Hoist), `src/app/(portal)/settings/page.tsx` (origin-Guard + privacy_url-Feld), `src/app/api/apply/route.ts` (Rate-Limit + Turnstile), `src/app/(public)/apply/[org_slug]/[job_slug]/apply-form.tsx` + `page.tsx` (Turnstile-Widget, Datenschutz-Link), `src/lib/recruiting/ingest.ts` (Consent-Version), `src/app/api/settings/profile/route.ts` (privacy_url), `src/lib/bot/prompt.ts` (privacyUrl-Regel), `src/app/api/cron/daily/route.ts` (Retention-Block), `src/app/(auth)/login/page.tsx` (MFA-Challenge), `src/components/candidates/candidate-info-cards.tsx` (Export/Löschen in ConsentCard)

---

### Task 1: Migration + Consent-Konstanten + Audit-Typ-Erweiterung

**Files:**
- Create: `supabase/migrations/20260921000050_phase7_dsgvo.sql`
- Create: `src/lib/consent/version.ts`
- Modify: `src/lib/audit/log.ts` (AuditEntry-Typen)

**Interfaces:**
- Produces: Tabelle `rate_limit_counters(key text PK, window_start timestamptz, count int)`; Spalten `agencies.privacy_url text`, `candidates.consent_version int`, `candidates.consent_text_snapshot text`, `candidates.anonymized_at timestamptz`; audit_log akzeptiert entity_type 'job','application','export' und action 'export','anonymize'; `CONSENT_VERSION: number` und `CONSENT_TEXT: string` aus `@/lib/consent/version`.

**WICHTIG:** Die Migration wird NICHT vom Implementierer angewendet — nur die Datei schreiben. Der Orchestrator wendet sie via Supabase MCP an.

- [ ] **Step 1: Migration schreiben**

```sql
-- Phase 7: DSGVO & Härtung (Spec §14, §16 Phase 7)

-- Audit-CHECKs erweitern (Typen in src/lib/audit/log.ts enthalten bereits 'job'/'application')
ALTER TABLE audit_log DROP CONSTRAINT audit_log_entity_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type IN ('candidate','agency','user','automation','template','pipeline_stage','consent','recording','settings','job','application','export'));
ALTER TABLE audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN ('create','update','delete','access','impersonate','export','anonymize'));

-- Datenschutzerklärung pro Mandant (Spec §14)
ALTER TABLE agencies ADD COLUMN privacy_url text;

-- Consent-Versionierung (Spec §14: Einwilligungstext + Version + Zeitpunkt + Quelle)
ALTER TABLE candidates ADD COLUMN consent_version int;
ALTER TABLE candidates ADD COLUMN consent_text_snapshot text;
ALTER TABLE candidates ADD COLUMN anonymized_at timestamptz;

-- Rate-Limiting fixed window (Ruling P7-R3)
CREATE TABLE rate_limit_counters (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 1
);
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;
-- Keine Policies: Zugriff nur über Service-Role
```

Hinweis: `ALTER TABLE … DROP CONSTRAINT` ist hier zulässig und gilt nicht als destruktiv — der CHECK wird unmittelbar breiter neu angelegt, keine Daten betroffen.

- [ ] **Step 2: Consent-Konstanten anlegen**

```ts
// src/lib/consent/version.ts
export const CONSENT_VERSION = 1;

export const CONSENT_TEXT =
  'Ich bin damit einverstanden, per WhatsApp kontaktiert zu werden. Meine Daten werden zur Bearbeitung meiner Bewerbung gespeichert. Ich kann meine Einwilligung jederzeit widerrufen.';
```

(Exakt der Text aus `apply-form.tsx` Zeile ~162 — muss zeichengleich sein.)

- [ ] **Step 3: Audit-Typen erweitern**

In `src/lib/audit/log.ts` die AuditEntry-Union erweitern: `entity_type` um `'export'` (falls 'job'/'application' schon vorhanden sind, nur 'export' ergänzen), `action` um `'export' | 'anonymize'`. Keine weiteren Änderungen.

- [ ] **Step 4: Verifikation + Commit**

Run: `npx tsc --noEmit` → sauber. `npx vitest run 2>&1 | grep -E "Test Files|Tests "` → 697 Tests / 55 Dateien unverändert.

```bash
git add supabase/migrations/20260921000050_phase7_dsgvo.sql src/lib/consent/version.ts src/lib/audit/log.ts
git commit -m "feat(phase7): DSGVO-Migration, Consent-Konstanten, Audit-Typen"
```

---

### Task 2: Härtungs-Bündel (FB-M1, Recording-TTL, Meta-Webhook-Hoist, Settings-Origin)

**Files:**
- Modify: `src/lib/automations/engine.ts:232-288` (executeChangeStage + executeSetField)
- Modify: `src/app/api/candidates/[id]/recordings/route.ts:67`
- Modify: `src/app/api/webhooks/meta/route.ts:71-90`
- Modify: `src/app/(portal)/settings/page.tsx`
- Test: `src/lib/automations/__tests__/engine.test.ts` (bestehende Datei erweitern; falls Tests woanders liegen, dort ergänzen)

**Interfaces:**
- Consumes: bestehende Signaturen unverändert.
- Produces: keine neuen Interfaces — reine Härtung.

- [ ] **Step 1: FB-M1 — Agency-Scoping in engine.ts**

In `executeChangeStage` und `executeSetField`: jedes `update` auf `candidates`, das bisher nur `.eq('id', context.candidate_id)` trägt, zusätzlich mit `.eq('agency_id', context.agency_id)` scopen. Insert in `candidate_stages` unverändert (candidate_id bereits verifiziert).

- [ ] **Step 2: Test für Scoping schreiben**

Im bestehenden Engine-Test einen Test ergänzen, der über den Supabase-Mock verifiziert, dass die update-Kette für candidates sowohl `eq('id', …)` als auch `eq('agency_id', …)` aufruft (Mock-Aufrufliste prüfen, Muster der bestehenden Engine-Tests übernehmen). Erst fehlschlagen lassen (vor Step 1 committen ist nicht nötig — Test und Fix im selben Commit, aber Test einmal gegen alten Stand laufen lassen, wenn praktikabel).

- [ ] **Step 3: Recording-URL-TTL reduzieren**

`src/app/api/candidates/[id]/recordings/route.ts:67`: `createSignedUrl(storagePath, 365 * 24 * 60 * 60)` → `createSignedUrl(storagePath, 3600)`.

- [ ] **Step 4: Meta-Webhook lead_sources-Query hoisten**

In `src/app/api/webhooks/meta/route.ts`: die lead_sources-Query (`.eq('kind','meta').eq('active',true)`) aus der inneren `for entries → for changes`-Schleife VOR die Schleife ziehen (einmal pro Request laden, danach in-memory nach page/form matchen wie bisher). Verhalten identisch, N+1 entfällt.

- [ ] **Step 5: Settings origin-Guard**

In `src/app/(portal)/settings/page.tsx`: `const origin = typeof window !== 'undefined' ? window.location.origin : '';` einmal definieren und alle drei `window.location.origin`-Nutzungen (~Zeile 91, 367, 374) darauf umstellen.

- [ ] **Step 6: Verifikation + Commit**

Run: `npx tsc --noEmit` sauber; `npx vitest run 2>&1 | grep -E "Test Files|Tests "` → mindestens +1 Test gegenüber 697, keine Datei-Reduktion.

```bash
git add -u
git commit -m "fix(phase7): Agency-Scoping in Automation-Engine, Recording-TTL 1h, Meta-Webhook-Hoist, Settings-Origin-Guard"
```

---

### Task 3: Rate-Limiting + Turnstile auf /api/apply

**Files:**
- Create: `src/lib/security/rate-limit.ts`
- Create: `src/lib/security/turnstile.ts`
- Modify: `src/app/api/apply/route.ts`
- Modify: `src/app/(public)/apply/[org_slug]/[job_slug]/apply-form.tsx`
- Test: `src/lib/security/__tests__/rate-limit.test.ts`, `src/lib/security/__tests__/turnstile.test.ts`

**Interfaces:**
- Produces: `checkRateLimit(svc: SupabaseClient, key: string, limit: number, windowSeconds: number): Promise<boolean>` (true = erlaubt); `verifyTurnstile(token: string | null): Promise<boolean>`.

- [ ] **Step 1: Failing Tests für checkRateLimit schreiben**

```ts
// src/lib/security/__tests__/rate-limit.test.ts — Fälle:
// 1. Kein bestehender Zähler → upsert mit count 1, Rückgabe true
// 2. Zähler im Fenster unter Limit → update count+1, Rückgabe true
// 3. Zähler im Fenster auf Limit → Rückgabe false, kein update
// 4. Zähler mit abgelaufenem window_start → Reset (upsert count 1, neues window_start), true
// 5. DB-Fehler beim select → fail-open: Rückgabe true
```

Supabase-Mock nach Muster der bestehenden Worker-Tests (from().select().eq().maybeSingle() etc.).

- [ ] **Step 2: rate-limit.ts implementieren**

```ts
// src/lib/security/rate-limit.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export async function checkRateLimit(
  svc: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const now = new Date();
    const { data, error } = await svc
      .from('rate_limit_counters')
      .select('window_start, count')
      .eq('key', key)
      .maybeSingle();
    if (error) return true; // fail-open (Ruling P7-R3)

    const windowStart = data ? new Date(data.window_start) : null;
    const expired =
      !windowStart || now.getTime() - windowStart.getTime() > windowSeconds * 1000;

    if (!data || expired) {
      await svc
        .from('rate_limit_counters')
        .upsert({ key, window_start: now.toISOString(), count: 1 }, { onConflict: 'key' });
      return true;
    }
    if (data.count >= limit) return false;
    await svc
      .from('rate_limit_counters')
      .update({ count: data.count + 1 })
      .eq('key', key);
    return true;
  } catch {
    return true; // fail-open
  }
}
```

- [ ] **Step 3: Failing Tests für verifyTurnstile schreiben**

```ts
// Fälle:
// 1. TURNSTILE_SECRET_KEY unset → true ohne fetch (Ruling P7-R4)
// 2. Secret gesetzt, token null → false
// 3. Secret gesetzt, siteverify success:true → true
// 4. Secret gesetzt, siteverify success:false → false
// 5. fetch wirft → false
```

`vi.stubEnv` + `vi.stubGlobal('fetch', …)` verwenden, in afterEach zurücksetzen.

- [ ] **Step 4: turnstile.ts implementieren**

```ts
// src/lib/security/turnstile.ts
export async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // env-gated: ohne Key kein Zwang (Ruling P7-R4)
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: apply-Route integrieren**

In `src/app/api/apply/route.ts` (TODO-Kommentar Zeile 2 entfernen), direkt nach dem Parsen der formData und VOR der Job-Validierung:

```ts
const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
const allowed = await checkRateLimit(svc, `apply:${ip}`, 20, 600);
if (!allowed) {
  return NextResponse.json(
    { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    { status: 429 }
  );
}
const turnstileOk = await verifyTurnstile(formData.get('turnstileToken') as string | null);
if (!turnstileOk) {
  return NextResponse.json(
    { error: 'Sicherheitsprüfung fehlgeschlagen. Bitte lade die Seite neu.' },
    { status: 400 }
  );
}
```

(`svc` = der bereits vorhandene Service-Role-Client der Route.)

- [ ] **Step 6: Turnstile-Widget im Formular**

In `apply-form.tsx`: wenn `process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY` gesetzt ist, vor dem Submit-Button rendern:

```tsx
{siteKey ? (
  <>
    <div className="cf-turnstile" data-sitekey={siteKey} data-response-field-name="turnstileToken" />
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
  </>
) : null}
```

mit `const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;` und `import Script from 'next/script';`. Turnstile schreibt das Token als hidden input `turnstileToken` ins Formular — die Route liest es aus formData. Ohne siteKey: kein Widget, Route verifiziert ohnehin true.

- [ ] **Step 7: Verifikation + Commit**

`npx tsc --noEmit` sauber; Testzahl ≥ 707 (mind. +10). `next build` NICHT nötig (UI-Änderung minimal, tsc deckt ab).

```bash
git add src/lib/security src/app/api/apply/route.ts "src/app/(public)/apply/[org_slug]/[job_slug]/apply-form.tsx"
git commit -m "feat(phase7): Rate-Limit + Turnstile auf Bewerbungs-Endpoint"
```

---

### Task 4: Consent-Versionierung + Datenschutz-Link (Formular, Settings, Bot)

**Files:**
- Modify: `src/lib/recruiting/ingest.ts` (Consent-Schreibstellen ~149-161 und ~179-181)
- Modify: `src/app/api/settings/profile/route.ts` (privacy_url im agency-Branch)
- Modify: `src/app/(portal)/settings/page.tsx` (privacy_url-Eingabefeld)
- Modify: `src/app/(public)/apply/[org_slug]/[job_slug]/page.tsx` + `apply-form.tsx` (Link unter Consent-Checkbox)
- Modify: `src/lib/bot/prompt.ts` (buildSystemBlocks: privacyUrl-Regel)
- Test: bestehende ingest-Tests erweitern (Consent-Version-Assertions), prompt-Tests erweitern

**Interfaces:**
- Consumes: `CONSENT_VERSION`, `CONSENT_TEXT` aus `@/lib/consent/version` (Task 1).
- Produces: `PromptContext.privacyUrl?: string | null`; agencies.privacy_url editierbar über PATCH /api/settings/profile.

- [ ] **Step 1: ingest.ts — Consent-Version schreiben**

An BEIDEN Schreibstellen (Update-Zweig ~149-161 und Insert-Zweig ~179-181), überall dort, wo `whatsapp_opt_in: true, consent_at, consent_source` gesetzt wird, zusätzlich:

```ts
consent_version: CONSENT_VERSION,
consent_text_snapshot: CONSENT_TEXT,
```

Import: `import { CONSENT_VERSION, CONSENT_TEXT } from '@/lib/consent/version';`

- [ ] **Step 2: ingest-Tests erweitern**

In den bestehenden ingest-Tests die Assertions der Consent-Schreibpfade um `consent_version: 1` und `consent_text_snapshot` (Text-Prüfung via `expect.stringContaining('WhatsApp')`) ergänzen — Update- UND Insert-Fall.

- [ ] **Step 3: privacy_url in Settings-API**

`src/app/api/settings/profile/route.ts`, agency-Branch: zod-Schema um `privacyUrl: z.string().url().nullable().optional()` erweitern (leerer String → null normalisieren); im updates-Objekt `privacy_url: privacyUrl` setzen, nur wenn im Payload vorhanden.

- [ ] **Step 4: privacy_url in Settings-UI**

In `src/app/(portal)/settings/page.tsx` im Agentur-Profil-Formular ein Feld ergänzen: Label „Link zur Datenschutzerklärung", Input type="url", Placeholder „https://…", Wert aus der geladenen Agentur, wird mit dem bestehenden Speichern-Flow als `privacyUrl` mitgesendet. Hilfetext: „Wird im Bewerbungsformular und vom WhatsApp-Bot verlinkt."

- [ ] **Step 5: Datenschutz-Link im Bewerbungsformular**

`page.tsx` der Apply-Seite: im agencies-Select `privacy_url` mitladen und als Prop `privacyUrl` an das Formular geben. In `apply-form.tsx` direkt unter der Consent-Checkbox:

```tsx
{privacyUrl ? (
  <p className="text-xs text-muted-foreground">
    Details in der{' '}
    <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="underline">
      Datenschutzerklärung
    </a>
    .
  </p>
) : null}
```

- [ ] **Step 6: Bot-System-Prompt-Regel**

`src/lib/bot/prompt.ts`: `PromptContext` um `privacyUrl?: string | null` erweitern. In `buildSystemBlocks` (Zeile ~174), wenn `ctx.privacyUrl` gesetzt: Block ergänzen mit Regel: „Weise in deiner ersten Freitext-Nachricht kurz auf die Datenschutzerklärung hin: {url}. Danach nicht wiederholen." Aufrufer des Prompts (Bot-Worker) lädt `privacy_url` mit der bereits geladenen Agentur und reicht sie durch — die Agentur-Query dort ist bereits gescoped, nur das Select-Feld ergänzen.

- [ ] **Step 7: Prompt-Test ergänzen**

Bestehende prompt-Tests: ein Test mit privacyUrl gesetzt (Block enthält URL), einer ohne (Block fehlt).

- [ ] **Step 8: Verifikation + Commit**

tsc sauber, Testzahl steigt (+≥4), keine Datei-Reduktion.

```bash
git add -u && git add src/lib/consent 2>/dev/null; git commit -m "feat(phase7): Consent-Versionierung + Datenschutz-Link in Formular, Settings und Bot"
```

---

### Task 5: Retention-Routine + Daily-Cron-Wiring

**Files:**
- Create: `src/lib/dsgvo/retention.ts`
- Modify: `src/app/api/cron/daily/route.ts` (Best-Effort-Block nach dem Usage-Block)
- Test: `src/lib/dsgvo/__tests__/retention.test.ts`

**Interfaces:**
- Produces: `anonymizeCandidate(svc: SupabaseClient, agencyId: string, candidateId: string, actorUserId: string | null): Promise<void>`; `runRetention(svc: SupabaseClient): Promise<{ checked: number; anonymized: number }>`.
- Consumes: `logAudit` aus `@/lib/audit/log` (action 'anonymize', Task 1).

- [ ] **Step 1: Failing Tests schreiben**

```ts
// retention.test.ts — Fälle:
// anonymizeCandidate:
// 1. Löscht documents-Dateien (storage.remove mit storage_path-Liste) und documents-Zeilen (agency-gescoped)
// 2. Nullt application_answers (answer_raw, answer_normalized, question_text) für die Applications des Kandidaten
// 3. Nullt applications.summary/score_reasons (agency-gescoped)
// 4. Nullt messages.body/media_path über conversation_ids (agency-gescoped)
// 5. Setzt notes.text auf 'Anonymisiert (DSGVO)' via candidate_id
// 6. Anonymisiert candidates-PII-Felder + anonymized_at, agency-gescoped
// 7. Ruft logAudit mit action 'anonymize' auf
// runRetention:
// 8. Agentur mit retention_days null → Default 180 im Cutoff
// 9. Kandidat mit offener Application → übersprungen
// 10. Kandidat alt + keine offenen Applications → anonymisiert, Zähler stimmt
```

- [ ] **Step 2: retention.ts implementieren**

```ts
// src/lib/dsgvo/retention.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { logAudit } from '@/lib/audit/log';

export async function anonymizeCandidate(
  svc: SupabaseClient,
  agencyId: string,
  candidateId: string,
  actorUserId: string | null
): Promise<void> {
  const { data: apps } = await svc
    .from('applications')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('candidate_id', candidateId);
  const appIds = (apps ?? []).map((a) => a.id);

  if (appIds.length > 0) {
    const { data: docs } = await svc
      .from('documents')
      .select('id, storage_path')
      .eq('agency_id', agencyId)
      .in('application_id', appIds);
    const paths = (docs ?? []).map((d) => d.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await svc.storage.from('candidate-resumes').remove(paths);
    }
    if ((docs ?? []).length > 0) {
      await svc.from('documents').delete().eq('agency_id', agencyId).in('application_id', appIds);
    }
    await svc
      .from('application_answers')
      .update({ answer_raw: null, answer_normalized: null, question_text: null })
      .in('application_id', appIds);
    await svc
      .from('applications')
      .update({ summary: null, score_reasons: null })
      .eq('agency_id', agencyId)
      .eq('candidate_id', candidateId);
  }

  const { data: convs } = await svc
    .from('conversations')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('candidate_id', candidateId);
  const convIds = (convs ?? []).map((c) => c.id);
  if (convIds.length > 0) {
    await svc
      .from('messages')
      .update({ body: null, media_path: null })
      .eq('agency_id', agencyId)
      .in('conversation_id', convIds);
  }

  await svc.from('notes').update({ text: 'Anonymisiert (DSGVO)' }).eq('candidate_id', candidateId);

  await svc
    .from('candidates')
    .update({
      name: 'Anonymisiert',
      email: null,
      phone: null,
      phone_e164: null,
      location: null,
      experience_summary: null,
      last_employer: null,
      indeed_job_title: null,
      resume_url: null,
      vorquali_json: null,
      anonymized_at: new Date().toISOString(),
    })
    .eq('agency_id', agencyId)
    .eq('id', candidateId);

  await logAudit(svc, {
    agency_id: agencyId,
    user_id: actorUserId,
    entity_type: 'candidate',
    entity_id: candidateId,
    action: 'anonymize',
    changes: null,
  });
}

export async function runRetention(
  svc: SupabaseClient
): Promise<{ checked: number; anonymized: number }> {
  let checked = 0;
  let anonymized = 0;
  const { data: agencies } = await svc.from('agencies').select('id, retention_days');
  for (const agency of agencies ?? []) {
    const days = agency.retention_days ?? 180;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data: candidates } = await svc
      .from('candidates')
      .select('id')
      .eq('agency_id', agency.id)
      .is('anonymized_at', null)
      .lt('created_at', cutoff)
      .limit(200);
    for (const cand of candidates ?? []) {
      checked += 1;
      const { count: openCount } = await svc
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', agency.id)
        .eq('candidate_id', cand.id)
        .eq('status', 'open');
      if ((openCount ?? 0) > 0) continue;
      const { data: recent } = await svc
        .from('applications')
        .select('id')
        .eq('agency_id', agency.id)
        .eq('candidate_id', cand.id)
        .gt('updated_at', cutoff)
        .limit(1);
      if ((recent ?? []).length > 0) continue;
      await anonymizeCandidate(svc, agency.id, cand.id, null);
      anonymized += 1;
    }
  }
  return { checked, anonymized };
}
```

Anmerkung: `logAudit`-Signatur/Felder exakt an `src/lib/audit/log.ts` anpassen (AuditEntry-Interface lesen); `agencies.retention_days` existiert bereits — falls die Spalte fehlt, STOPP und melden (dann ist die Annahme falsch und die Migration aus Task 1 muss ergänzt werden).

- [ ] **Step 3: Daily-Cron-Wiring**

In `src/app/api/cron/daily/route.ts` nach dem Phase-6-Usage-Block einen weiteren Best-Effort-Block im selben Muster:

```ts
try {
  const { runRetention } = await import('@/lib/dsgvo/retention');
  results.retention = await runRetention(supabase);
} catch (err) {
  console.error('[cron-daily] retention failed', err);
  results.retention = { error: String(err) };
}
```

(Variablennamen an den umgebenden Code angleichen.)

- [ ] **Step 4: Verifikation + Commit**

tsc sauber; Testzahl +≥10.

```bash
git add src/lib/dsgvo src/app/api/cron/daily/route.ts
git commit -m "feat(phase7): DSGVO-Retention mit Anonymisierung im Daily-Cron"
```

---

### Task 6: DSGVO-Export (JSON+PDF) + Löschung + UI

**Files:**
- Create: `src/lib/dsgvo/export.ts`
- Create: `src/app/api/candidates/[id]/dsgvo-export/route.ts`
- Create: `src/app/api/candidates/[id]/dsgvo-delete/route.ts`
- Modify: `src/components/candidates/candidate-info-cards.tsx` (ConsentCard, ~Zeile 190-230)
- Modify: `package.json` (pdf-lib)
- Test: `src/lib/dsgvo/__tests__/export.test.ts`

**Interfaces:**
- Consumes: `anonymizeCandidate` (Task 5), `logAudit` (action 'export').
- Produces: `buildDsgvoExport(svc, agencyId, candidateId): Promise<DsgvoExport | null>` (null = Kandidat nicht gefunden/fremde Agentur); `renderDsgvoPdf(data: DsgvoExport): Promise<Uint8Array>`.

- [ ] **Step 1: pdf-lib installieren**

Run: `npm install pdf-lib`

- [ ] **Step 2: Failing Tests für buildDsgvoExport schreiben**

```ts
// export.test.ts — Fälle:
// 1. Kandidat fremder Agentur / nicht vorhanden → null
// 2. Vollständiger Export: candidate-Stammdaten, consent (version, text, at, source),
//    applications (job-Titel, status, created_at), answers, messages (Richtung, Zeit, Body),
//    notes — alle Queries agency-gescoped (Mock-Aufrufe prüfen)
// 3. renderDsgvoPdf liefert Uint8Array, beginnt mit %PDF-Magic-Bytes
```

- [ ] **Step 3: export.ts implementieren**

```ts
// src/lib/dsgvo/export.ts — Struktur:
export interface DsgvoExport {
  exportedAt: string;
  candidate: Record<string, unknown>;
  consent: { optIn: boolean; version: number | null; text: string | null; at: string | null; source: string | null };
  applications: Array<Record<string, unknown>>;
  answers: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
}
```

`buildDsgvoExport`: candidates-Select agency-gescoped (`.eq('agency_id').eq('id').maybeSingle()`); wenn null → null. Danach applications (`.eq('agency_id').eq('candidate_id')`), application_answers via `.in('application_id', appIds)`, conversations agency-gescoped → messages via `.eq('agency_id').in('conversation_id', convIds)` (Felder: direction, created_at, body), notes via `.eq('candidate_id')`. `renderDsgvoPdf`: pdf-lib `PDFDocument.create()`, StandardFonts.Helvetica, Titel „Datenauskunft (Art. 15 DSGVO)", je Sektion Überschrift + Zeilen, einfacher Seitenumbruch bei y < 60, `doc.save()` zurückgeben. Umlaute: WinAnsi kodiert ä/ö/ü/ß korrekt — kein Custom-Font nötig.

- [ ] **Step 4: Export-Route**

```ts
// src/app/api/candidates/[id]/dsgvo-export/route.ts — GET, Portal-Auth-Kette:
// getCurrentUser → 401 'Nicht autorisiert'; getEffectiveAgencyId → 403 'Keine Agentur';
// canWriteRole → 403 'Keine Schreibrechte'. const { id } = await params.
// const data = await buildDsgvoExport(svc, agencyId, id); if (!data) 404 'Kandidat nicht gefunden'.
// logAudit action 'export', entity_type 'candidate', entity_id id.
// ?format=pdf → renderDsgvoPdf, Response mit Content-Type application/pdf,
// Content-Disposition attachment; filename="dsgvo-export-{id}.pdf".
// sonst JSON mit Content-Disposition attachment; filename="dsgvo-export-{id}.json".
```

- [ ] **Step 5: Delete-Route**

```ts
// src/app/api/candidates/[id]/dsgvo-delete/route.ts — POST, gleiche Auth-Kette inkl. canWriteRole.
// Existenz-Check candidates .eq('agency_id').eq('id').maybeSingle() → 404 bei fremden/fehlenden.
// await anonymizeCandidate(svc, agencyId, id, user.id);
// (anonymizeCandidate auditiert selbst mit 'anonymize'.)
// Rückgabe { ok: true }.
```

- [ ] **Step 6: ConsentCard-UI**

In der ConsentCard (`candidate-info-cards.tsx` ~190-230) unter den StatusRows: zwei Links „Export (JSON)" / „Export (PDF)" als `<a href={`/api/candidates/${candidateId}/dsgvo-export`}>` bzw. `…?format=pdf` (download-Attribut), plus Button „Daten löschen (DSGVO)" in destruktiver Optik mit `confirm('Alle personenbezogenen Daten dieses Kandidaten werden unwiderruflich anonymisiert. Fortfahren?')`, POST auf dsgvo-delete, bei Erfolg `router.refresh()` + sonner-Toast „Kandidat anonymisiert". candidateId als vorhandene Prop nutzen (Komponente prüfen).

- [ ] **Step 7: Verifikation + Commit**

tsc sauber; Testzahl +≥5; keine bestehende Datei reduziert.

```bash
git add -u && git add src/lib/dsgvo src/app/api/candidates
git commit -m "feat(phase7): DSGVO-Auskunft (JSON/PDF) und Löschrecht mit Audit"
```

---

### Task 7: 2FA (TOTP) — Setup-Komponente, Login-Challenge, Admin-Gate

**Files:**
- Create: `src/components/security/two-factor-setup.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(portal)/settings/page.tsx` (Sicherheits-Sektion mit TwoFactorSetup)
- Modify: `src/app/(internal)/admin/layout.tsx` bzw. das Admin-Root-Layout (Banner/Gate — exakten Pfad im Repo prüfen: `src/app/admin/…` oder Route-Group)

**Interfaces:**
- Consumes: Supabase-Browser-Client (bestehender `createClient` aus `@/lib/supabase/client` o. ä. — Muster aus login/page.tsx übernehmen).
- Produces: `<TwoFactorSetup />` (selbstständige Client-Komponente, keine Props nötig).

- [ ] **Step 1: TwoFactorSetup-Komponente**

```tsx
// src/components/security/two-factor-setup.tsx — 'use client'. Ablauf:
// 1. Beim Mount supabase.auth.mfa.listFactors() → verified TOTP-Faktor vorhanden?
//    → Zustand 'aktiv' mit Button „2FA entfernen" (mfa.unenroll({ factorId }) + confirm).
// 2. Kein Faktor: Button „2FA aktivieren" → mfa.enroll({ factorType: 'totp' })
//    → QR (data.totp.qr_code als <img src>) + Secret als Text anzeigen.
// 3. 6-stelliges Code-Feld → mfa.challenge({ factorId }) → mfa.verify({ factorId, challengeId, code })
//    → Erfolg: sonner-Toast „Zwei-Faktor-Authentifizierung aktiviert", Zustand 'aktiv'.
// 4. Fehler jeweils als Toast mit deutscher Meldung („Code ungültig. Bitte erneut versuchen.").
```

- [ ] **Step 2: Settings-Einbindung**

In `src/app/(portal)/settings/page.tsx` eine Karte „Sicherheit" mit Beschreibung „Zwei-Faktor-Authentifizierung (TOTP) für dein Konto" und `<TwoFactorSetup />` ergänzen (Platzierung analog bestehender Karten).

- [ ] **Step 3: Login-Challenge**

In `src/app/(auth)/login/page.tsx` nach erfolgreichem `signInWithPassword`:

```ts
const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
if (aal?.nextLevel === 'aal2' && aal.currentLevel !== aal.nextLevel) {
  // MFA-Schritt anzeigen statt redirect
}
```

MFA-Schritt: `listFactors()` → ersten verified TOTP-Faktor nehmen → `challenge` → Code-Input („Code aus deiner Authenticator-App") → `verify` → danach der bestehende Redirect-Flow (/admin bzw. /dashboard). Falscher Code: Fehlermeldung „Code ungültig.", Feld leeren.

- [ ] **Step 4: Admin-Gate (env-gated, Ruling P7-R5)**

Im Admin-Layout serverseitig: wenn `process.env.REQUIRE_ADMIN_2FA === 'true'`, AAL via Supabase-Server-Client prüfen (`getAuthenticatorAssuranceLevel`); `nextLevel === 'aal2' && currentLevel !== 'aal2'` → redirect auf /login. Zusätzlich, wenn Flag NICHT gesetzt und der Admin keinen verified Faktor hat: dezentes Banner „Aktiviere 2FA in den Einstellungen — für Admin-Konten wird sie bald Pflicht." (kein Block). Wenn das Admin-Layout eine reine Server-Komponente ist, Banner als kleine Client-Insel oder rein statisch nach Server-Check rendern.

- [ ] **Step 5: Verifikation + Commit**

tsc sauber; `npm run build` einmal laufen lassen (Auth-Flows berühren Layouts); Testzahl unverändert ok (UI-Task, keine Unit-Tests gefordert).

```bash
git add -u && git add src/components/security
git commit -m "feat(phase7): 2FA (TOTP) mit Login-Challenge und env-gated Admin-Pflicht"
```

---

### Task 8: Audit-Erweiterung + CI-Workflow + Tenant-Doktrin-Test

**Files:**
- Modify: Automations-Config-Routen (`src/app/api/automations/**`) und Bot-Config-Routen (Settings/Bot) — überall wo Automationen/Bot-Konfiguration per POST/PATCH/DELETE geändert werden: `logAudit` mit passendem entity_type ('automation' bzw. 'settings') und action ('create'/'update'/'delete') ergänzen. Genaue Routen per Glob `src/app/api/automations/**/route.ts` und Grep nach Bot-Config-Route ermitteln.
- Create: `.github/workflows/ci.yml`
- Create: `src/lib/security/__tests__/tenant-doctrine.test.ts`

**Interfaces:**
- Consumes: `logAudit`, `diffChanges` aus `@/lib/audit/log`.
- Produces: CI-Gate auf jedem Push; statischer Doktrin-Test.

- [ ] **Step 1: Audit in Config-Routen**

In jeder gefundenen Automations-/Bot-Config-Mutationsroute nach erfolgreichem Write:

```ts
await logAudit(svc, {
  agency_id: agencyId,
  user_id: user.id,
  entity_type: 'automation', // bzw. 'settings' bei Bot-Config
  entity_id: automationId,
  action: 'update', // bzw. 'create'/'delete'
  changes: diffChanges(oldRow, newRow, ['name', 'active', 'trigger', 'actions']), // Felder je Route anpassen; bei create/delete null
});
```

Best-Effort (try/catch mit console.error) — Audit-Fehler darf die Mutation nicht brechen.

- [ ] **Step 2: CI-Workflow**

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx vitest run
```

- [ ] **Step 3: Tenant-Doktrin-Test**

```ts
// src/lib/security/__tests__/tenant-doctrine.test.ts
// Statischer Scan: liest rekursiv alle .ts-Dateien unter src/app/api und src/lib/workers.
// Für jede Datei, die .from('candidates') | .from('applications') | .from('messages')
// | .from('conversations') | .from('jobs') enthält, MUSS der Dateiinhalt auch den
// String 'agency_id' ODER einen der bekannten Scoping-Marker ('wa_account_id',
// 'candidate_id') enthalten. Whitelist-Konstante für begründete Ausnahmen
// (jede mit Kommentar, initial leer). Test schlägt fehl mit Liste der Verstöße.
// fs/path aus node: verwenden, process.cwd() als Wurzel.
```

Erst laufen lassen: schlägt eine Bestandsdatei fehl, Datei INSPIZIEREN — echtes Loch → fixen (mit `.eq('agency_id', …)`), begründete Ausnahme → Whitelist-Eintrag MIT Kommentar. Keine pauschalen Whitelist-Schüttungen.

- [ ] **Step 4: Verifikation + Commit**

tsc sauber; Testzahl +≥1; alle Tests grün.

```bash
git add -u && git add .github src/lib/security/__tests__/tenant-doctrine.test.ts
git commit -m "feat(phase7): Audit für Config-Änderungen, CI-Workflow, Tenant-Doktrin-Test"
```

---

### Task 9: Lasttest-Skript + Betriebshandbuch

**Files:**
- Create: `scripts/loadtest-apply.mjs`
- Create: `docs/betriebshandbuch.md`

**Interfaces:** keine — Skript + Doku.

- [ ] **Step 1: Lasttest-Skript**

```js
// scripts/loadtest-apply.mjs — Node 22, keine Dependencies.
// Usage: node scripts/loadtest-apply.mjs <BASE_URL> <ORG_SLUG> <JOB_SLUG> [total=1000] [concurrency=50]
// Baut FormData-Bewerbungen (Name 'Lasttest {i}', Telefon +49151-Zufallsnummern,
// consentWhatsapp 'true', KEIN PDF) und feuert sie mit begrenzter Parallelität via fetch.
// Misst: Gesamtdauer, p50/p95/p99-Latenz, Statuscode-Verteilung (inkl. erwarteter 429
// durch das Rate-Limit — Hinweis im Output: für Volllast TURNSTILE/Rate-Limit-Key
// einer Staging-Umgebung nutzen oder Limit temporär hochsetzen).
// NIEMALS gegen Produktion mit echten Agenturen ohne ausdrückliche Freigabe — Warnung
// im Skript-Header und Abbruch, wenn BASE_URL 'zoepp' enthält und --force fehlt.
```

- [ ] **Step 2: Betriebshandbuch schreiben**

`docs/betriebshandbuch.md` mit Sektionen (jede konkret ausformuliert, keine Platzhalter):

1. **Supabase-Auth-Härtung (Ruling P7-R2):** Dashboard → Auth-Settings: Session-Lebensdauer 12h (JWT expiry + refresh token rotation), Lockout/Rate-Limits für Sign-in (10 Fehlversuche), E-Mail-OTP-Expiry. Schrittweise Klickanleitung.
2. **Backups & Restore:** PITR-Status prüfen, Restore-Probe vierteljährlich (Projekt-Fork → Stichproben-Query auf candidates-Count), Verantwortlicher + Protokollfeld.
3. **Env-Flags & Secrets:** Tabelle aller Envs mit Zweck und Flip-Anleitung: CRON_SECRET, RESEND_API_KEY, WEEKLY_REPORTS_ENABLED, INDEED_APPLY_SECRET, TURNSTILE_SECRET_KEY + NEXT_PUBLIC_TURNSTILE_SITE_KEY (erst Site-Key deployen, Widget prüfen, dann Secret setzen), REQUIRE_ADMIN_2FA (erst wenn ALLE Admins enrolled sind — Lockout-Risiko), Meta-Page-Tokens (Ablauf/Erneuerung), OPENAI/Anthropic-Keys.
4. **Meta/WhatsApp-Betrieb:** Template-Status-Sync (stündlicher Cron), Qualitäts-Rating beobachten, Nummern-Limits, Vorgehen bei 'flagged'.
5. **Monitoring & Alarme:** Admin-Übersicht (Ampel), Ingest-Monitor im Daily-Cron, Vercel-Logs, wohin eskalieren.
6. **DSGVO-Betrieb:** Auskunft/Löschung über Kandidaten-Detail (ConsentCard), Retention-Default 180 Tage (agencies.retention_days pro Mandant), AVV-Checkliste (Supabase, Vercel, Meta, OpenAI/Anthropic, Resend), Verzeichnis von Verarbeitungstätigkeiten-Hinweis.
7. **Launch-Checkliste Pilot → 100 Kunden:** Turnstile aktiv, 2FA aller Admins, Lasttest gegen Staging bestanden (1000 Bewerbungen/10min, p95 < 3s), Restore-Probe dokumentiert, Preistabelle meta_pricing geprüft, Datenschutzerklärungs-URLs aller Mandanten gepflegt.

- [ ] **Step 3: Verifikation + Commit**

`node --check scripts/loadtest-apply.mjs` fehlerfrei; tsc/vitest unverändert grün.

```bash
git add scripts/loadtest-apply.mjs docs/betriebshandbuch.md
git commit -m "docs(phase7): Lasttest-Skript und Betriebshandbuch"
```

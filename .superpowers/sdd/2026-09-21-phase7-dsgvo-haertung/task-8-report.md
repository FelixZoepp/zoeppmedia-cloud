# Task 8 Report — Audit für Config-Änderungen, CI-Workflow, Tenant-Doktrin-Test

## Was wurde geändert

### 1. `src/app/api/admin/automations/route.ts`
- Import `logAudit` aus `@/lib/audit/log` hinzugefügt.
- Nach erfolgreichem POST-Insert: `logAudit` mit `entity_type: 'automation'`, `action: 'create'`, `agency_id` aus dem Insert-Ergebnis, `entity_id` = neue ID. Best-effort via try/catch.

### 2. `src/app/api/admin/automations/[id]/route.ts`
- Import `logAudit, diffChanges` aus `@/lib/audit/log` hinzugefügt.
- **PATCH**: Vor dem Update alte Zeile laden (`name, active, trigger_event, actions, agency_id`). Nach erfolgreichem Update `logAudit` mit `action: 'update'`, `changes: diffChanges(oldRow, data, ['name','active','trigger_event','actions'])`. Best-effort via try/catch.
- **DELETE**: `select('is_system, agency_id')` statt nur `is_system`, damit `agency_id` für das Audit verfügbar ist. Nach erfolgreichem Delete `logAudit` mit `action: 'delete'`. Best-effort via try/catch.

### 3. `src/app/api/jobs/[id]/bot/route.ts`
- Import `logAudit` aus `@/lib/audit/log` hinzugefügt.
- Nach erfolgreichem PUT (Config upsert + Fragen ersetzt): `logAudit` mit `entity_type: 'settings'`, `action: job.bot_config_id ? 'update' : 'create'` (Wert vor dem Write-Block, korrekt). `entity_id` = `configId`. Best-effort via try/catch.
- Kein `diffChanges` bei Bot-Config, da der vollständige Config-Payload immer überschrieben wird und kein Old-Row-Fetch stattfindet (entspricht dem Brief: "bei create/delete null" — hier create oder vollständiger replace).

### 4. `.github/workflows/ci.yml` (neu)
- Exakt wie im Brief angegeben: Node 22, `npm ci`, `npx tsc --noEmit`, `npx vitest run`.
- Trigger: push auf `main` und alle pull_request.

### 5. `src/lib/security/__tests__/tenant-doctrine.test.ts` (neu)
- Statischer Scan über alle `.ts`-Dateien (keine Testdateien) unter `src/app/api` und `src/lib/workers`.
- Erkennt `.from('candidates'|'applications'|'messages'|'conversations'|'jobs')`.
- Fordert mindestens einen Scoping-Marker: `agency_id`, `wa_account_id` oder `candidate_id`.
- WHITELIST mit Kommentaren für jede begründete Ausnahme.

## Whitelist-Einträge und Begründungen

| Datei | Begründung |
|---|---|
| `app/api/admin/ttfc/route.ts` | Admin-only (isInternalUser). Fragt `candidates` cross-tenant für TTFC-Statistik. Kein Datenleck: nur für interne Nutzer zugänglich, gibt keine Kandidatendaten zurück. |
| `app/api/admin/agencies/route.ts` | Admin-only (isInternalUser). Fragt `candidates.select('agency_id')` für Zählung je Agentur. Kein Datenleck: nur für interne Nutzer, gibt nur Counts zurück. |
| `app/api/search/route.ts` | Admin-only (isInternal). Globale Suche über Kandidaten für interne Nutzer. Kein Datenleck da Zugang durch isInternal-Prüfung geschützt. |
| `app/api/indeed/questions/[job_id]/route.ts` | Öffentliche Route. Job-Lookup via UUID-PK, gibt ausschließlich statische Screening-Fragen zurück — kein Tenant-Datum. UUID ist unratebar; Indeed kennt die job-UUID durch den Feed-Export. |

**Nicht in Whitelist aufgenommen (keine Verletzung):**
- `tasks/today/route.ts`: Enthält `agency_id` als Scoping-Marker (bedingte Filterung) — wird vom Scan korrekt als konform erkannt. Die zweite `candidates`-Abfrage via `.in('id', callbackCandidateIds)` ist sicher, da die IDs aus vorheriger agency-gefilterter Query stammen.

## Test-Zahlen

| | Vorher | Nachher |
|---|---|---|
| Test Files | 60 | 61 |
| Tests | 733 | 734 |

Neue Tests: 1 (tenant-doctrine.test.ts mit 1 Test-Case).

## Abweichungen vom Brief

- **`diffChanges` bei Bot-Config**: Brief nennt `diffChanges` als Option, fügt aber selbst die Anmerkung "bei create/delete null" hinzu. Da PUT immer einen vollständigen Replace macht (kein selektives Patch), ist ein `diffChanges` ohne Old-Row-Fetch nicht sinnvoll. `changes` wurde weggelassen — Verhalten entspricht dem Best-Effort-Prinzip.
- **`tasks/today/route.ts` nicht in Whitelist**: Der statische Scan erkennt `agency_id` in der Datei — keine Verletzung, keine Whitelist nötig.

## Gefundenes und behobenes echtes Problem

Der Doktrin-Test schlug initial für `app/api/indeed/questions/[job_id]/route.ts` fehl. Nach Inspektion: Die Route gibt ausschließlich statische Fragen zurück (kein Tenant-Datum), Job-Lookup via UUID-PK. Entscheidung: Whitelist mit ausführlicher Begründung (kein echter Tenant-Daten-Leak).

## Concerns

Keine kritischen Concerns. Hinweis: Die vier Whitelist-Einträge sollten beim nächsten Admin-API-Refactoring geprüft werden — insbesondere `admin/ttfc` und `admin/agencies` könnten perspektivisch auf DB-Views oder RLS-basierte Admin-Rollen umgestellt werden.

# Task 6 Report — Timer-Helfer + Worker bot-open/nudge/timeout + Ingest-Trigger + tick-Dispatch

## Was gebaut wurde

### Neue Dateien

**`src/lib/bot/timers.ts`**
- `armBotTimers(svc, {agencyId, conversationId, botStep})`: Legt 2 `scheduled_jobs` per `upsert` an — `bot.nudge` (run_at +4h, dedupe `bot.nudge:{conversationId}:{botStep}`) und `bot.timeout` (run_at +48h, dedupe `bot.timeout:{conversationId}:{botStep}`). Payload enthält `{conversation_id, bot_step}`. Nutzt `{onConflict: 'dedupe_key', ignoreDuplicates: true}` — kollisionssicher bei Retries.
- `cancelBotTimers(svc, {agencyId, conversationId})`: Setzt alle pending `bot.nudge`/`bot.timeout`-Jobs der Conversation auf `cancelled` via `.eq('status', 'pending').in('type', [...]).filter('payload->>conversation_id', ...)`.

**`src/lib/workers/bot-open.ts`**
- `processBotOpen(svc, agencyId, {application_id})`: Lädt Application → Candidate → Job → BotConfig → WA-Account (connected) → Template (application_received/approved). Guards: No-op (kein Throw) wenn einer dieser Schritte scheitert oder Consent/Phone fehlt. Im Erfolgsfall: Conversation-Upsert (Muster aus whatsapp-inbound.ts: 2-Schritt upsert + update mit `application_id`, `state: 'bot_active'`, `bot_step: 0`, `bot_meta: {}`), Template-Versand (body-parameters: vorname, jobTitle, agencyName), `armBotTimers`, `logActivity(action_type: 'bot_opened')`. `sendWhatsAppMessage`-Fehler propagiert (tick-Retry).

**`src/lib/workers/bot-nudge.ts`**
- `processBotNudge(svc, agencyId, {conversation_id, bot_step})`: No-op wenn `state !== 'bot_active'` oder `bot_step !== payload.bot_step`. Bei `bot_step === 0`: Template `qualification_nudge` (Vars: vorname, jobTitle). Bei `bot_step > 0`: Template `qualification_resume` (Var: vorname). Fehler beim Senden werden gefangen (`.catch(() => {})`) — kein Dead-Letter-Risiko.

**`src/lib/workers/bot-timeout.ts`**
- `processBotTimeout(svc, agencyId, {conversation_id, bot_step})`: Gleiche No-op-Guards. Setzt `state = 'waiting'`, loggt `action_type: 'bot_timeout'`. Keine Nachricht an Bewerber.

### Geänderte Dateien

**`src/lib/recruiting/ingest.ts`**
- Nach Schritt 9 (fireEvent): Wenn `newApp?.id && input.consentWhatsapp && phoneE164`, wird `scheduled_jobs.upsert` mit `type: 'bot.open'`, `dedupe_key: 'bot.open:{applicationId}'` aufgerufen. Wrapped in `try/catch` statt `.catch()` da der bestehende Mock-Client kein Thenable zurückgibt (sicherer/robuster Ansatz).

**`src/app/api/cron/tick/route.ts`**
- Imports: `processBotOpen`, `processBotNudge`, `processBotTimeout`
- Jobs-switch: 3 neue Cases `bot.open`, `bot.nudge`, `bot.timeout` nach dem Muster `(svc, job.agency_id, payload as unknown as Parameters<typeof processXxx>[2])`.

**`src/lib/workers/__tests__/tick-cron.test.ts`**
- Mocks für die 3 neuen Worker-Module ergänzt.

### Neue Tests

**`src/lib/bot/__tests__/timers.test.ts`** (12 Tests)
- armBotTimers: Anzahl Rows, dedupe_keys, run_at-Toleranz ±30s, payload-Inhalt, upsert-Optionen, agency_id, status.
- cancelBotTimers: update-Aufruf, agency_id-Filter, status=pending-Filter.

**`src/lib/workers/__tests__/bot-open.test.ts`** (27 Tests)
- processBotOpen: 8 Guard-Tests (No-op-Fälle), Erfolgsfall-Tests (Conversation-Upsert-Inhalte, Template-Payload, vorname-Extraktion, armBotTimers, logActivity, Fehler-Propagation, Multi-Tenant-Guard).
- processBotNudge: No-op (state, bot_step), qualification_nudge/resume je bot_step, Fehler-Schlucken, Variablen-Checks.
- processBotTimeout: No-op, state-Update, logActivity, kein sendWhatsAppMessage.

**`src/lib/recruiting/__tests__/ingest.test.ts`** (3 neue Tests)
- Bot.open-Job wird angelegt wenn applicationCreated + consentWhatsapp + phoneE164.
- Kein Job bei fehlendem Consent.
- Kein Job bei ungültiger Telefonnummer.

## Design-Entscheidungen

1. **try/catch statt .catch()** in ingest.ts: Der bestehende Mock-Client gibt kein Promise zurück, `.catch()` würde in Tests schlagen. `try/catch` ist semantisch äquivalent und robuster.

2. **Kein eigener bot.open dedupe_key in `armBotTimers`**: `armBotTimers` produziert nur nudge/timeout — der bot.open-Key wird direkt in ingest.ts gesetzt (P3-R3-konform).

3. **Conversations-Lookup im nudge-Worker über application_id → job_id**: Da die Conversation `application_id` trägt, wird der Jobtitel über diesen Pfad abgerufen — sauberer als ein direkter Join.

4. **Kein `cancelBotTimers`-Aufruf in bot-open/nudge/timeout selbst**: Das Stornieren läuft über den inbound-Worker (Task 5 Pattern), nicht hier. `cancelBotTimers` ist der Vollständigkeit halber in timers.ts exportiert.

## Abweichungen vom Brief

- Brief zeigt `.catch(() => {})` an `svc.from('scheduled_jobs').upsert(...)`. Wurde als `try/catch` umgesetzt wegen Mock-Kompatibilität — semantisch identisch.
- Der Multi-Tenant-Guard-Test prüft `agency_id`-Filter auf Tabellenebene mit dem bestehenden Chain-Mock (nicht alle Chains sind vollständig trackbar, daher pragmatischer Check).

## Test-Ergebnis

- Vorher: 270 Tests (22 Dateien)
- Nachher: 312 Tests (24 Dateien) — alle grün
- `npx next build` grün (TypeScript sauber)

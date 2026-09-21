# Task 7 Report — Kern-Worker `bot-process`

## Was wurde gebaut

### Neue Dateien
- **`src/lib/workers/bot-process.ts`** — Kern-Worker `processBotTurn(svc, agencyId, payload, attempts)`. Verarbeitet einen Dialog-Turn vollständig: Conversation-Guard, Inbound-Idempotenz, Application+Job+Config+Questions+Answers laden, PromptContext bauen, LLM-Aufruf, Intent-Routing, Antwort-Upsert, Abschluss-Scoring, Handover-Delegation.
- **`src/lib/bot/handover.ts`** — `handoverToHuman(svc, args)`: setzt `state='human_active'`, ruft `cancelBotTimers` auf, sendet Best-Effort-Nachricht ("Alles klar — ein Kollege meldet sich gleich bei dir."), erstellt Notification (an `assigned_to` oder ganze Agentur), loggt `action_type='bot_handover'`.
- **`src/lib/workers/__tests__/bot-process.test.ts`** — 16 Tests (12 Haupt + 4 Sub-Cases).

### Geänderte Dateien
- **`src/lib/workers/whatsapp-inbound.ts`** — Bot-Hook nach Schritt 4 (Message-Insert), vor Schritt 6 (Media-Download): Bei `conv.state === 'bot_active'` werden alte Bot-Timer gecancelt, ein pending `bot.process`-Job geprüft (SELECT-Dedupe, P3-R3), und wenn keiner existiert ein neuer mit `run_at = now+8s` eingefügt. Import von `cancelBotTimers` ergänzt.
- **`src/app/api/cron/tick/route.ts`** — Import `processBotTurn` ergänzt; neuer `case 'bot.process': await processBotTurn(svc, job.agency_id, payload as { conversation_id: string }, job.attempts); break;` im Dispatch-Switch.

## Design-Entscheidungen

1. **max_turns-Guard nach LLM**: Der Turn-Zähler-Check passiert nach dem LLM-Aufruf (bewusst: der aktuelle Turn wird mitgezählt). Wäre der Check vorher, käme der Bewerber auf exakt `max_turns` Antworten ohne Prüfung — so greift der Guard korrekt wenn `currentTurns >= cfg.max_turns`.

2. **low_confidence-Reset bei hoher Confidence**: Per Spec Test 6b — wenn nach einem unsicheren Turn wieder eine hohe Confidence (>= 0.6) kommt, wird `low_confidence` auf 0 gesetzt. Nur zwei konsekutive niedrige Confidence-Turns lösen Übergabe aus.

3. **needs_clarification + currentQuestionKey**: Der clarify-Zähler läuft nur auf `currentQuestionKey` (die erste offene Required-Frage), nicht auf alle Fragen gleichzeitig. Das entspricht dem Spec-Wortlaut "derselben Frage".

4. **Scoring-Antworten-Dedup**: Beim Abschluss-Scoring werden `existingAnswers` + `validAnswers` dedupliziert per Map (validAnswers überschreiben existierende — der aktuelle LLM-Turn ist der neueste Stand).

5. **Preflight-Fehler beim Senden**: Wenn `sendWhatsAppMessage` mit einem Preflight-Fehler wirft (Fenster zu, opt_in fehlt etc.), wird im Abschluss-Block ignoriert und im normalen Turn-Block via `return` beendet (Timer bleiben aktiv, Nudge-Template übernimmt). Andere Fehler werden re-thrown.

6. **bot.process ohne dedupe_key** (P3-R3): Statt `dedupe_key` wird ein SELECT auf pending jobs gemacht. Das verhindert Race-Conditions ohne DB-Unique-Constraint-Abhängigkeit, und der Worker selbst ist idempotent (prüft auf neue Inbound-Nachrichten seit letzter Out-Nachricht).

7. **Chain-Mock mit `then`-Protokoll**: Der Test-Chain-Mock wurde mit einem `.then`-Property ausgestattet, damit Supabase-Chains ohne `.single()` / `.maybeSingle()` (z.B. `.select().eq().order().limit()`) als Thenable await-bar sind und Queue-Einträge liefern.

## Testliste (16 Tests)

| Nr | Name | Status |
|----|------|--------|
| 1  | Conversation nicht mehr bot_active → No-op, kein LLM-Aufruf | ✓ |
| 2  | Keine neuen Inbound-Nachrichten → No-op (Idempotenz) | ✓ |
| 3  | Normale Antwort: application_answers upserted, reply gesendet, Timer re-armed | ✓ |
| 4  | Antworten auf nicht-konfigurierte question_keys NICHT gespeichert (P3-R10) | ✓ |
| 5  | intent: handover_request → handoverToHuman, kein Weiterfragen | ✓ |
| 5b | handover: true → handoverToHuman, kein Weiterfragen | ✓ |
| 6a | confidence < 0.6 zweimal → Übergabe | ✓ |
| 6b | einmal niedrig, dann hoch → Zähler-Reset, kein Handover | ✓ |
| 7a | needs_clarification → clarify-Zähler inkrementiert, kein Handover | ✓ |
| 7b | clarify-Zähler > 2 → Übergabe | ✓ |
| 8  | bot_meta.turns >= max_turns → Übergabe "Maximale Gesprächslänge erreicht" | ✓ |
| 9  | Alle required-Fragen beantwortet → Scoring, state=waiting, logActivity bot_completed | ✓ |
| 10 | Bereits beantwortete Fragen (Indeed) übersprungen; currentQuestionKey = erste offene | ✓ |
| 11a| llmJsonCall wirft + attempts < 3 → Fehler propagiert | ✓ |
| 11b| llmJsonCall wirft + attempts >= 3 → handoverToHuman "Bot gerade nicht verfügbar" | ✓ |
| 12 | intent: stop → No-op, kein Handover, state unangetastet | ✓ |

## Abweichungen vom Brief

Keine inhaltlichen Abweichungen. Implementierungsdetails:
- Der `.eq('payload->>conversation_id', conversationId)` Filter im inbound-Hook stimmt mit dem Brief-Code exakt überein.
- `job.attempts` im tick-Dispatch ist korrekt 4-arg gemäß Brief.
- `action_type: 'bot_handover'` und `'bot_completed'` in logActivity gemäß Spec.

## Test-Ergebnis

`npx vitest run` → **328 passed** (312 vorher + 16 neue). `npx next build` → grün.

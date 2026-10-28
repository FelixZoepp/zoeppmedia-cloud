<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Geschäftsregeln (verbindlich für alle Agenten: Claude, Codex, …)

1. **Keine automatische Nachricht an Kunden, Leads oder Bewerber ohne Freigabe.** Jeder neue Versandweg (WhatsApp, Mail, SMS) prüft direkt vor dem Senden `istFreigegeben(svc, '<key>')` aus `src/lib/freigaben.ts`; neue Keys dort mit Titel/„was“/„wirkt“ anlegen – Standard AUS. Felix schaltet unter `/admin/freigaben` frei.
2. **Ohne Freigabe nichts nachholen.** Ist der Schalter aus, Job als erledigt markieren bzw. Stufe vermerken – nicht zurückstellen. Fixes und Deploys dürfen nie alte Nachrichten auslösen.
3. **Nie zu vergangenen Terminen schreiben** (Erinnerungen/Bestätigungen prüfen `start_time > now`).
4. **Keine Preise öffentlich**, keine Angebote/PDFs an Leads. `paket_definitionen` ist nur intern lesbar.
5. **Secrets nie in Code, Chat oder Logs.** Env-Variablen setzt Felix in Vercel.
6. **Mandantentrennung:** Jede Abfrage mit Service-Role (`createAdminClient`) filtert auf `agency_id`. Kunden-Agentur über `getEffectiveAgencyId(user)`. Schreibende Kunden-Routen prüfen `canWriteRole` (agency_viewer = nur lesen).
7. **Neuer Fremdschlüssel auf eine schon verknüpfte Tabelle** macht PostgREST-Embeds mehrdeutig (HTTP 300 → leere Inbox). Vorher alle Embeds mit FK-Namen eindeutig machen (`pipeline_stages!candidates_current_stage_id_fkey(...)`) und live prüfen.
8. **Datenbank-Änderungen nur als Migration** in `supabase/migrations/` (und live einspielen) – nie nur im Dashboard.
9. **Vor jedem Push:** `npx tsc --noEmit`, `npx vitest run`, bei größeren Änderungen `next build`. Ergebnis prüfen, dann pushen. Commit-Autor `felix@zh-digitalisierung.de`.
10. **+4915202159031** ist Felix' Testnummer – nie in `users.phone`.

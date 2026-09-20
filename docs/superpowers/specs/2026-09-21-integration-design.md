# Integrations-Design: Recruiting-Plattform in Zoepp Media Cloud

Stand: 2026-09-21 · Ergänzt `2026-09-21-spec-recruiting-plattform.md` (verbindliche Spec).
Dieses Dokument regelt NUR die Abweichungen/Zuordnungen zur bestehenden Codebase. Bei allem anderen gilt die Spec.

## Entscheidungen (mit Felix abgestimmt)

1. **Datenmodell A (Spec-konform):** Neue Tabellen `jobs`, `applications`, `application_answers`. Bestehende `candidates` bleiben die Personen-Tabelle. Migration: pro Agentur ein Default-Job „Vertriebsmitarbeiter (D2D)", jeder Bestandskandidat erhält eine `application` darauf; Pipeline-Stufe wandert von `candidates` an `applications`.
2. **Rollen-Mapping** (keine Umbenennung bestehender Enum-Werte):

   | Spec | Bestand | Änderung |
   |---|---|---|
   | Platform Admin | `admin` | + Impersonation mit Audit + Banner |
   | Org Admin | `agency_owner` | — |
   | Recruiter | `agency_member` | + optionale `job_assignments` |
   | Viewer | **neu:** `agency_viewer` | neuer Enum-Wert |
   | — | `employee` | unberührt (Zoepp-Fulfillment) |

3. **Autonomer Durchbau:** Alle 8 Bauphasen der Spec, Ziel launchfähig für 100 Mandanten. Offene Punkte der Spec (Abschnitt 17) werden mit den dort genannten Annahmen umgesetzt und im Code kommentiert.

## Zuordnung Spec-Begriffe → Bestand

| Spec | Bestand | Vorgehen |
|---|---|---|
| `organizations` | `agencies` | Tabelle behalten. Neue Spalten: `slug`, `timezone` (default Europe/Berlin), `retention_days` (default 180), `settings jsonb`. Kein Rename. |
| `profiles` / `memberships` | `users` (mit `agency_id`, `role`) | Behalten. Ein Nutzer = eine Agentur bleibt in v1 (Mehrfach-Mitgliedschaft aus Spec entfällt — YAGNI, Datenmodell nicht blockierend). |
| `candidates` | `candidates` | Erweitern: `phone_e164`, `consent_at`, `consent_source`, `language`, `deleted_at`. `whatsapp_opt_in` bleibt als Consent-Flag. |
| `pipeline_stages` (typed) | `recruiting_stages` (Fahrplan) + Legacy-Phasen | **Neue** Tabelle `pipeline_stages` je Agentur mit festem `type` (new, qualifying, qualified, interview, offer, hired, rejected), geseedet aus den bisherigen Kanban-Phasen. `recruiting_stages`/Fahrplan bleibt unberührt (anderes Konzept: Kunden-Onboarding). |
| Queue `events_inbox` | — (Webhooks synchron) | Neu. Bestehende Meta-/Indeed-Webhooks werden auf „nur einqueuen + 200" umgestellt; Worker verarbeitet über Minuten-Cron. |
| Scheduler `scheduled_jobs` | Daily-Cron + Cadence | Neu: `scheduled_jobs` + `/api/cron/tick` (jede Minute). Bestehende Daily-Jobs bleiben; neue Reminder laufen ausschließlich über `scheduled_jobs`. |
| Automations | `automations`/`automation_runs` + `fireEvent()` | Bestehende Engine erweitern (neue Trigger/Aktionen aus Spec, Schleifenschutz, dedupe_key), nicht neu bauen. |
| Termine | `candidate_appointments` + Calendly | Neue Spec-Buchung (`appointments`, `availability_rules`, `/book/{token}`) an `applications` gehängt. Calendly bleibt als Alternative bestehen. |
| E-Mail | Resend | Wiederverwendet. |
| Indeed | E-Mail-Inbound (Resend) | Bleibt als Fallback-Quelle (`source: indeed_email`). Neu: XML-Feed + Indeed Apply postUrl + Redirect-Modus per `jobs.indeed_mode`. |
| KI | `@anthropic-ai/sdk` vorhanden | Neu gekapselt als `LlmClient` (Modelle aus Env/Config). Dialog: claude-haiku-4-5, Scoring: claude-sonnet-4-6. |

## Annahmen (Spec Abschnitt 17, im Code kommentiert)

- **WhatsApp:** `WhatsAppProvider`-Interface; Implementierung gegen die WhatsApp Cloud API mit konfigurierbarer Base-URL — funktioniert direkt (Meta Tech Provider) und über BSPs, die die Cloud-API-Fläche proxen (z. B. 360dialog). Embedded Signup auf aktueller Version.
- **Kalender:** eigene Slot-Logik v1, kein Google-Sync.
- **Anrede:** Du, pro Job umstellbar. **E-Mail:** Resend (vorhanden). **Billing:** außerhalb (bestehendes Mollie/Stripe-System bleibt für Zoepp-Kunden, keine Kopplung).
- **2FA:** Supabase Auth MFA (TOTP), Pflicht nur für `admin`.
- **i18n:** UI bleibt hartkodiert Deutsch (Bestand); Spec-Anforderung „i18n vorbereitet" wird als Nicht-Blocker zurückgestellt.
- **Sentry:** wird eingebaut (Spec-Pflicht für Alarme), DSN per Env optional.

## Nicht berührt

Masterclass, Fulfillment-Tasks, Billing/SEPA, Transkripte, Dialer, Playbook, Health-Checks, Onboarding-Formulare, Close-CRM-Anbindung. Der Recruiting-Ausbau ist additiv; bestehende Kandidaten-UI wird auf `applications` umgestellt, ohne die übrigen Module zu verändern.

## Risiken

- **Live-DB (6 echte Agenturen):** Alle Migrationen additiv + Backfill; keine Drops von Bestandsspalten in diesem Ausbau (Alt-Spalten werden als deprecated markiert).
- **Vercel-Cron minütlich:** erfordert Pro-Plan (vorhanden laut bestehendem Setup).
- **Externe Setups nötig vor Live-Betrieb:** Meta-App mit WhatsApp-Produkt (Embedded Signup), Indeed-Partnerfreigabe, Turnstile-Keys. Wird in `docs/betriebshandbuch.md` dokumentiert; Code ist dafür vorbereitet und degradiert sauber (Statusanzeige statt Crash).

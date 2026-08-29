# Phase 0 Review — Zoepp Media Cloud

> Stand: 2026-08-29 · Reviewer: Claude Opus 4.6 · Freigabe durch Felix erforderlich

---

## Ist-Architektur

| Bereich | Wert |
|---|---|
| **Framework** | Next.js 16.3.0, React 19.2.8, TypeScript |
| **Styling** | Tailwind CSS 3.4, eigene UI-Komponenten (Card, Badge, Button, etc.) |
| **Datenbank** | Supabase (Postgres), Projekt `qfzqoxeocyuqfreihiok` |
| **Auth** | Supabase Auth (E-Mail/Passwort), 4 Rollen via `users.role` |
| **Hosting** | Vercel (Hobby Plan), Domain `cloud.zoeppmedia.de` |
| **AI** | Claude Sonnet 4.6 (Content, Analyse), Claude Haiku 4.5 (CV), OpenAI Whisper (Transkription) |
| **E-Mail** | Resend (`noreply@zoepp-gruppe.de`) |
| **Externe APIs** | Meta Graph API, Close CRM, Calendly, Perspective |
| **PWA** | manifest.json, Icons, Offline-Seite — installierbar |
| **Codebase** | 247 TS-Dateien, ~36.500 LOC, 113 API-Routes, 43 Seiten, 36 Migrationen |

**Nicht integriert:** Slack, Google Drive, easybill, WhatsApp

---

## Datenbestand (Live-Daten)

| Tabelle | Zeilen | Bewertung |
|---|---|---|
| agencies | 6 | Echte Kunden (Cihan, Fadi, + Test) |
| users | 4 | Felix (admin), Max (employee), 2 Agency-Owner |
| candidates | 1 | Minimal — die meisten Bewerber laufen über Close CRM |
| masterclass_lessons | 22 | 4 Module, vollständig befüllt |
| internal_tasks | 10 | Laufende interne Aufgaben |
| fulfillment_tasks | 10 | Onboarding-Tasks für 1 Agency |
| playbook_tasks | 86 | Auto-generiert aus Problem-Detection |
| content_templates | 13 | D2D-spezifische Vorlagen (Ads, Scripts, Funnels) |

**Risiko:** Niedrig. Wenig Produktivdaten, Migration ist unkritisch.

---

## Abdeckung: Build-Spec vs. Bestand

### clients (Spec §2: `clients` + `client_profile`)

| Anforderung | Bestand | Bewertung |
|---|---|---|
| Kundenstammdaten | `agencies` mit 15+ Feldern | **teilweise** — fehlt: rechtsform, anschrift, USt-ID, mrr, werbebudget, paket, garantie_start/ende, csm_user_id |
| Copy-Datenbank | `onboarding_submissions` mit 25+ D2D-Feldern | **teilweise** — Felder existieren, aber nicht als separates `client_profile` mit Freigabe-Status pro Feld |
| Status-Lifecycle | `agencies.onboarding_completed` (boolean) | **teilweise** — fehlt: `aktiv/pausiert/gekuendigt`, `setup_fehler` |

**Empfehlung:** `agencies` um fehlende Felder erweitern, `status` als Enum statt boolean. Kein neues `clients`-Table — `agencies` IST die Client-Tabelle.

### task_templates (Spec §6: Aufgabenbibliothek)

| Anforderung | Bestand | Bewertung |
|---|---|---|
| Vorlagen mit Checkliste | `sop_tasks` (40 Tasks in 6 Phasen) | **teilweise** — hat Titel, Typ, Phase, Reihenfolge. Fehlt: Checkliste[], benötigte_zugänge[], vorlagen_links[], definition_of_done, abgabe_typ, sla_tage |
| Content-Templates | `content_templates` (13 Vorlagen) | **vorhanden** — andere Funktion (AI-Prompts, nicht Aufgaben) |

**Empfehlung:** Neues `task_templates`-Table nach Spec, `sop_tasks` als Seed-Daten migrieren.

### tasks (Spec §4.1: Aufgabensystem)

| Anforderung | Bestand | Bewertung |
|---|---|---|
| Aufgaben mit Status | 6 separate Task-Tabellen + `unified_tasks` View | **teilweise** — fragmentiert, kein einheitliches `tasks`-Table |
| Checkliste | Nicht vorhanden (nur SOP-Tasks haben implizite Schritte) | **fehlt** |
| Blockierung durch Abhängigkeiten | `fulfillment_tasks.sort_order` | **teilweise** — keine echte `blockiert_durch[]` Logik |
| Freigabe-Workflow | `content_library.status` hat 8 Stufen | **teilweise** — nur für Content, nicht für allgemeine Aufgaben |
| SLA-Tracking | `task_sla` Tabelle mit 3-Stufen-Eskalation | **vorhanden** |

**Empfehlung:** Neues `tasks`-Table + `task_checkitems` nach Spec. Bestehende 6 Tabellen bleiben für Legacy, neue Kunden nutzen das neue System.

### access_items (Spec §4.2: Zugangsverwaltung)

| Anforderung | Bestand | Bewertung |
|---|---|---|
| Zugangs-Tracking pro Kunde | `meta_access_steps` JSONB auf `onboarding_submissions` | **teilweise** — nur Meta, nicht strukturiert |
| Nachfass-Mechanik | Onboarding-Reminder per Cron (48h) | **teilweise** — kein gestaffelter Eskalationsplan |
| Garantie-Start bei Pflicht-Zugängen | Nicht vorhanden | **fehlt** |

**Empfehlung:** Neues `access_items`-Table nach Spec. Höchste Priorität — Zugänge sind der häufigste Engpass.

### transcripts (Spec §4.3: Transkript-Auswertung)

| Anforderung | Bestand | Bewertung |
|---|---|---|
| Audio-Upload + Transkription | `call_recordings` + Whisper | **teilweise** — existiert für Call-Recordings, nicht für Onboarding-Gespräche |
| Strukturierte Auswertung | `call_recordings.analysis` JSONB (Script-Adherence, Quality) | **teilweise** — analysiert Calls, nicht Onboarding-Fragen |
| Fragenkatalog → Profilfelder | Nicht vorhanden | **fehlt** |
| CSM-Prüfansicht | Nicht vorhanden | **fehlt** |

**Empfehlung:** Neues `transcripts`-Table + `transcript_answers` + `transcript_questions` nach Spec. Whisper + Claude Infrastruktur ist bereits vorhanden und wiederverwendbar.

### reports (Spec §5: Reports)

| Anforderung | Bestand | Bewertung |
|---|---|---|
| Wöchentlicher Kundenreport | Weekly Report per Mail (Montags) | **vorhanden** |
| Tag-7 / Tag-14 Report | Nicht vorhanden | **fehlt** |
| Zufriedenheitsumfrage | `survey_templates` (4 Vorlagen) + `survey_responses` | **vorhanden** — aber 0 Responses, nie produktiv genutzt |
| Report-Freigabe durch CSM | Nicht vorhanden | **fehlt** |

**Empfehlung:** Tag-7/14 Reports als Erweiterung des Weekly-Report-Systems. Survey-System ist gebaut, muss nur aktiviert und schöner gemacht werden.

### health_checks (Spec §5: Gesundheitsprüfungen)

| Anforderung | Bestand | Bewertung |
|---|---|---|
| Problem-Detection | 9 automatische Checks im Daily Cron | **vorhanden** |
| SLA-Eskalation | 3-Stufen-System (2h/6h/24h) | **vorhanden** |
| Canary-Testbewerbung | Nicht vorhanden | **fehlt** |
| Pixel-Check | Nicht vorhanden | **fehlt** |
| Werbekonto-Prüfung | Nicht vorhanden | **fehlt** |

### Automationen (Spec §5)

| Anforderung | Bestand | Bewertung |
|---|---|---|
| Event-Driven Engine | `automations` + `automation_runs`, 10 Trigger-Typen | **vorhanden** |
| In allen Handlern verdrahtet | `fireEvent()` in 8 Handlern | **vorhanden** |
| Zugangserinnerungen | Onboarding-Reminder (48h, einmalig) | **teilweise** — fehlt gestaffelter Plan (Tag 1/3/5/7) |
| Slack-Meldungen | Nicht vorhanden | **fehlt** — Slack nicht integriert |
| Drive-Ordner | Nicht vorhanden | **fehlt** — Google Drive nicht integriert |

### After-Close-Formular (Spec §3)

| Anforderung | Bestand | Bewertung |
|---|---|---|
| Formular nach Abschluss | `onboarding_submissions` (25+ Felder) | **teilweise** — existiert als Kunden-Onboarding, nicht als Closer-Formular |
| Automatische Konto-Erstellung | Agencies + Invite-Token + E-Mail | **vorhanden** |
| Drive-Ordner anlegen | Nicht vorhanden | **fehlt** |
| Slack-Channel anlegen | Nicht vorhanden | **fehlt** |
| easybill-Kunde anlegen | Nicht vorhanden | **fehlt** |

### Oberflächen (Spec §4)

| Anforderung | Bestand | Bewertung |
|---|---|---|
| Mitarbeiteransicht | `/heute`, `/tasks`, `/meine-aufgaben` | **teilweise** — Heute-Dashboard existiert, Aufgaben fragmentiert |
| Kundenansicht | `/dashboard` mit SLA-Ampel + Masterclass | **vorhanden** — fehlt: offene Zugänge, Fortschrittsbalken |
| Adminansicht | 10+ Admin-Seiten (Sales, Marketing, Report, etc.) | **vorhanden** |

---

## Wiederverwendbar (bleibt unverändert)

- Auth-System (Supabase Auth, 4 Rollen, RLS)
- UI-Komponenten (Card, Badge, Button, etc.)
- Notification-System (9 Typen, Bell-Icon, Polling)
- Automation-Engine (Trigger → Conditions → Actions)
- Cadence-System (6-Stufen Follow-Up)
- TTFC/Speed-to-Lead Tracking
- No-Show/Blacklist Punktemodell
- Consent/DSGVO Tracking
- Audit-Log
- Masterclass + Nudges
- Weekly Report Email
- Whisper + Claude AI Pipeline
- Meta Webhook + Indeed Webhook
- PWA Setup

## Umbau nötig

| Was | Risiko | Grund |
|---|---|---|
| `agencies` erweitern → Spec-`clients` | Niedrig | Additive Spalten, kein Breaking Change |
| `onboarding_submissions` → `client_profile` Mapping | Niedrig | Bestehende Daten bleiben, neues Table referenziert |
| 6 Task-Tabellen → neues `tasks`-Table | Mittel | Legacy bleibt, neue Kunden nutzen neues System |
| Survey-System aktivieren + UI verbessern | Niedrig | Code existiert, 0 Produktivdaten |
| Proxy.ts → korrekte middleware.ts | Niedrig | Routing-Fix, kein Datenverlust |

## Neu bauen

| Was | Aufwand | Priorität |
|---|---|---|
| `task_templates` + `tasks` + `task_checkitems` | L | 1 |
| `access_items` + Nachfass-Mechanik | M | 1 |
| `transcripts` + `transcript_answers` + `transcript_questions` + CSM-Prüfansicht | L | 1 |
| After-Close-Formular (Closer-seitig) | M | 1 |
| Slack-Integration (Channel anlegen, Meldungen) | M | 2 |
| Google Drive Integration (Ordner anlegen) | M | 2 |
| easybill Integration (Kunde + SEPA) | M | 3 |
| Tag-7 / Tag-14 Reports | S | 2 |
| Canary/Health-Check System | M | 3 |
| Kundenzufriedenheits-Formular (schön) | S | 2 |

## Löschen / Aufräumen

| Was | Grund |
|---|---|
| `customer_sop` + `customer_tasks` | 0 Zeilen, wird durch neues Task-System ersetzt |
| `sop_phases` + `sop_tasks` | Wird zu `task_templates` migriert |
| `client_tasks` | 0 Zeilen, wird durch `tasks` ersetzt |
| `content_library` | 2 Zeilen, kann in neues System überführt werden |
| `report_snapshots` | 0 Zeilen, nie genutzt |
| `/api/admin/meta-spend` | Debug-Endpoint, kann weg |

## Sicherheit

| Problem | Schwere | Fix |
|---|---|---|
| Perspective Webhook ohne Signaturprüfung | Mittel | Shared Secret hinzufügen |
| Indeed Webhook ohne Signaturprüfung | Mittel | Resend Webhook Signature prüfen |
| Calendly Webhook ohne Signaturprüfung | Mittel | Calendly Webhook Signing Key prüfen |
| Kein Rate-Limiting auf API-Routes | Niedrig | Vercel Function-Level Rate Limiting |
| Keine Input-Validierung (kein Zod) | Mittel | Schrittweise einführen bei neuen Routes |
| `next.config.ts` leer — keine Security Headers | Niedrig | CSP, HSTS, X-Frame-Options hinzufügen |

## Empfehlung

**Erweitern, nicht neu bauen.**

Die bestehende Cloud ist eine solide Basis mit 36 Migrationen, 113 API-Routes, funktionierender Auth/RLS, AI-Pipeline und einem durchdachten Automation-System. Ein Neubau würde 80% davon reproduzieren.

Das Datenmodell wird um die fehlenden Tabellen ergänzt (`task_templates`, `tasks`, `task_checkitems`, `access_items`, `transcripts`, `transcript_answers`, `transcript_questions`). Die bestehenden `agencies`-Tabelle wird um die Spec-Felder erweitert. Legacy-Task-Tabellen bleiben für bestehende Daten, neue Kunden nutzen das neue System.

**Aufwandsschätzung:**
- Phase 1 (Datenmodell + Auth + Rollen): 1 Tag — existiert größtenteils
- Phase 2 (After-Close + Kundenanlage): 2-3 Tage
- Phase 3 (Aufgabensystem + Mitarbeiteransicht): 3-4 Tage
- Phase 4 (Zugangsverwaltung + Kundenansicht): 2-3 Tage
- Phase 4b (Transkript): 3-4 Tage
- Phase 6 (Reports): 2 Tage
- Phase 7 (Health-Checks): 1-2 Tage

**Gesamt: ~15-20 Tage** für die Kernfunktionalität.

---

## Offene Punkte aus Spec §9

1. **Zeiterfassung** — nicht im System, bleibt extern
2. **Kunden-Kommentare** — Survey-System existiert, Kommentare auf Tasks fehlen
3. **Mandantenfähigkeit** — bereits vorhanden über `agency_id` + RLS
4. **Führende Bewerber-Datenquelle** — Zoepp Cloud für D2D-Kunden, Close CRM für Sales-Pipeline
5. **Pflicht-Zugänge** — muss pro Produkt definiert werden (Inhaltliche Vorarbeit)
6. **Report-Freigabe-Vertretung** — Admin kann freigeben
7. **Profildatenbank** — `onboarding_submissions` als Basis, erweitern zu `client_profile`
8. **Onboarding-Fragenkatalog** — muss inhaltlich erstellt werden (nicht Programmierung)
9. **Aufbewahrungsfrist Aufnahmen** — 90 Tage Default (bereits in Spec)

---

**STOPP.** Vor Phase 1 brauche ich deine Freigabe auf diesen Review.

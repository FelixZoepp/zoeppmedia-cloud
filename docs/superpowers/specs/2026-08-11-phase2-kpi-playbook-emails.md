# Phase 2: KPI-System, Playbook, Email-Einladungen, Zufriedenheits-Checks — Design Spec

## Kontext

Zoepp Media Cloud hat jetzt den kompletten Fulfillment-Flow (Onboarding → AI-Generierung → Freigabe → Kampagne → Reports). Phase 2 macht das System intelligent: KPI-Zielwerte mit automatischer Problemerkennung, ein Playbook für Mitarbeiter-Handlungsanweisungen, automatische Zufriedenheits-Checks, Email-Einladungen via Resend, und erweiterte Reports mit Ampel-System.

---

## 1. KPI-Zielwerte

### Globale Standards

Werden einmalig in der DB gesetzt und gelten als Default für alle Kunden. Pro Kunde überschreibbar.

| KPI-Key | Label | Standard-Wert | Einheit | Richtung |
|---------|-------|---------------|---------|----------|
| `max_cpl` | Max CPL | 40 | Euro | lower_is_better |
| `min_reach_rate` | Min Erreichbarkeit | 50 | Prozent | higher_is_better |
| `min_termin_rate` | Min Termin-Quote | 15 | Prozent | higher_is_better |
| `max_response_hours` | Max Reaktionszeit | 24 | Stunden | lower_is_better |
| `min_candidates_week` | Min Bewerber/Woche | 5 | Anzahl | higher_is_better |
| `max_phase_days` | Max Phase-Dauer | 5 | Tage | lower_is_better |
| `min_indeed_per_2days` | Indeed Min Bewerber/2 Tage | 1 | Anzahl | higher_is_better |
| `min_satisfaction` | Min Zufriedenheit | 3 | Sterne (1-5) | higher_is_better |

### DB: Neue Tabellen

**`kpi_defaults`** — globale Standard-Werte (1 Row pro KPI)
```sql
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
```

Seeded mit den 8 KPIs aus der Tabelle oben.

**`agency_kpi_overrides`** — pro-Kunde Überschreibungen
```sql
CREATE TABLE agency_kpi_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  kpi_key TEXT NOT NULL REFERENCES kpi_defaults(kpi_key),
  value NUMERIC NOT NULL,
  set_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agency_id, kpi_key)
);
```

### API

- `GET /api/kpi/defaults` — gibt alle KPI-Defaults zurück (intern)
- `PATCH /api/kpi/defaults/[key]` — Admin ändert globalen Default
- `GET /api/kpi/agency/[agency_id]` — gibt effektive KPIs zurück (Default + Overrides gemergt)
- `PUT /api/kpi/agency/[agency_id]/[key]` — Mitarbeiter setzt Override
- `DELETE /api/kpi/agency/[agency_id]/[key]` — Override entfernen (zurück zu Default)

### UI

- Admin Settings: globale KPI-Defaults editieren (Tabelle mit Inline-Edit)
- Client-Detail: KPI-Tab mit Soll/Ist Vergleich pro KPI, Override-Buttons

---

## 2. Automatische Problemerkennung

### Problem-Typen

| Problem-Key | Trigger-Logik | Severity |
|-------------|--------------|----------|
| `low_reach_rate` | Erreichbarkeit < KPI-Ziel (letzte 7 Tage) | warning |
| `low_termin_rate` | Termin-Quote < KPI-Ziel (letzte 7 Tage) | warning |
| `high_cpl` | Durchschnitts-CPL > KPI-Ziel (letzte 7 Tage) | critical |
| `low_candidates` | Bewerber diese Woche < KPI-Ziel | warning |
| `no_calls_24h` | 0 Anrufe in 24h bei offenen Bewerbern | critical |
| `pipeline_stall` | Bewerber > KPI-Ziel Tage in einer Phase | warning |
| `low_satisfaction` | Letzter Survey < KPI-Ziel Sterne | critical |
| `indeed_no_candidates` | 0 Indeed-Bewerber in 2 Tagen | warning |

### DB: Neue Tabelle

**`agency_problems`** — erkannte Probleme pro Agentur
```sql
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
  resolved_by UUID REFERENCES users(id),
  UNIQUE(agency_id, problem_key, resolved_at)
);
```

### Berechnung

API-Route `POST /api/problems/detect` — wird manuell oder per Cron aufgerufen:

1. Für jede aktive Agentur:
   - Lade effektive KPIs (Defaults + Overrides)
   - Berechne aktuelle Werte aus: `call_logs`, `candidates`, `meta_ad_reports`, `survey_responses`
   - Vergleiche Ist vs. Soll
   - Wenn Problem erkannt und noch kein offenes Problem mit diesem Key → insert
   - Wenn Problem behoben (Wert wieder im Ziel) → `resolved_at` setzen
2. Returnt Anzahl neue/aufgelöste Probleme

### UI

- **Admin-Dashboard:** Ampel pro Agentur (grün = 0 Probleme, gelb = warnings, rot = criticals)
- **Client-Detail:** Problem-Alert-Box oben auf der Seite, "Playbook anzeigen" Button pro Problem
- **Kunde:** Sieht KEINE Problem-Alerts

---

## 3. Playbook-Datenbank

### DB: Neue Tabelle

**`playbook_entries`** — Handlungsanweisungen pro Problem-Typ
```sql
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
```

### Seeded Playbook-Einträge (8 Stück)

**1. `low_reach_rate` — Erreichbarkeit zu niedrig**
- Beschreibung: Weniger als die Hälfte der Bewerber wird am Telefon erreicht.
- Ursachen: Falsche Anrufzeiten, Bewerber haben Tagschicht, Nummer falsch/unvollständig, Zu wenige Anrufversuche
- Sofort-Maßnahmen: Anrufzeiten anpassen (morgens 9-11, nachmittags 15-17), Doppelanruf-Strategie (2x täglich), WhatsApp-Nachricht als Alternative senden, Nummern auf Vollständigkeit prüfen
- Langfristig: Funnel-Formular um "Beste Erreichbarkeit" erweitern, SMS-Benachrichtigung bei Bewerbungseingang, Automatische Kalender-Buchung im Funnel
- Eskalation: Wenn nach 1 Woche keine Verbesserung → Felix informieren

**2. `low_termin_rate` — Wenig Termine**
- Beschreibung: Zu wenige Anrufe führen zu einem Vorstellungsgespräch.
- Ursachen: Skript nicht überzeugend genug, Bewerber nicht vorqualifiziert, Fehlende Einwandbehandlung, Tonalität zu aggressiv/passiv
- Sofort-Maßnahmen: Skript-Opening überarbeiten (Nutzen in ersten 10 Sekunden), Einwandbehandlung üben (Kein Interesse, Keine Zeit, Muss überlegen), Fragen stellen statt pitchen, Termin als Low-Commitment framen
- Langfristig: Qualifikations-Fragen im Funnel verschärfen, Video-Bewerbung als Vorfilter, Automatic Scheduling im Funnel einbauen
- Eskalation: Wenn Quote unter 10% nach 2 Wochen → Skript-Review mit Felix

**3. `high_cpl` — CPL zu hoch**
- Beschreibung: Die Kosten pro Bewerber über Meta Ads übersteigen das Ziel.
- Ursachen: Zielgruppe zu breit, Creative-Ermüdung (gleiche Ads zu lange), Schlechte Landingpage-Conversion, Falsches Placement
- Sofort-Maßnahmen: Zielgruppe einengen (Alter, Region, Interessen), Mindestens 3 Creative-Varianten aktiv halten, Funnel-Ladezeit und Conversion prüfen, Placement auf Feed+Stories beschränken
- Langfristig: Lookalike-Audience aus bisherigen Bewerbern erstellen, Retargeting-Kampagne parallel schalten, A/B-Testing Routine einführen (wöchentlich neue Variante)
- Eskalation: CPL > €60 für mehr als 5 Tage → Budget pausieren und Review

**4. `low_candidates` — Wenig Bewerber**
- Beschreibung: Weniger als 5 Bewerber pro Woche eingegangen.
- Ursachen: Budget zu niedrig, Saisonale Schwankung, Kampagne läuft nicht (Fehler), Funnel-Conversion-Problem
- Sofort-Maßnahmen: Budget prüfen (Minimum €30/Tag empfohlen), Kampagne auf Fehler checken (abgelehnte Ads, Billing), Indeed-Anzeige parallel schalten falls nicht aktiv, Funnel-Conversion-Rate prüfen (< 10% = Problem)
- Langfristig: Zweiten Kanal aufbauen (Indeed + Meta parallel), Mitarbeiter-Empfehlungsprogramm vorschlagen, Content-Marketing (organische Reichweite)
- Eskalation: 0 Bewerber in 3+ Tagen → Sofort-Check

**5. `no_calls_24h` — Kunde ruft nicht an**
- Beschreibung: Es sind offene Bewerber da, aber der Kunde hat seit 24h niemanden angerufen.
- Ursachen: Kunde vergisst/priorisiert nicht, Unsicherheit am Telefon, Kein Zugang zur Cloud, Überforderung bei vielen Bewerbern
- Sofort-Maßnahmen: Erinnerung an Kunden senden (Email/WhatsApp), Masterclass-Video "Bewerber richtig callen" empfehlen, Anbieten: Erste Anrufe gemeinsam machen, Bewerber nach Priorität sortieren (neueste zuerst)
- Langfristig: Automatische tägliche Email-Erinnerung bei offenen Bewerbern, Gamification (Anruf-Streak), Vereinfachtes Call-Interface in der Cloud
- Eskalation: 48h ohne Anruf → Persönliches Telefonat mit Kunden

**6. `pipeline_stall` — Pipeline-Stau**
- Beschreibung: Bewerber sitzen länger als 5 Tage in einer Pipeline-Phase ohne Fortschritt.
- Ursachen: Kunde hat Bewerber vergessen, Terminverschiebung ohne Update, Entscheidungsprobleme, Bewerber ghostet
- Sofort-Maßnahmen: Kunden kontaktieren und Status abfragen, Bewerber direkt anrufen falls Kontaktdaten da, Status aktualisieren (ggf. auf Absage), Follow-Up-Termin setzen
- Langfristig: Automatische Erinnerung an Kunden bei stagnierendem Bewerber, Maximale Phase-Dauer als Regel kommunizieren, Wöchentlichen Pipeline-Review einführen
- Eskalation: > 10 Tage in Phase → Bewerber als verloren markieren

**7. `low_satisfaction` — Niedrige Zufriedenheit**
- Beschreibung: Der Kunde hat im letzten Feedback weniger als 3 Sterne gegeben.
- Ursachen: Unerfüllte Erwartungen, Kommunikationsprobleme, Qualität der Bewerber, Langsame Reaktionszeiten unsererseits
- Sofort-Maßnahmen: Sofort Kunden-Call (nicht Email), Offenes Feedback einholen (Was konkret stört), Konkreten Verbesserungsplan aufsetzen, Felix informieren
- Langfristig: Proaktivere Kommunikation (wöchentliche Updates), Erwartungsmanagement verbessern (Onboarding), Dedizierte Ansprechpartner-Struktur
- Eskalation: Unter 2 Sterne oder 2x unter 3 → Felix übernimmt Kundenkontakt

**8. `indeed_no_candidates` — Indeed performt nicht**
- Beschreibung: Keine Bewerber über Indeed in den letzten 2 Tagen.
- Ursachen: Stellenanzeige nicht sichtbar (SEO-Titel), Gehalt/Benefits nicht prominent genug, Falscher Standort, Anzeige nicht aktiv/gesponsort
- Sofort-Maßnahmen: Stellentitel SEO-optimieren (häufig gesuchte Begriffe), Gehalt und Top-3-Benefits in die ersten 2 Zeilen, Standort prüfen (PLZ vs. Stadt), Sponsored Job aktivieren falls Budget da
- Langfristig: A/B-Test mit verschiedenen Titeln, Indeed-Unternehmensprofil mit Fotos/Videos aufwerten, Google for Jobs Optimierung (strukturierte Daten)
- Eskalation: 5+ Tage ohne Indeed-Bewerber → Kanal-Wechsel evaluieren

### API

- `GET /api/playbook` — alle Einträge (intern)
- `GET /api/playbook/[problem_key]` — einzelner Eintrag
- `PATCH /api/playbook/[problem_key]` — Admin kann Playbook-Text editieren

### UI

- **`/playbook`** (interne Seite): Accordion-Liste aller 8 Playbooks, durchsuchbar
- **Client-Detail:** Problem-Alert → "Playbook" Button → öffnet Modal mit dem jeweiligen Playbook

---

## 4. Email-System (Resend)

### Setup

- NPM: `resend` Package
- Env: `RESEND_API_KEY`
- From-Address: `noreply@zoeppmedia.de` (oder Domain die in Resend verifiziert wird)

### Email-Helper

`src/lib/email/resend.ts`:
- `sendInviteEmail(to, agencyName, registerUrl, expiresAt)`
- `sendWelcomeEmail(to, name, loginUrl)`
- `sendOnboardingReminder(to, name, onboardingUrl)`
- `sendSurveyNotification(to, name, surveyTitle, portalUrl)`

### Email-Templates

Schlicht, weiß, Zoepp Media Logo oben, roter CTA-Button (`#E0354B`). Kein HTML-Overload. Inline-CSS für Email-Kompatibilität. Alle Texte auf Deutsch.

**4 Templates:**

1. **Einladung:** "Du wurdest eingeladen, Zoepp Media Cloud beizutreten" → Registrierungslink
2. **Willkommen:** "Willkommen bei Zoepp Media Cloud!" → Login-Link + nächste Schritte
3. **Onboarding-Erinnerung:** "Dein Onboarding ist noch nicht abgeschlossen" → Onboarding-Link
4. **Survey-Benachrichtigung:** "Wir brauchen dein Feedback" → Portal-Link

### Integration

- `POST /api/admin/agencies` (Invite erstellen) → `sendInviteEmail()` automatisch nach Insert
- `POST /api/auth/register` (Registrierung) → `sendWelcomeEmail()` nach erfolgreichem Signup
- Onboarding-Reminder: `POST /api/email/check-onboarding` — prüft alle Agenturen wo `onboarding_completed = false` und `created_at > 48h` → sendet Reminder (max 1x)
- Survey-Notification: wird getriggert wenn neuer Survey-Check erstellt wird

### Invite-Status Tracking

`invite_tokens` bekommt neues Feld: `email_sent_at TIMESTAMPTZ` — wird gesetzt wenn Email erfolgreich rausgeht. UI zeigt: "Eingeladen am [Datum]", "Erneut senden" Button.

---

## 5. Automatische Zufriedenheits-Checks

### Meilensteine

| Trigger-Key | Bedingung | Survey-Template |
|-------------|-----------|-----------------|
| `post_onboarding` | `onboarding_completed` wird `true` | "Onboarding-Feedback" |
| `campaign_2_weeks` | 14 Tage nach SOP Phase 5 Task 7 ("Kampagne starten") = done | "Erste Eindrücke" |
| `monthly` | 1. des Monats, Kunde > 30 Tage aktiv | "Monatliches Feedback" |
| `quarterly` | 1. des Quartals, Kunde > 90 Tage aktiv | "Gesamtbewertung" |

### DB-Erweiterungen

**Neue Survey-Templates** (3 zusätzlich zum existierenden):

"Onboarding-Feedback" (3 Fragen):
- Wie einfach war der Onboarding-Prozess? (1-5)
- Wie gut wurden deine Fragen beantwortet? (1-5)
- Wie zufrieden bist du mit der bisherigen Kommunikation? (1-5)

"Erste Eindrücke" (4 Fragen):
- Wie zufrieden bist du mit der Bewerber-Qualität? (1-5)
- Wie gut funktioniert das Bewerber-Management in der Cloud? (1-5)
- Wie bewertest du die bisherige Zusammenarbeit? (1-5)
- Würdest du uns weiterempfehlen? (1-5)

"Gesamtbewertung" (6 Fragen):
- Gesamtzufriedenheit (1-5)
- Kommunikation (1-5)
- Qualität der Kampagnen (1-5)
- Qualität der Bewerber (1-5)
- Preis-Leistung (1-5)
- Weiterempfehlung (1-5)

**Neue Tabelle `survey_schedule`** — trackt geplante und gesendete Checks:
```sql
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
```

### API

- `POST /api/surveys/check-milestones` — prüft alle Meilensteine, erstellt `survey_schedule` Einträge, sendet Email
- `GET /api/surveys/schedule?agency_id=X` — geplante/offene Checks pro Kunde
- `GET /api/surveys/analytics` — aggregierte Auswertung (Durchschnitt pro Frage, Trend, Kunden unter 3)

### UI

- **Kunde Dashboard:** Banner "Du hast einen Feedback-Check offen" mit Link
- **Admin:** Survey-Auswertungs-Seite mit Trend-Chart, Durchschnitte, Problem-Kunden
- **Client-Detail:** Zufriedenheits-Verlauf (Sparkline/Chart)

---

## 6. Erweiterte Reports + Admin-Dashboard

### Admin-Dashboard Erweiterungen

**Ampel-Übersicht:**
Jede Agentur bekommt eine Ampelfarbe:
- Grün: 0 aktive Probleme
- Gelb: nur `warning` Probleme
- Rot: mindestens 1 `critical` Problem

Anzeige als Tabelle: Agentur | Ampel | Aktive Probleme | CPL | Bewerber/Woche | Zufriedenheit

**Neuer "Probleme" Tab:**
Liste aller aktiven Probleme über alle Kunden, gruppiert nach Severity (critical zuerst), mit:
- Agenturname
- Problem-Typ
- Ist-Wert vs. Soll-Wert
- Seit wann
- "Playbook" Button
- "Als gelöst markieren" Button

**Trend-Charts (aggregiert):**
- Durchschnitts-CPL über alle Kunden (letzte 12 Wochen)
- Bewerber gesamt pro Woche (letzte 12 Wochen)
- Durchschnitts-Zufriedenheit (letzte 6 Monate)

### Client-Detail Erweiterungen

**KPI Soll/Ist Box:**
Pro KPI ein Balken-Element:
```
Max CPL:     ████████░░  €32 / €40  ✅
Erreichbarkeit: ███░░░░░░░  28% / 50%  ❌
Termin-Quote:   █████░░░░░  18% / 15%  ✅
```

**Problem-Alert Box** (nur für Mitarbeiter/Admin):
Rote/gelbe Box oben auf der Seite wenn Probleme aktiv:
"2 Probleme erkannt: Erreichbarkeit zu niedrig (28%), Keine Anrufe seit 24h"
→ "Playbook anzeigen" Button pro Problem

**Zufriedenheits-Verlauf:**
Mini-Chart mit Durchschnittsbewertung über Zeit (aus `survey_responses`)

### Kunden-Reports Erweiterungen

- KPI-Fortschritt: Balken wie oben, aber OHNE Problem-Alerts
- Zufriedenheits-Historie: eigene vergangene Bewertungen
- Keine Playbook-Links, keine Problem-Details

---

## Technische Entscheidungen

- **Resend** für Emails, `resend` NPM Package
- **Keine neue UI-Library** — Apple Red Components
- **Problem-Detection als API-Route** — kann per Cron oder manuell aufgerufen werden, kein Background-Worker nötig
- **Playbook als DB-Tabelle** (nicht hardcoded) — damit Admin die Texte editieren kann
- **KPI-Berechnung on-demand** — bei jedem Laden der Detail-Seite werden aktuelle Werte berechnet, kein Caching nötig für MVP
- **1 Migration** für alle neuen Tabellen + Seeds

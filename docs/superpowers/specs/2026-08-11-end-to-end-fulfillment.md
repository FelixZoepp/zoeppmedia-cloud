# End-to-End Fulfillment System — Design Spec

## Kontext

Zoepp Media Cloud soll einen nahtlosen Durchlauf bieten: Kunde onboarded → Mitarbeiter fulfilled per 1-Click AI → Kunde gibt frei → Kampagne geht live → Kennzahlen + Betreuung laufen automatisch. Viele Bausteine existieren bereits (Onboarding-Form, SOP-System, Fulfillment-UI, Masterclass, Kanban, Reports), aber die AI-Anbindung fehlt, Meta API ist nicht integriert, Call-Tracking existiert nicht, und der Freigabe-Flow hat Lücken.

---

## 1. AI-Generierung (Claude API)

### Was existiert
- `/api/ai/generate` — vollständiges Scaffolding mit Auth, Rollen-Check, Onboarding-Kontext-Laden, Prompt-Templates für `ad_copy`, `phone_script`, `funnel_text`. Antwort ist Placeholder-String.
- `/api/ai/chat` — Konversations-Management, Nachrichten-Persistenz. Antwort ist Placeholder-String.
- Frontend: AI-Tools-Seite mit Chat-UI, Fulfillment mit "Generieren"-Button.

### Was zu tun ist
- `ANTHROPIC_API_KEY` als Env-Var in Vercel + `.env.local`
- Anthropic SDK installieren (`@anthropic-ai/sdk`)
- Placeholder in `/api/ai/generate/route.ts` ersetzen durch echten Claude-Call (`claude-sonnet-4-6`)
- Placeholder in `/api/ai/chat/route.ts` ersetzen durch echten Claude-Call mit Konversations-History
- Neue Content-Typen hinzufügen: `video_script`, `job_posting` (Indeed), `creative_brief`
- Prompt-Templates für jeden Typ, angereichert mit Onboarding-Daten (Branche, Region, USPs, Gehalt, Zielgruppe)

### Prompt-Kontext
Jeder AI-Call bekommt: Firmenname, Branche (D2D-Subtyp), Region, Mitarbeiteranzahl, Recruiting-Ziele, Gehalt/Provision, USPs, Primärfarbe. Für Regenerate: vorherige Version + User-Feedback.

---

## 2. Onboarding-Erweiterung

### Was existiert
- 4-Step-Form (Firma, Ziele, Branding, Kontakt)
- DB-Spalten `logo_url` und `team_photos` existieren, UI fehlt

### Was zu tun ist
- **Step 3 (Branding):** Logo-Upload + Team-Fotos via Supabase Storage
  - Bucket `onboarding-assets` mit Agency-Ordner-Struktur
  - Upload-Component mit Drag & Drop, Preview, Löschen
  - Dateitypen: PNG, JPG, SVG (Logo), PNG/JPG (Fotos)
  - Max 5MB pro Datei, max 10 Fotos
- **Step 5 (neu) — Meta-Zugang:**
  - Schritt-für-Schritt Anleitung mit Screenshots/GIFs
  - 5 Checkboxen: Business Manager öffnen, Partner hinzufügen (Zoepp Business ID anzeigen), Ad Account freigeben, Pixel teilen, Seite freigeben
  - Jeder Schritt mit Erklärtext
  - Mitarbeiter verifiziert separat im Backend
- DB: `onboarding_submissions` bekommt neues JSONB-Feld `meta_access_steps` für Checkbox-Status

---

## 3. Freigabe-Flow

### Status-Workflow
```
draft → internal_review → approved_internal → client_review → approved → deployed
                                                    ↓
                                            changes_requested
                                            (zurück zu draft)
```

### Regeln
- **draft:** Nur Mitarbeiter/Admin sieht es
- **internal_review:** Mitarbeiter hat generiert, prüft selbst
- **approved_internal:** Mitarbeiter gibt frei → Content wird für Kunde sichtbar
- **client_review:** Kunde sieht es im Portal, kann freigeben oder Änderungen anfordern
- **approved:** Kunde hat freigegeben → bereit für Deployment (Meta Upload, Funnel Publish)
- **changes_requested:** Feedback vom Kunden, geht zurück an Mitarbeiter
- **deployed:** Live (in Meta geschaltet, Funnel published etc.)

### Wo sichtbar
- **Mitarbeiter:** Fulfillment-Seite pro Kunde, alle Status
- **Kunde:** Content Library + Fulfillment-Status, nur ab `approved_internal`
- **Admin:** Alles

### DB-Änderung
- `content_library.status` erweitern um: `draft`, `internal_review`, `approved_internal`, `client_review`, `approved`, `changes_requested`, `deployed`
- `content_library.reviewed_by` UUID nullable FK
- `content_library.client_feedback` TEXT nullable
- Approval-Log existiert bereits in `approval_log` Tabelle

---

## 4. Meta Marketing API Integration

### OAuth & Zugang
- Meta App (bereits vorhanden bei Felix)
- Mitarbeiter trägt Ad Account ID des Kunden ein in Agency-Settings
- System Token: Felix' System User Token mit Zugriff auf alle freigegebenen Ad Accounts
- Neues DB-Feld: `agencies.meta_ad_account_id` TEXT nullable
- Neues DB-Feld: `agencies.meta_page_id` TEXT nullable

### API-Routen
- `POST /api/meta/upload-ad` — Creative + Ad als PAUSED Entwurf erstellen
  - Bild hochladen → Ad Creative erstellen → Ad erstellen (Status: PAUSED)
  - Input: agency_id, image_url/image_data, headline, body_text, link_url, cta
  - Benötigt: Ad Account ID, Page ID, Access Token
- `POST /api/meta/publish-ad` — PAUSED Ad auf ACTIVE schalten
- `GET /api/meta/campaigns` — Kampagnen + KPIs abrufen
- `GET /api/meta/insights` — Detaillierte Insights (Spend, CPL, Impressions, Clicks, Leads)

### KPI-Sync
- API-Route `/api/meta/sync-insights` — pullt Insights für alle aktiven Agenturen
- Wird manuell oder per Cron (täglich) aufgerufen
- Speichert in `meta_ad_reports` Tabelle (existiert bereits)
- Felder: agency_id, date, campaign_id, spend, impressions, clicks, leads, cpl

### Sicherheit
- Meta Access Token als verschlüsseltes Feld oder Env-Var (System User Token)
- Alle Meta-API-Calls nur von Mitarbeiter/Admin ausführbar
- Rate Limiting beachten

---

## 5. Perspective Funnel Integration

### Was zu tun ist
- `/api/perspective/create-funnel` — ruft Perspective MCP `create_funnel` auf
  - Input aus Onboarding: Firmenname, Branche, Farben, Logo-URL, USPs
  - Template-basiert (D2D Recruiting Funnel Template)
- `/api/perspective/publish` — `publish_funnel` nach Kunden-Freigabe
- `/api/perspective/stats` — `get_funnel_stats` für Reports
- `/api/perspective/webhook` — eingehende Leads von Perspective → Kandidat im Kanban erstellen
  - Mapping: Name, Email, Telefon, Quelle = "Perspective"

### DB
- `perspective_funnels` existiert bereits
- Neues Feld: `perspective_funnels.template_id` TEXT nullable
- Webhook-URL pro Agency in Settings anzeigen

---

## 6. Call-Tracking System

### Neue Seite: Bewerber-Detail erweitern
Auf `/candidates/[id]` kommt ein neuer Tab/Bereich "Anrufe":
- Links: AI-generiertes Telefon-Skript (aus Content Library, Status `approved`)
- Rechts: Anruf-Protokoll-Formular

### Formular-Felder
- **Ergebnis** (Radio): Termin vereinbart, Kein Interesse, Mailbox/Nicht erreicht, Falsche Nummer, Rückruf gewünscht, Sonstiges
- **Notiz** (Textarea): Freitext
- **Nächster Schritt** (Select): Erneut anrufen, Termin bestätigen, Absage, Warten
- **Nächstes Datum** (Date, optional): Wann nächster Kontakt

### DB: Neue Tabelle `call_logs`
```sql
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  result TEXT NOT NULL CHECK (result IN (
    'termin_vereinbart', 'kein_interesse', 'nicht_erreicht',
    'falsche_nummer', 'rueckruf', 'sonstiges'
  )),
  notes TEXT,
  next_step TEXT CHECK (next_step IN (
    'erneut_anrufen', 'termin_bestaetigen', 'absage', 'warten'
  )),
  next_contact_date DATE,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### API
- `POST /api/candidates/[id]/calls` — Log erstellen
- `GET /api/candidates/[id]/calls` — Logs pro Bewerber laden
- RLS: Agency sieht nur eigene

### KPIs (aus Call-Logs berechnet)
- Anrufe gesamt, Anrufe heute
- Erreichbarkeitsquote (nicht `nicht_erreicht` / gesamt)
- Termin-Quote (termin_vereinbart / gesamt)
- Ø Zeit Eingang → erster Anruf (candidates.created_at → erster call_log.created_at)
- Anruf-Verteilung nach Ergebnis

---

## 7. Reports-Erweiterung

### Reports-Seite erweitern (Kunde + Admin)
Drei Sections:

**1. Bewerber-Pipeline** (existiert, erweitern)
- Zeitraum-Filter wirklich anbinden (this_week, this_month, last_month, all, custom)
- Trend-Chart (Bewerber pro Woche)

**2. Call-Performance** (neu)
- Anrufe gesamt, Erreichbarkeitsquote, Termin-Quote
- Ø Reaktionszeit
- Trend pro Woche

**3. Meta Ads** (neu)
- Spend, CPL, Impressions, Clicks, Leads
- Trend-Chart
- Nur sichtbar wenn `meta_ad_account_id` gesetzt

### API
- `GET /api/reports` erweitern um `type` Parameter: `pipeline`, `calls`, `meta`
- Zeitraum-Filter: `period` Parameter auswerten (existiert im Frontend, Backend ignoriert es)

---

## 8. Task-Kommentare + Team-Seite

### Task-Kommentare
- Neue Route `GET/POST /api/tasks/[id]/comments`
- Lädt/erstellt Kommentare aus `task_comments` Tabelle (existiert)

### Team-Seite (`/team`)
- Liste aller `team_members` mit Name, Position, zugewiesene Agenturen
- CRUD: Mitarbeiter hinzufügen/bearbeiten/entfernen
- Agency-Zuweisung über `employee_assignments` Tabelle (existiert)

---

## 9. Indeed-Generierung

### Kein API-Upload — nur AI-Generierung + Copy
- Content-Typ `job_posting` in AI-Generierung
- Generiert: Stellentitel, Beschreibung, Anforderungen, Benefits, Gehaltsspanne
- Jeder Block hat Copy-to-Clipboard Button
- Mitarbeiter pflegt manuell bei Indeed ein
- Wird im Fulfillment als eigener Task angezeigt, Status manuell auf "done"

---

## 10. Fulfillment-Aufgaben (erweitert)

### Automatisch generierte Tasks nach Onboarding
1. Ad Copys generieren — `ai_generate` — 1-Click
2. Telefon-Skripte generieren — `ai_generate` — 1-Click
3. Video-Skripte generieren — `ai_generate` — 1-Click
4. Stellenanzeigen generieren — `ai_generate` — 1-Click
5. Perspective Funnel erstellen — `api_call` — 1-Click
6. Creatives/Bilder generieren — `ai_generate` — 1-Click (Creative Brief)
7. Meta Kampagne hochladen — `api_call` — 1-Click (nach Freigabe)
8. Indeed Texte kopieren — `manual` — Mitarbeiter pflegt ein
9. Meta Zugang verifizieren — `manual` — Mitarbeiter prüft im Business Manager
10. Funnel publishen — `api_call` — 1-Click (nach Freigabe)

### Abhängigkeiten
- Tasks 1-6 können parallel laufen
- Task 7 (Meta Upload) braucht: Freigabe von Ad Copys + Creatives + Meta Zugang verifiziert
- Task 10 (Funnel Publish) braucht: Freigabe von Funnel
- Task 8 (Indeed) braucht: Freigabe von Stellenanzeigen

---

## Technische Entscheidungen

- **AI:** Anthropic SDK `@anthropic-ai/sdk`, Model `claude-sonnet-4-6`, Streaming für Chat
- **Meta API:** Facebook Marketing API v21.0, System User Token
- **Perspective:** Über bestehende MCP-Tools (claude.ai Perspective Server)
- **File Upload:** Supabase Storage, Bucket `onboarding-assets`
- **Keine neuen UI-Libraries** — alles mit bestehendem Apple Red Design System
- **Neue Migrations:** 1 Migration für Call-Logs + Content-Status-Erweiterung + Agency-Meta-Felder

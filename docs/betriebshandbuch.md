# Betriebshandbuch — Zoepp Media Cloud

> Stand: September 2026 | Phase 7 — DSGVO & Härtung
> Verantwortlich: Felix Zöpp (felix@zoeppmedia.de)
> Repo: `/Users/felix-leonzoepp/zoepp-media-cloud`
> Deployment: Vercel (Region: `dub1`, Dublin), Supabase (EU-West)

---

## Inhaltsverzeichnis

1. [Supabase-Auth-Härtung (Ruling P7-R2)](#1-supabase-auth-härtung)
2. [Backups & Restore](#2-backups--restore)
3. [Env-Flags & Secrets](#3-env-flags--secrets)
4. [Meta/WhatsApp-Betrieb](#4-metawhatsapp-betrieb)
5. [Monitoring & Alarme](#5-monitoring--alarme)
6. [DSGVO-Betrieb](#6-dsgvo-betrieb)
7. [Launch-Checkliste: Pilot → 100 Kunden](#7-launch-checkliste-pilot--100-kunden)

---

## 1. Supabase-Auth-Härtung

> **Ruling P7-R2** — Diese Einstellungen werden im Supabase Dashboard vorgenommen,
> nicht im Applikationscode. Sie sind nach jedem Projekt-Fork (z. B. für Staging)
> erneut zu setzen.

### 1.1 Session-Lebensdauer (JWT + Refresh-Token)

**Ziel:** Sitzungen sind maximal 12 Stunden gültig; nach Ablauf muss sich der Nutzer
erneut authentifizieren.

**Schritte:**
1. Supabase Dashboard öffnen → Projekt auswählen.
2. Linke Navigation: **Authentication** → **Settings**.
3. Abschnitt **JWT expiry**: Wert auf `43200` setzen (= 12 × 3600 Sekunden).
4. Abschnitt **Refresh Token**: **Rotation aktivieren** (Toggle auf "Enabled").
5. **Reuse interval**: `10` (Sekunden) — verhindert Replay-Angriffe bei gleichzeitigen Tabs.
6. Speichern mit **Save**.

> Bestehende Sitzungen werden nach dem nächsten Refresh automatisch auf das neue Limit
> begrenzt. Aktive Sitzungen, die das Limit bereits überschreiten, werden beim nächsten
> Token-Refresh invalidiert.

### 1.2 Lockout & Rate-Limits für Sign-in

**Ziel:** Nach 10 Fehlversuchen wird der Account für 15 Minuten gesperrt.

**Schritte:**
1. Authentication → Settings → Abschnitt **Rate Limits**.
2. **OTP / Magic Link rate limit**: `5` pro Stunde (verhindert E-Mail-Bombing).
3. **Sign-in / Email confirmation rate limit**: Maximale Fehlversuche `10`.
4. **Lockout duration**: `900` Sekunden (= 15 Minuten).
5. Speichern.

> Supabase implementiert Lockout serverseitig — kein eigener Code erforderlich.
> Lockouts werden in den Supabase Auth-Logs sichtbar.

### 1.3 E-Mail-OTP-Expiry

**Ziel:** Einmal-Tokens für Magic Links und E-Mail-Bestätigung laufen nach 10 Minuten ab.

**Schritte:**
1. Authentication → Settings → Abschnitt **Email**.
2. **Email OTP expiry**: `600` (= 10 Minuten in Sekunden).
3. Speichern.

### 1.4 Supabase Auth-Logs (Login-Audit)

- Auth-Ereignisse (Login, Logout, Fehler) sind unter **Logs → Auth** einsehbar.
- Für langfristige Aufbewahrung: Log-Drain auf eigenes S3-Bucket oder Papertrail konfigurieren
  (Supabase Dashboard → Settings → Log Drains).
- Empfehlung: Log-Drain für 90-tägige Aufbewahrung der Auth-Events einrichten.

---

## 2. Backups & Restore

### 2.1 Point-in-Time Recovery (PITR)

**Status prüfen:**
1. Supabase Dashboard → **Settings** → **Database** → Abschnitt **Backups**.
2. Prüfen ob "Point-in-Time Recovery" aktiv ist (Paid Plan erforderlich, ab Pro).
3. Wenn deaktiviert: Plan upgraden und PITR aktivieren.
4. RPO (Recovery Point Objective): Standard sind 1-minütige WAL-Snapshots.

**Wichtige Parameter:**
- Aufbewahrungszeitraum: Standardmäßig 7 Tage (Pro) / 30 Tage (Enterprise).
- PITR-Granularität: 1 Minute.

### 2.2 Restore-Probe (Pflicht: vierteljährlich)

Eine Restore-Probe ist alle 3 Monate durchzuführen und im Protokoll festzuhalten.

**Vorgehen:**
1. Supabase Dashboard → **Settings** → **Database** → **Restore**.
2. "Fork project" wählen — erstellt eine Kopie des Projekts mit Daten zu einem bestimmten Zeitpunkt.
3. Im geforkten Projekt: SQL-Editor öffnen.
4. Stichproben-Query ausführen:
   ```sql
   SELECT
     (SELECT COUNT(*) FROM candidates) AS candidates_count,
     (SELECT COUNT(*) FROM applications) AS applications_count,
     (SELECT COUNT(*) FROM agencies) AS agencies_count;
   ```
5. Ergebnis mit letztem bekannten Produktionswert vergleichen (aus den täglichen Cron-Logs).
6. Geforktes Projekt nach der Probe löschen (spart Kosten).

**Protokollfeld** (hier ausfüllen):

| Datum       | Durchgeführt von | Kandidaten | Bewerbungen | Status  | Anmerkungen |
|-------------|-----------------|------------|-------------|---------|-------------|
| _[Datum]_   | _[Name]_        | _[Anzahl]_ | _[Anzahl]_  | OK / NOK | —           |

### 2.3 Verantwortlichkeit

- **Primär:** Felix Zöpp (Systemadministrator)
- **Vertretung:** Laut Team-Rollen-Dokument (`docs/superpowers/plans/`)
- **Eskalation bei Restore-Fehler:** Supabase Support (support@supabase.io) + Status-Seite: `status.supabase.com`

---

## 3. Env-Flags & Secrets

Alle Secrets werden über das Vercel Dashboard verwaltet:
Vercel → Projekt → **Settings** → **Environment Variables**.

Nach jeder Änderung einer Variablen muss ein neues Deployment ausgelöst werden:
```bash
vercel deploy --prod
```

### 3.1 Vollständige Env-Tabelle

| Variable | Zweck | Pflicht | Flip-Anleitung |
|----------|-------|---------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase-Projekt-URL (public) | Ja | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key (public) | Ja | Supabase → Settings → API → anon/public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service-Role-Key (nur Server) | Ja | Supabase → Settings → API → service_role; **niemals Client-seitig** |
| `CRON_SECRET` | Authentifizierung der Vercel-Cron-Endpunkte | Ja | Zufälliger 32-Byte-Hex-Wert; nach Rotation Vercel und vercel.json synchron halten |
| `RESEND_API_KEY` | Transaktions-E-Mails (Berichte, Einladungen) | Ja | Resend Dashboard → API Keys; alten Key erst nach Deployment des neuen löschen |
| `WEEKLY_REPORTS_ENABLED` | Aktiviert wöchentliche E-Mail-Berichte (Montags, Cron) | Nein | `true` / `false` (Default: aus) — erst aktivieren wenn Resend-Kontingent ausreicht |
| `INDEED_APPLY_SECRET` | HMAC-Secret für Indeed-Apply-Webhook | Nein | Indeed Employer Portal → Webhook-Einstellungen → Secret rotieren; kurzes Overlap-Fenster (~5 Min) einplanen |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile Site-Key (Client) | Nein | **Zuerst** Site-Key deployen und Widget im /apply-Formular prüfen — dann erst `TURNSTILE_SECRET_KEY` setzen |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile Secret (Server-Validation) | Nein | **Erst nach** Site-Key-Deployment setzen; ohne diesen Key: Validation überspringt (fail-open, Ruling P7-R4) |
| `REQUIRE_ADMIN_2FA` | Schaltet 2FA für interne Admins von Soft-Banner auf Hard-Gate | Nein | **Erst setzen wenn ALLE Admins TOTP enrollt haben** — sonst droht Lockout! |
| `ANTHROPIC_API_KEY` | Anthropic-API für KI-Bot (Dialog + Scoring) | Nein | anthropic.com → Console → API Keys; Modelle: `claude-haiku-4-5` (Dialog), `claude-sonnet-4-6` (Scoring) |
| `OPENAI_API_KEY` | OpenAI (Transkription von Anruf-Aufnahmen) | Nein | platform.openai.com → API Keys |
| `META_SYSTEM_USER_TOKEN` | Meta Business Suite System-User-Token (Langzeit) | Nein | Meta Business Suite → System Users → Token generieren (90-Tage-Ablauf beachten!) |
| `META_APP_ID` | Meta App-ID für Embedded Signup | Nein | Meta Developer Console → App-Einstellungen |
| `META_APP_SECRET` | Meta App Secret für Webhook-Signaturprüfung | Nein | Meta Developer Console → App-Einstellungen → App Secret |
| `META_WEBHOOK_VERIFY_TOKEN` | Verifikationstoken für Meta-Webhook-Handshake | Nein | Selbst gewählter String; muss mit Meta-Webhook-Konfiguration übereinstimmen |
| `WHATSAPP_VERIFY_TOKEN` | Verifikationstoken für WhatsApp-Webhook | Nein | Wie `META_WEBHOOK_VERIFY_TOKEN` — für separaten WhatsApp-Webhook-Endpunkt |
| `NEXT_PUBLIC_META_APP_ID` | Meta App-ID (Client, Embedded Signup UI) | Nein | Wie `META_APP_ID` |
| `NEXT_PUBLIC_META_ES_CONFIG_ID` | Meta Embedded Signup Config-ID | Nein | Meta Developer Console → Embedded Signup |
| `META_AD_ACCOUNT_ID` | Meta Ad Account ID für Marketing-Reports | Nein | Meta Business Suite → Ad Accounts |
| `META_ACCESS_TOKEN` | Meta Access Token für Ad-API (Marketing-Reports) | Nein | 60-Tage-Ablauf; Erneuerung über Meta Token Debugger oder Long-Lived-Token-Flow |
| `WHATSAPP_API_BASE_URL` | Überschreibt die Meta-Graph-API-Basis-URL | Nein | Default: `https://graph.facebook.com/v23.0` — nur für Tests überschreiben |
| `SLACK_BOT_TOKEN` | Slack-Bot-Token für tägliche Reports | Nein | Slack App → OAuth Tokens; Berechtigung `chat:write` |
| `SLACK_MARKETING_CHANNEL` | Slack-Kanal-ID für Marketing-Reports | Nein | Kanal-ID (nicht -name) aus Slack-URL |
| `SLACK_SALES_CHANNEL` | Slack-Kanal-ID für Sales-Reports | Nein | Kanal-ID (nicht -name) |
| `CLOSE_API_KEY` | Close CRM API-Key (Sales-Reports) | Nein | Close CRM → Einstellungen → API |
| `STRIPE_SECRET_KEY` | Stripe Secret Key (Zahlungen) | Nein | Stripe Dashboard → API Keys; Test-/Live-Key je nach Umgebung |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook Signing Secret | Nein | Stripe Dashboard → Webhooks → Signing Secret |
| `MOLLIE_API_KEY` | Mollie API-Key (alternatives Payment) | Nein | Mollie Dashboard → Developers → API Keys |
| `LEXOFFICE_API_KEY` | Lexoffice/Lexware API (Rechnungs-Sync) | Nein | Lexoffice → Integrationen → API |
| `CALENDLY_API_KEY` | Calendly API für Termin-Sync | Nein | Calendly → Integrations → API & Webhooks |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | Calendly Webhook Signaturprüfung | Nein | Calendly → Webhooks → Signing Key |
| `PERSPECTIVE_WEBHOOK_SECRET` | Bewerberpool-Plattform Webhook Secret | Nein | Perspektive-Dashboard → Webhooks |
| `INDEED_WEBHOOK_SECRET` | Indeed E-Mail-Webhook Secret | Nein | Indeed Employer → Webhook Settings |
| `ENCRYPTION_KEY` | AES-256-Schlüssel für verschlüsselte DB-Felder (Hex) | Ja (bei Produktion) | 32 Byte zufällig, als Hex (64 Zeichen); Rotation erfordert DB-Neuverschlüsselung! |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID Public Key für Web-Push | Nein | Mit `web-push generate-vapid-keys` erzeugen |
| `VAPID_PRIVATE_KEY` | VAPID Private Key für Web-Push | Nein | Aus gleichem Schlüsselpaar wie Public Key |
| `NEXT_PUBLIC_APP_URL` | Öffentliche App-URL (für E-Mail-Links etc.) | Ja | z. B. `https://cloud.zoeppmedia.de` |
| `BOT_DIALOG_MODEL` | Anthropic-Modell für Bot-Dialog | Nein | Default: `claude-haiku-4-5` |
| `BOT_SCORING_MODEL` | Anthropic-Modell für Kandidaten-Scoring | Nein | Default: `claude-sonnet-4-6` |

### 3.2 Sicherheits-kritische Flip-Reihenfolgen

**Turnstile aktivieren (Reihenfolge einhalten!):**
1. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel setzen → `vercel deploy --prod`
2. `/apply`-Formular im Browser öffnen und prüfen, ob das Turnstile-Widget erscheint.
3. Bewerbungsformular erfolgreich absenden (Funktionstest).
4. Erst dann: `TURNSTILE_SECRET_KEY` setzen → `vercel deploy --prod`
5. Erneuten Formular-Submit testen — diesmal mit aktivierter Server-Validierung.

> **Warum diese Reihenfolge?** Ohne Site-Key wird kein Widget gerendert, der Token ist `null`.
> Wenn Server-Secret schon aktiv ist, bevor der Client-Token vorhanden ist, schlagen alle
> Bewerbungen fehl (400-Fehler).

**REQUIRE_ADMIN_2FA aktivieren (VORSICHT — Lockout-Risiko!):**
1. Alle Admin-Konten (`role = 'admin'`) müssen TOTP in den Einstellungen enrollt haben.
2. Prüfen: Im internen Bereich sollte für keinen Admin mehr der gelbe Soft-Banner erscheinen.
3. Test-Login mit einem Admin-Konto der TOTP-Verification durchführen.
4. Erst dann: `REQUIRE_ADMIN_2FA=true` setzen → `vercel deploy --prod`
5. Login mit 2FA-aktiviertem Admin-Konto erneut testen.

> **Lockout-Szenario:** Wenn ein Admin nach Aktivierung keinen enrollten TOTP-Faktor hat,
> wird er nach `/login` umgeleitet und kann sich nicht einloggen. Recovery: Env-Variable
> in Vercel auf `false` zurücksetzen → neues Deployment → Konto enrollen.

---

## 4. Meta/WhatsApp-Betrieb

### 4.1 Template-Status-Sync

Der stündliche Cron (`/api/cron/sync-whatsapp`, `0 * * * *`) synchronisiert automatisch
den Template-Status und das Qualitäts-Rating von der Meta-API in die lokale Datenbank
(`whatsapp_templates.status`, `quality_score`).

**Mögliche Template-Status:**
- `pending` — Meta prüft noch
- `approved` — aktiv nutzbar
- `rejected` — abgelehnt (neues Template erstellen)
- `paused` — temporär gesperrt durch Meta
- `deleted` — Template ist nicht mehr verwendbar

**Überwachung:**
- Vercel Logs → `/api/cron/sync-whatsapp` nach Fehlern prüfen
- In der App: Intern → Einstellungen → WhatsApp → Vorlagen-Übersicht zeigt Status + Qualitätsbewertung

### 4.2 Qualitäts-Rating beobachten

Meta bewertet die Qualität von Templates in 3 Stufen:
- **GREEN** — Alles in Ordnung
- **YELLOW** — Warnung: Nutzer markieren Nachrichten als Spam oder blockieren die Nummer
- **RED** — Risiko: Nummernsperre droht

**Empfohlene Maßnahmen bei YELLOW/RED:**
1. Template-Inhalt überprüfen: Ist der Text klar und erwünscht?
2. Versand-Frequenz reduzieren.
3. Opt-out-Möglichkeit in Nachrichten stärker hervorheben.
4. Bei RED: Template sofort pausieren, bis Qualität wiederhergestellt ist.

### 4.3 Nummern-Limits und Nachrichten-Skalierung

Meta begrenzt neue WhatsApp Business-Nummern nach Registrierung:
- **Tier 1:** 1.000 Business-initiierte Gespräche/24h
- **Tier 2:** 10.000/24h (nach Verifikation und guter Qualität)
- **Tier 3:** 100.000/24h
- **Unbegrenzt:** Nach weiterer Skalierung möglich

Limits erhöhen sich automatisch durch konstant hohe Qualitätsbewertung und Volumen.

### 4.4 Vorgehen bei "flagged" Status

Wenn eine WhatsApp-Business-Nummer den Status `flagged` erhält:
1. Sofort alle aktiven Template-Versendungen stoppen.
2. Meta Business Suite → WhatsApp Accounts → Nummer-Details prüfen.
3. Ursache analysieren: hohe Spam-Rate, abgelaufene Templates, Opt-in-Verletzungen.
4. Beschwerde einreichen unter: [Meta Business Help](https://www.facebook.com/business/help)
5. Wenn keine Reaktion innerhalb 48h: Supabase `whatsapp_numbers` → Nummer deaktivieren.

### 4.5 System-User-Token-Ablauf (Meta)

Meta-System-User-Tokens laufen nach 90 Tagen ab. Kalender-Erinnerung einrichten!

**Erneuerungs-Prozess:**
1. Meta Business Suite → Einstellungen → System Users → Token generieren.
2. Neuen Token in Vercel als `META_SYSTEM_USER_TOKEN` setzen.
3. `vercel deploy --prod` ausführen.
4. Token im Supabase-Tabelle `whatsapp_numbers` für jeden Mandanten ebenfalls aktualisieren
   (verschlüsselt gespeichert via `ENCRYPTION_KEY`).

### 4.6 Meta Page Access Tokens (Mandanten-spezifisch)

Mandanten-spezifische Page-Tokens werden pro WhatsApp-Number in der Datenbank
gespeichert (`whatsapp_numbers.access_token`, AES-256 verschlüsselt).

Ablauf-Prüfung:
```sql
SELECT agency_id, phone_number_id, updated_at
FROM whatsapp_numbers
WHERE updated_at < NOW() - INTERVAL '80 days';
```

---

## 5. Monitoring & Alarme

### 5.1 Admin-Übersicht (Ampel)

Im internen Bereich (`/internal`) zeigt die Admin-Übersicht ein farbcodiertes Ampel-System:
- **Grün:** Alle Systeme normal
- **Gelb:** Warnung — z. B. WhatsApp-Qualitätsbewertung YELLOW, offene Fulfillment-Tasks überfällig
- **Rot:** Kritisch — z. B. Webhook-Fehler, Meta-API nicht erreichbar, Cron-Ausfälle

Probleme werden täglich durch `detectProblemsForAgency()` erkannt und in der Tabelle
`agency_problems` gespeichert.

### 5.2 Ingest-Monitor (Daily Cron)

Der tägliche Cron (`/api/cron/daily`, `0 8 * * *` UTC) führt u. a. folgende Checks durch:
- Bewerbungs-Ingest-Statistiken (letzte 24h)
- Problem-Detection für alle Agenturen
- Retention-Lauf (Kandidaten-Anonymisierung nach Ablauf der Frist)
- WhatsApp-Template-Sync
- Wöchentlicher Report (Montags, wenn `WEEKLY_REPORTS_ENABLED=true`)

**Cron-Ausfall erkennen:**
- Vercel Dashboard → Deployments → Functions → `/api/cron/daily` → Execution-Log
- Alternativ: Vercel Log-Drain auf Sentry/Papertrail konfigurieren und Alert bei fehlenden Cron-Logzeilen setzen

### 5.3 Vercel-Logs

Vercel-Funktionslogs abrufen:
```bash
# Aktuelle Logs (alle Funktionen)
vercel logs --prod

# Nur für eine spezifische Route
vercel logs --prod --filter /api/cron/daily

# Fehler der letzten Stunde
vercel logs --prod --level error
```

Alternativ: Vercel Dashboard → Projekt → **Logs** → Filter setzen.

### 5.4 Eskalationspfad

| Schweregrad | Kriterium | Sofortmaßnahme | Eskalation |
|-------------|-----------|----------------|------------|
| P1 (kritisch) | App nicht erreichbar, DB-Fehler | Vercel Status prüfen, ggf. Rollback mit `vercel rollback` | Felix Zöpp sofort |
| P2 (hoch) | Cron-Ausfall >2h, Meta-Webhook ausgefallen | Manuelle Ausführung, Fehlerursache in Logs | Felix Zöpp innerhalb 4h |
| P3 (mittel) | WhatsApp-Qualitäts-YELLOW, einzelne 500-Fehler | Logs analysieren, ggf. Templates pausieren | Nächster Werktag |
| P4 (niedrig) | Retention-Warnungen, ausstehende Tasks | Im nächsten regulären Wartungsfenster beheben | Weekly Review |

---

## 6. DSGVO-Betrieb

### 6.1 Auskunft und Löschung (Kandidaten)

**Auskunfts-Anfrage (Art. 15 DSGVO):**
1. Interner Bereich → Kandidaten-Detail-Seite des betroffenen Kandidaten öffnen.
2. Button **"DSGVO-Export"** → Download als JSON oder PDF.
3. JSON/PDF enthält: Stammdaten, Bewerbungen, Nachrichten, Dokument-Metadaten, Audit-Trail.
4. Innerhalb 30 Tagen nach Anfrage an Betroffenen übermitteln.

**Lösch-Anfrage (Art. 17 DSGVO):**
1. Kandidaten-Detail → **"DSGVO-Löschen"**-Button (ConsentCard-Komponente).
2. Aktion führt zur Anonymisierung (nicht Löschung): Name → "Anonymisiert", Kontaktdaten → `null`,
   Dokumente im Storage gelöscht, Nachrichten-Inhalt → `null`.
3. Audit-Log-Eintrag wird automatisch erstellt (`action: 'anonymize'`).
4. Anonymisierte Kandidaten verbleiben als statistische Datenpunkte (ohne PII) in der DB.

> Gesetzliche Aufbewahrungspflichten (z. B. Rechnungsdaten) bleiben unberührt und
> werden separat in Lexoffice/Lexware gespeichert.

### 6.2 Retention — Automatische Anonymisierung

Der tägliche Cron führt `runRetention()` aus:
- **Default:** 180 Tage nach Erstellung des Kandidaten-Datensatzes.
- **Konfigurierbar:** `agencies.retention_days` — pro Mandant individuell einstellbar.
- **Ausnahme:** Kandidaten mit offenen Bewerbungen (`status = 'open'`) oder kürzlich
  aktualisierter Bewerbung (innerhalb der Frist) werden nicht anonymisiert.

Retention-Wert für einen Mandanten ändern:
```sql
UPDATE agencies SET retention_days = 90 WHERE slug = 'mein-mandant';
```

### 6.3 AVV-Checkliste (Auftragsverarbeitungsverträge)

Vor dem Live-Gang mit jedem Mandanten sicherstellen:

| Dienstleister | AVV vorhanden | Ort | Anmerkung |
|---------------|--------------|-----|-----------|
| **Supabase** | Ja (automatisch bei Pro+) | Supabase Dashboard → Settings → Legal | EU-Hosting, SOC 2 Type II |
| **Vercel** | Ja | Vercel Dashboard → Settings → Legal → DPA | EU-Region `dub1` gewählt |
| **Meta (WhatsApp)** | Über Meta Business Terms | Meta Business Suite → Terms | Getrennte Data Processing Terms |
| **Anthropic** | Ja (API Terms of Service) | console.anthropic.com → Terms | Daten werden nicht für Training genutzt (opt-out) |
| **OpenAI** | Ja (Enterprise/API) | platform.openai.com → Legal | Zero-Data-Retention-Option prüfen |
| **Resend** | Ja | resend.com → Privacy/DPA | EU-Datenverarbeitung bestätigen |
| **Cloudflare (Turnstile)** | Über Cloudflare DPA | cloudflare.com/dpa | Kostenloser Tier, keine E-Mail-Adressen |

### 6.4 Verzeichnis von Verarbeitungstätigkeiten (VVT)

Gemäß Art. 30 DSGVO ist ein Verzeichnis aller Verarbeitungstätigkeiten zu führen.
Die Zoepp Media Cloud ist als Auftragsverarbeiter tätig; jeder Mandant ist Verantwortlicher.

**Kernverarbeitungsvorgänge:**
1. **Bewerbungseingang:** Name, Telefon, E-Mail, Einwilligung WhatsApp — Zweck: Recruiting
2. **KI-Vorqualifizierung:** Gespräch via WhatsApp-Bot — Zweck: Kandidatenqualifizierung
3. **Terminvereinbarung:** Vorqualifizierungsgespräch — Zweck: Kandidatenauswahl
4. **Retention/Anonymisierung:** Automatische Datenlöschung nach Ablauf der Frist

**Hinweis:** Das vollständige VVT muss in einem separaten Dokument (z. B. Word/PDF) nach
Art. 30 DSGVO gepflegt werden. Dieses Handbuch dient als technische Grundlage.

### 6.5 Datenschutzerklärung der Mandanten

Jede Agentur (Mandant) muss eine eigene Datenschutzerklärung vorhalten.
URL wird in `agencies.privacy_url` gespeichert und im `/apply`-Formular verlinkt.

Prüfen ob alle Mandanten eine URL hinterlegt haben:
```sql
SELECT slug, name, privacy_url
FROM agencies
WHERE privacy_url IS NULL OR privacy_url = '';
```

---

## 7. Launch-Checkliste: Pilot → 100 Kunden

Vor der Freigabe für den Live-Betrieb mit dem ersten Pilotkunden und vor dem Skalieren
auf 100 Kunden folgende Punkte abhaken:

### 7.1 Sicherheit & Härtung

- [ ] **Cloudflare Turnstile aktiv:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`
  gesetzt und getestet. Widget erscheint im `/apply`-Formular, Bewerbung läuft durch.
- [ ] **2FA aller Admins:** Alle Nutzer mit `role = 'admin'` oder `role = 'internal'` haben
  TOTP aktiviert. Prüfen:
  ```sql
  -- Supabase Dashboard → Authentication → Users → MFA-Status prüfen
  -- Kein interner User ohne enrollten TOTP-Faktor vorhanden.
  ```
- [ ] **REQUIRE_ADMIN_2FA aktiviert:** Env-Variable auf `true` gesetzt, Deployment
  durchgeführt, Login mit 2FA erfolgreich getestet.
- [ ] **Supabase-Auth-Härtung (Ruling P7-R2):** JWT-Expiry 12h, Refresh-Token-Rotation,
  10-Fehlversuch-Lockout, OTP-Expiry 10 Min. — alles gemäß Abschnitt 1 dieses Handbuchs gesetzt.

### 7.2 Lasttest

- [ ] **Lasttest gegen Staging bestanden:** `scripts/loadtest-apply.mjs` erfolgreich ausgeführt.
  - Zielwerte: 1000 Bewerbungen in 10 Minuten, p95-Latenz < 3 Sekunden.
  - Staging-Umgebung mit erhöhtem Rate-Limit oder Multi-IP-Setup verwendet.
  - Protokoll:

| Datum | Umgebung | total | concurrency | p95 (ms) | Status |
|-------|----------|-------|-------------|----------|--------|
| _[Datum]_ | staging | 1000 | 50 | _[ms]_ | BESTANDEN / FEHLGESCHLAGEN |

### 7.3 Datensicherheit

- [ ] **Restore-Probe dokumentiert:** Vierteljährliche Restore-Probe gemäß Abschnitt 2.2
  durchgeführt und im Protokoll eingetragen. Kandidatenzahl stimmt überein.
- [ ] **PITR aktiviert:** Supabase Point-in-Time Recovery aktiv (Pro-Plan).
- [ ] **ENCRYPTION_KEY gesetzt:** 32-Byte-Hex-Key für verschlüsselte DB-Felder vorhanden.

### 7.4 Monetarisierung & Konfiguration

- [ ] **Preistabelle `meta_pricing` geprüft:** Aktuelle Meta-Kosten pro Nachrichtentyp
  und Zielland in der Datenbank vorhanden (relevant für Verbrauchsabrechnung).
  ```sql
  SELECT COUNT(*) FROM meta_pricing; -- > 0 erwartet
  ```
- [ ] **Datenschutzerklärungen aller Mandanten gepflegt:** `agencies.privacy_url` für
  alle aktiven Mandanten gefüllt. Prüfquery aus Abschnitt 6.5 ausführen.

### 7.5 Betriebsbereitschaft

- [ ] **Crons laufen zuverlässig:** Vercel Dashboard zeigt erfolgreiche Ausführung von
  `daily`, `cadence`, `tick` und `sync-whatsapp` in den letzten 48h.
- [ ] **AVV-Checkliste vollständig:** Alle Dienstleister aus Abschnitt 6.3 geprüft.
- [ ] **Monitoring-Eskalationspfad kommuniziert:** Team kennt die Eskalationsstufen
  aus Abschnitt 5.4.
- [ ] **Meta System-User-Token-Ablauf im Kalender:** Erinnerung 2 Wochen vor Ablauf (90 Tage).

---

## Anhang: Nützliche SQL-Snippets

```sql
-- Aktive Agenturen zählen
SELECT COUNT(*) FROM agencies WHERE onboarding_completed = true;

-- Kandidaten der letzten 7 Tage
SELECT COUNT(*) FROM candidates WHERE created_at > NOW() - INTERVAL '7 days';

-- Rate-Limit-Counter anzeigen (für Debugging)
SELECT key, count, window_start FROM rate_limit_counters ORDER BY window_start DESC LIMIT 20;

-- Anonymisierte Kandidaten dieses Jahres
SELECT COUNT(*) FROM candidates WHERE anonymized_at > DATE_TRUNC('year', NOW());

-- WhatsApp-Templates mit schlechter Qualität
SELECT agency_id, name, status, quality_score FROM whatsapp_templates
WHERE quality_score IN ('RED', 'YELLOW') ORDER BY quality_score;

-- Mandanten ohne Datenschutzerklärung
SELECT slug, name FROM agencies WHERE privacy_url IS NULL OR privacy_url = '';
```

---

*Dieses Handbuch ist Teil des Phase-7-Deliverables (DSGVO & Härtung) der Zoepp Media Cloud.*
*Letzte Aktualisierung: September 2026 — bei Systemänderungen aktualisieren.*

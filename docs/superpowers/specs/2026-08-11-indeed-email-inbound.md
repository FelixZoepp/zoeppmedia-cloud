# Indeed Email-Inbound mit PDF-Parsing — Design Spec

## Kontext

Indeed hat keine API für Bewerber-Import. Aktuell werden Indeed-Bewerber manuell ins System eingetragen. Lösung: Indeed sendet Email-Benachrichtigungen bei neuen Bewerbungen → Resend Inbound Webhook empfängt die Email → System parst Name, Kontaktdaten, Lebenslauf-PDF automatisch → Bewerber wird im Kanban angelegt.

---

## 1. Inbound Email Flow

### Adressformat

`bewerber+[agency_id]@zoeppmedia.de`

Die Agency-ID wird aus dem `+tag` der Email-Adresse extrahiert. Resend Inbound muss für die Domain `zoeppmedia.de` konfiguriert sein.

### Webhook-Endpoint

`POST /api/webhooks/indeed-email`

Kein Auth (Webhook von Resend). Resend sendet den Email-Inhalt als JSON mit:
- `from` — Absender (Indeed)
- `to` — Empfänger (bewerber+xxx@zoeppmedia.de)
- `subject` — Email-Betreff (enthält oft Bewerber-Name + Stellentitel)
- `html` / `text` — Email-Body
- `attachments` — Array mit Base64-codierten Anhängen

### Verarbeitungs-Pipeline

1. **Agency-ID extrahieren** — aus dem `to`-Feld den +tag parsen
2. **Agency validieren** — prüfen ob Agency-ID in DB existiert
3. **Email-Body parsen** — Name, Email, Telefon, Stellentitel aus HTML/Text extrahieren
4. **PDF-Anhang erkennen** — Attachment mit `content_type: application/pdf` finden
5. **PDF in Supabase Storage speichern** — Bucket `candidate-resumes`, Pfad `[agency_id]/[timestamp]-[name].pdf`
6. **PDF-Text extrahieren** — via `pdf-parse` Library
7. **Claude AI-Extraktion** — strukturierte Daten aus PDF-Text extrahieren (Haiku, günstig + schnell)
8. **Daten mergen** — Email-Body-Daten + PDF-Daten, PDF gewinnt bei Konflikten
9. **Bewerber anlegen** — in `candidates` Tabelle mit source `indeed`
10. **Stage-Log** — erster Pipeline-Stage zuweisen

---

## 2. No-Fail-Strategie

Jeder Schritt hat einen Fallback. Der Bewerber wird IMMER angelegt.

| Schritt | Fehlschlag | Fallback |
|---------|-----------|----------|
| Agency-ID aus +tag | Kein +tag oder ungültige ID | Email in `inbound_email_log` speichern, Admin benachrichtigen, nicht verarbeiten |
| Email-Body parsen | Format anders als erwartet | Nur Name aus Subject extrahieren ("Neue Bewerbung von Max Mustermann") |
| PDF-Anhang | Kein PDF angehängt | Bewerber trotzdem anlegen, ohne CV |
| PDF speichern | Storage-Fehler | Bewerber ohne CV-Link anlegen |
| PDF-Text extrahieren | Verschlüsseltes/Bild-PDF | Bewerber anlegen, PDF trotzdem speichern (manuell lesbar) |
| Claude PDF-Parsing | API-Fehler oder Timeout | Bewerber mit Email-Body-Daten anlegen |
| Bewerber anlegen | DB-Fehler | Retry 1x, dann Email in Log speichern |

---

## 3. Email-Body Parsing

Indeed Bewerbungs-Emails haben typischerweise dieses Format:

```
Subject: Neue Bewerbung: [Stellentitel] — [Bewerber-Name]

Body:
[Bewerber-Name] hat sich auf Ihre Stelle "[Stellentitel]" beworben.

Kontaktdaten:
E-Mail: xxx@example.com (oder reply-xxx@indeed.com)
Telefon: 0151 12345678 (optional)

[Link zur Bewerbung auf Indeed]
```

Parser-Regeln:
- Name: aus Subject nach "—" oder aus Body erste Zeile
- Email: Regex für Email-Adressen im Body
- Telefon: Regex für deutsche Telefonnummern (0xxx, +49xxx)
- Stellentitel: aus Subject zwischen "Bewerbung:" und "—"

---

## 4. PDF-Extraktion via Claude

System-Prompt für Claude Haiku:

```
Du extrahierst strukturierte Daten aus einem Lebenslauf-Text.
Antworte NUR mit einem JSON-Objekt, keine Erklärung.

Extrahiere:
{
  "full_name": "Vollständiger Name",
  "email": "Email-Adresse oder null",
  "phone": "Telefonnummer oder null",
  "location": "Wohnort/Stadt oder null",
  "experience_summary": "1-2 Sätze über relevante Berufserfahrung",
  "last_employer": "Letzter/aktueller Arbeitgeber oder null"
}

Wenn ein Feld nicht findbar ist, setze null.
```

Model: `claude-haiku-4-5-20251001` (schnell, günstig — ca. $0.001 pro CV)

---

## 5. DB-Änderungen

### candidates Tabelle erweitern

```sql
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_url TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS experience_summary TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_employer TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS indeed_job_title TEXT;
```

### Neue Tabelle: inbound_email_log

Für Debugging und fehlgeschlagene Emails:

```sql
CREATE TABLE inbound_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL CHECK (status IN ('processed', 'failed', 'no_agency')),
  error_message TEXT,
  candidate_id UUID REFERENCES candidates(id),
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Candidate Type erweitern

```typescript
export type Candidate = {
  // ... existing fields ...
  resume_url: string | null;
  location: string | null;
  experience_summary: string | null;
  last_employer: string | null;
  indeed_job_title: string | null;
};
```

---

## 6. Supabase Storage

Bucket: `candidate-resumes`
- Public: false (private, nur über signed URLs zugreifbar)
- Pfad: `[agency_id]/[timestamp]-[sanitized-name].pdf`
- RLS: Agency sieht nur eigene, Internal sieht alle

---

## 7. Onboarding-Integration

Step 5 (Meta-Zugang) bekommt einen Zusatzblock nach den Meta-Checkboxen:

**"Indeed-Bewerbungen automatisch importieren"**
- Erklärtext: "Damit neue Indeed-Bewerbungen automatisch in deiner Cloud erscheinen, leite die Email-Benachrichtigungen weiter."
- Anleitung (3 Schritte mit Screenshots):
  1. Indeed öffnen → Konto → Benachrichtigungen
  2. Email-Weiterleitung aktivieren
  3. Adresse eingeben: `bewerber+[AGENCY-ID]@zoeppmedia.de`
- Copy-Button für die personalisierte Email-Adresse
- Checkbox: "Indeed-Weiterleitung eingerichtet"

---

## 8. Bewerber-Detail Erweiterung

Auf der Candidate-Detail-Seite (`/candidates/[id]`):
- Wenn `resume_url` vorhanden: "Lebenslauf anzeigen" Button → öffnet PDF in neuem Tab (signed URL)
- Neue Felder anzeigen: Wohnort, Erfahrung, Letzter Arbeitgeber (wenn vorhanden)
- Indeed-Stellentitel als Badge

---

## Technische Entscheidungen

- **pdf-parse** NPM-Package für PDF-Text-Extraktion (leichtgewichtig, kein Native-Code, funktioniert in Vercel Functions)
- **Claude Haiku** (`claude-haiku-4-5-20251001`) für strukturierte Daten-Extraktion aus CV-Text — schnell + günstig
- **Resend Inbound** für Email-Empfang — kostenlos im Starter-Plan
- **Supabase Storage** für PDF-Speicherung — private Bucket mit signed URLs
- **Kein HMAC auf Webhook** für MVP — Resend Inbound Webhooks haben keinen Signing-Mechanismus, Validierung über Absender-Check (from enthält "indeed")

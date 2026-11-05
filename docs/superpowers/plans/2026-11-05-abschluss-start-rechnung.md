# Abschluss → Start → Rechnung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus dem hochgeladenen, unterschriebenen Angebot entstehen Vertrag, Rechnungs-Aufgaben, Starts-Überblick, fester Onboarding-Ablauf mit zugeordneten Calendly-/Fireflies-Calls, ein vorausgefülltes After-Close und ein wöchentlicher Lern-Bericht.

**Architecture:** `finanz_vertraege` wird die einzige Vertragsquelle (Cash-Plan, Buchhaltung, Starts). Reine, getestete Funktionen in `src/lib/finanzen/*`, `src/lib/fulfillment/*`, `src/lib/gespraeche/*`. Dünne API-Routen und Tabs in `/buchhaltung`. KI nur über Claude mit strukturierter Ausgabe (`messages.parse` + `zodOutputFormat`, Modell `GEN_MODELL` aus `src/lib/fulfillment/generator.ts`). Ein KI-Ergebnis wird nie ungeprüft „aktiv“.

**Tech Stack:** Next.js 16 (App Router, siehe AGENTS.md), Supabase (Postgres, Storage, Service-Role), Vitest, Anthropic SDK, Lexware-Abgleich (`src/lib/finanzen/lexware-abgleich.ts`), Calendly-/Fireflies-Webhooks.

**Spec:** `docs/superpowers/specs/2026-11-05-abschluss-start-rechnung-design.md`

## Global Constraints

- Die Cloud **schreibt und verschickt nie Rechnungen oder Mahnungen** – nur `internal_tasks` (Boards `BUCHHALTUNG_BOARD` / `FELIX_BOARD` aus `src/lib/finanzen/aufgaben.ts`, `quelle_ref` eindeutig).
- Keine Nachricht an Kunden/Leads/Bewerber ohne `istFreigegeben(svc, key)` direkt vor dem Senden; ohne Freigabe nichts nachholen (AGENTS.md 1–2).
- Keine Preise im Kundenportal (AGENTS.md 4).
- Service-Role-Abfragen filtern auf `agency_id`; DB-Änderungen nur als Migration in `supabase/migrations/` und live eingespielt (AGENTS.md 6, 8). Kein neuer Fremdschlüssel auf `users` aus Tabellen, die auch auf `agencies` zeigen (AGENTS.md 7).
- Beträge im Vertrag **netto**; Close-Werte sind **brutto in Cent**.
- MRR = Monatsgebühr **ohne** durchlaufendes Werbebudget.
- Kunde wird nach Vertrag angelegt, **zur Cloud eingeladen erst nach dem Onboarding-Call** (nur per Knopf).
- Setup-Zahlung: Ziel vor dem Onboarding-Call, **Pflicht vor dem Kick-off**; bei „Setup verteilt auf die Raten“ keine Sperre.
- **Transkripte und Gesprächsauswertungen sind nur intern** (Kundenakte bei Zoepp): nie im Kundenportal, nie per Mail/WhatsApp an Kunden; Routen nur für `admin`/`employee`; Empfehlungen im Portal (Task 11) zeigen keine Zitate oder Inhalte aus Gesprächen.
- Fireflies muss in allen Kunden-Calls sein (Zoom); fehlt das Transkript, entsteht eine Aufgabe – nie still übergehen.
- Firmenname überall „Zoepp Consulting GmbH“ (bzw. „Zoepp Consulting“ im Fließtext), Produkt „Zoepp Cloud“ (umgestellt in Commit 292e0cc).
- Calendly-Namen: „30 Minuten Onboarding“ (`onboarding`), „30 Minuten Kick-Off“ (`kick-off`/`kickoff`), „30 Minuten Skalierungs-Call“ (`skalierung`, Event-Type `9832cc01-3837-46b3-b075-ecd117d99dc3`), „30 Minuten Monatsauswertung“ (`monatsauswertung`, `a05cfa11-8ea1-4fa6-a7dc-2f73946290ef`), „30min Kunden-Testimonial“ (`testimonial`, `e269ec1f-fba9-4784-8d26-b13bfbae7456`).
- Vor jedem Push: `npx tsc --noEmit`, `npx vitest run`; Commit-Autor `felix@zh-digitalisierung.de` mit Co-Authored-By/Claude-Session-Zeilen.

## Review Focus

- Bestehende 40+ Verträge (`zu_pruefen` gibt es bei ihnen nicht) dürfen sich in Cash-Plan-Zahlen nicht verändern → Task 1 Test „Bestandsvertrag unverändert“.
- Angebot mit Startjahr vor dem Angebotsdatum (AG0213/AG0214: „05.01.26“ in einem Angebot vom 28.10.2026) → Warnung, nie stillschweigend übernommen → Task 2.
- Doppelter Kunde (Deine VL = Lennard Argauer, gleiche E-Mail-Domain/Lexware-Kontakt) → Warnung statt zweiter Vertrag → Task 2/3.
- Laufende Kunden bekommen am ersten Tag keine roten Warnungen/Aufgaben für vergangene Etappen → Task 6 Test „Bestandskunde im Setup“.
- Calendly-Termin, der keinem Kunden zugeordnet werden kann (Stefan Berns, Alexander Großkurth) → landet in „nicht zugeordnet“, nicht beim falschen Kunden → Task 7.

---

### Task 1: Vertragsmodell erweitern (Migration + Typen + Beträge)

**Files:**
- Create: `supabase/migrations/20261106000100_vertraege_angebote.sql`
- Modify: `src/lib/finanzen/cashplan.ts` (Typ `FinanzVertrag`, `zaehltNicht`, neue Funktion), `src/lib/finanzen/vertrag-schema.ts`
- Test: `src/lib/finanzen/__tests__/cashplan.test.ts`

**Interfaces:**
- Produces: Spalten an `finanz_vertraege`: `agency_id uuid null references agencies(id) on delete set null`, `close_lead_id text`, `angebot_pdf_pfad text`, `angebot_datum date`, `werbebudget_monatlich numeric(12,2) default 0`, `werbebudget_ueber_uns boolean default false`, `setup_verteilt boolean default false`, `ansprechpartner_email text`, `pruef_hinweise jsonb default '[]'`, `bestaetigt_am timestamptz`; Status-Check um `'zu_pruefen'` und `'streitfall'` (falls fehlt) erweitert. Storage-Bucket `angebote` (privat).
- Produces: `FinanzVertrag` mit den neuen optionalen Feldern; `status` inkl. `'zu_pruefen'`.
- Produces: `rechnungsbetragImMonat(v: FinanzVertrag, monat: string): number` = `gebuehrImMonat(v, monat, true) + setupImMonat(v, monat) + (v.werbebudget_ueber_uns ? Werbebudget in Laufzeitmonaten : 0)`.
- Daten-Fix in der Migration: Bröskamp (`angebot = 'AG0216'`) → `monatlich 3000, werbebudget_monatlich 2000, werbebudget_ueber_uns true`; KROHN (`AG0215`) → `setup_verteilt true`.

- [ ] **Step 1: Tests schreiben** – `zu_pruefen` zählt nicht in `berechneCashplan`; `rechnungsbetragImMonat` für Bröskamp-Form (3000 + 2000 Werbebudget = 5000 in 2026-11, 0 in 2027-02); Bestandsvertrag ohne neue Felder liefert exakt dieselben `berechneCashplan`-Werte wie vorher (Snapshot eines Beispielvertrags 1000 €/3 Monate + 2000 Setup).
- [ ] **Step 2:** `npx vitest run src/lib/finanzen` → FAIL.
- [ ] **Step 3:** Migration schreiben und per Supabase-MCP `apply_migration` einspielen; Typen + `zaehltNicht` (`beendet | streitfall | zu_pruefen`) + `rechnungsbetragImMonat`; `vertrag-schema.ts` um die Felder (alle optional) und Status `zu_pruefen` ergänzen. Cash-Plan-Client zeigt `zu_pruefen` als Badge „Zu prüfen“.
- [ ] **Step 4:** Tests grün, `npx tsc --noEmit` grün; per SQL prüfen: Bröskamp/KROHN umgestellt, MRR-Abfrage aus der Session (Nov 26 → 48.050 abzüglich 2.000 Werbebudget) plausibel.
- [ ] **Step 5:** Commit „Verträge: Angebots-Felder, Werbebudget getrennt vom MRR, Status zu_pruefen“.

### Task 2: Angebot lesen und prüfen (rein + KI)

**Files:**
- Create: `src/lib/finanzen/angebot/schema.ts`, `src/lib/finanzen/angebot/lesen.ts`, `src/lib/finanzen/angebot/pruefen.ts`
- Test: `src/lib/finanzen/angebot/__tests__/pruefen.test.ts`

**Interfaces:**
- Produces: `AngebotSchema` (zod) / `AngebotDaten` = `{ nummer, datum, firma, anschrift, ansprechpartner, email | null, absender_firma, absender_steuernummer, start (YYYY-MM-DD), laufzeit_monate | null (30 Tage = 1), setup_netto, setup_verteilt: boolean, setup_vor_start: boolean, monatlich_netto, werbebudget_monatlich, werbebudget_ueber_uns: boolean, rechnungstag | null, verlaengerung_monatlich | null, netto_gesamt, brutto_gesamt }`.
- Produces: `leseAngebot(pdf: Buffer): Promise<AngebotDaten>` – Claude-`document`-Block (base64 PDF) + `zodOutputFormat(AngebotSchema)`, Modell `GEN_MODELL`.
- Produces: `pruefeAngebot(d: AngebotDaten, ctx: { closeBetragBrutto: number | null; bestehende: Array<{ id: string; kunde: string; ansprechpartner_email: string | null; lex_contact_id: string | null }> }): string[]` (Warnungstexte).
- Produces: `alsVertrag(d: AngebotDaten): Omit<FinanzVertrag, 'id'>` – `start` = Monatserster des Starts, `notiz` = `Start TT.MM.`, `setup_monat` = Vormonat des Starts wenn `setup_vor_start` und Start nach dem 1., sonst null; `status 'zu_pruefen'`.

- [ ] **Step 1: Tests schreiben** (Fixtures = die sieben Angebote vom 05.11. als `AngebotDaten`-Objekte, Werte aus der Session):
  - AG0220 Ederer: `alsVertrag` → `start '2027-01-01'`, `setup 2000`, `setup_monat '2026-12-01'`, `monatlich 1000`, `laufzeit 3`, `rechnungstag 5`.
  - AG0215 KROHN: `setup_verteilt true` → `setup 0`, `monatlich 1666.66`, `verlaengerung 1000`.
  - AG0216 Bröskamp: `monatlich 3000`, `werbebudget_monatlich 2000`, `werbebudget_ueber_uns true`.
  - AG0223 Habib: `laufzeit 1`, `monatlich 0`, `setup 2000`.
  - Warnung „Start liegt vor dem Angebotsdatum“ bei `datum '2026-10-28'`, `start '2026-01-05'`.
  - Warnung „Summe der Positionen ≠ Gesamtbetrag“ wenn `setup + monatlich*laufzeit + werbebudget*laufzeit(ueber_uns) ≠ netto_gesamt` (±1 €).
  - Warnung „Close-Betrag 10.550 € weicht vom Angebot 10.115 € ab“ (AG0218 Compass).
  - Warnung „Kunde existiert evtl. schon: Deine VL“ wenn E-Mail-Domain `deine-vl.de` gleich.
  - Warnung „Absender ist UG, Steuernummer prüfen“ bei `absender_firma` mit „UG“ nach 2026-11-01.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementieren. Prompt: „Nur Werte aus dem Dokument, nichts schätzen; Zeitraum ‚30 Tage‘ = 1 Monat; ‚Einrichtungsgebühr (verteilt auf 3 Monate)‘ = setup_verteilt“.
- [ ] **Step 4:** Tests grün; einmal manuell `leseAngebot` mit `~/Downloads/Angebot_AG0220-3.pdf` per Skript im Scratchpad gegen die Erwartung vergleichen (ANTHROPIC_API_KEY ist nur in Vercel – sonst nach dem Deploy über Task 3 testen).
- [ ] **Step 5:** Commit.

### Task 3: Upload „Neue Abschlüsse“ (Backoffice) + Bestätigen

**Files:**
- Create: `src/app/api/buchhaltung/angebote/route.ts` (POST multipart, GET Liste), `src/app/api/buchhaltung/angebote/[id]/route.ts` (PATCH bestätigen/korrigieren, GET signierte PDF-URL), `src/app/(internal)/buchhaltung/abschluesse-tab.tsx`
- Modify: `src/app/(internal)/buchhaltung/page.tsx` (Tab `abschluesse`), Fulfillment-Signal `vertrag_hochgeladen` (Task 6 nutzt es)

**Interfaces:**
- Consumes: `leseAngebot`, `pruefeAngebot`, `alsVertrag` (Task 2); Guard wie `src/app/api/buchhaltung/route.ts` (`guard()` = Admin oder `funktion backoffice`).
- Produces: POST `{ datei: PDF, close_lead_id?, agency_id? }` → speichert unter `angebote/<agency_id|close_lead_id|'ohne'>/<nummer>.pdf`, legt `finanz_vertraege` mit `status 'zu_pruefen'`, `pruef_hinweise`, `angebot_pdf_pfad` an; Antwort `{ id, vertrag, hinweise }`. Gleiche Angebotsnummer zweimal → 409 mit Verweis auf den bestehenden Eintrag.
- Produces: PATCH `{ bestaetigen: true, ...Korrekturen }` → `status` = `'startet'` (Start in der Zukunft) bzw. `'aktiv'`, `bestaetigt_am`; wenn `agency_id` gesetzt → `signalSafe(svc, agency_id, 'vertrag_hochgeladen')`.
- Produces: Funktion `ordneVertragZu(svc, vertragId: string, agencyId: string): Promise<void>` (für Task 9).

- [ ] **Step 1:** Route-Test mit gemocktem `leseAngebot` (Muster wie bestehende Route-Tests unter `src/app/api/**/__tests__`): POST erzeugt Zeile `zu_pruefen`; doppelte Nummer → 409; ohne Backoffice-Recht → 403.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren; Tab zeigt je Eintrag: PDF-Link, gelesene Werte als editierbare Felder, Hinweise (gelb), Knopf „Bestätigen“. Close-Lead-Suche über bestehende Close-Hilfen (`src/lib/sales/close.ts`) – Brutto-Wert der gewonnenen Opportunity für `closeBetragBrutto`.
- [ ] **Step 4:** tsc + vitest grün. **Step 5:** Commit.

### Task 4: Rechnungs-Aufgaben (Setup, Monat, fehlt) – nur Aufgaben

**Files:**
- Modify: `src/lib/finanzen/aufgaben.ts` (`planeFinanzAufgaben`, `legeFinanzAufgabenAn`)
- Test: `src/lib/finanzen/__tests__/aufgaben.test.ts`

**Interfaces:**
- Consumes: `rechnungsplan`, `rechnungsbetragImMonat` (Task 1).
- Produces: zusätzliche Aufgaben in `planeFinanzAufgaben` (nur Verträge `aktiv|startet`):
  - `finanz:setup:<vertrag_id>` – „Setup-Rechnung schreiben: <Kunde> (<Betrag>)“, Board Buchhaltung, fällig = heute wenn bestätigt (Setup vor Start), nicht bei `setup_verteilt` oder `setup 0`.
  - `finanz:monat:<vertrag_id>:<YYYY-MM>` – „Monatsrechnung zum <Tag>. schreiben: <Kunde> (<Betrag>)“, entsteht 3 Tage vor dem Rechnungstag, Betrag = `rechnungsbetragImMonat`.
  - `finanz:fehlt:<vertrag_id>:<YYYY-MM>` – „Rechnung fehlt: …“, Priorität high, wenn fällig seit ≥ 3 Tagen und `rechnungsplan(...).geschrieben === false`.
- Produces: `erledigteFinanzRefs(plan: AnstehendeRechnung[]): string[]` – Refs, deren Rechnung in Lexware steht; `legeFinanzAufgabenAn` setzt diese `internal_tasks` auf `status 'done'`, `erledigt_am`.

- [ ] **Step 1: Tests:** Ederer (Start 2027-01, Tag 5) → am 2027-01-02 Aufgabe `finanz:monat:<id>:2027-01`; am 2027-01-08 ohne Lexware-Rechnung zusätzlich `finanz:fehlt:…`; mit passender Rechnung (≥ 95 %) keine `fehlt`-Aufgabe und Ref in `erledigteFinanzRefs`. KROHN (`setup_verteilt`) → keine Setup-Aufgabe. `zu_pruefen`-Vertrag → keine Aufgaben. Bröskamp Monatsaufgabe Betrag 5.000 €.
- [ ] **Step 2–4:** FAIL → implementieren → grün. Kein Aufruf von `createInvoice` oder Mailversand (grep im Diff).
- [ ] **Step 5:** Commit.

### Task 5: Buchhaltung aus einer Quelle

**Files:**
- Modify: `src/app/api/buchhaltung/route.ts` (GET: `loadRechnungsliste` ersetzen), `src/app/(internal)/buchhaltung/page.tsx` (Tab „Rechnungen“ ohne RE-Nr.-Eingabe, Kopfzeile MRR), Create: `src/lib/finanzen/buchhaltung-monat.ts`
- Test: `src/lib/finanzen/__tests__/buchhaltung-monat.test.ts`

**Interfaces:**
- Produces: `baueBuchhaltungsMonat(vertraege: FinanzVertrag[], rechnungen: FinanzRechnung[], monat: string, heute: string): { zeilen: Array<{ kunde: string; vertragId: string; typ: 'setup'|'monat'; datum: string; netto: number; geschrieben: boolean; ueberfaellig: boolean }>; mrr: number; volumen: number; geschrieben: number; bezahlt: number; offen: number; starts: FinanzVertrag[]; endetBald: FinanzVertrag[] }`.
- Die alte Tabelle „Vertragsdaten fehlen“ (agencies.mrr …) entfällt; `agencies.vertragsstart/mrr/setup_betrag` werden nicht mehr gelesen (nicht löschen).

- [ ] **Step 1: Tests:** Monat 2026-11 mit Bröskamp/Compass/Nihat-Fixtures → Zeilen sortiert nach Datum, `mrr` ohne Werbebudget, Zeile überfällig wenn `datum < heute` und nicht geschrieben.
- [ ] **Step 2–4:** FAIL → implementieren (nutzt `rechnungsplan` + `rechnungsbetragImMonat` + `endetBald`) → grün; Seite lokal mit `npx tsc --noEmit` prüfen.
- [ ] **Step 5:** Commit.

### Task 6: Fester Onboarding-Ablauf (Katalog + Sperren + Bestandskunden)

**Files:**
- Modify: `src/lib/fulfillment/catalog.ts`, `src/lib/fulfillment/engine.ts`, Create: `src/lib/fulfillment/setup-zahlung.ts`, Migration `supabase/migrations/20261106000200_onboarding_ablauf.sql` (nur Datenpflege für Bestandskunden, siehe Step 3)
- Test: `src/lib/fulfillment/__tests__/catalog.test.ts`, `__tests__/engine.test.ts`

**Interfaces:**
- Produces: neue `AutoSignal`s `vertrag_hochgeladen`, `onboarding_gebucht`, `onboarding_transkript`, `eingeladen`, `skalierung_gebucht`, `skalierung_durchgefuehrt`, `auswertung_gebucht`, `auswertung_durchgefuehrt`, `setup_bezahlt`.
- Katalog (Reihenfolge laut Spec 5):
  - `zahlung`: `z_vertrag` (auto `vertrag_hochgeladen`), `z_rechnung_setup`, `z_zahlung_setup` (auto `setup_bezahlt`) – Phase `zahlung` ist erledigt, sobald `z_vertrag` erledigt ist; die beiden Setup-Schritte laufen parallel weiter (nicht blockierend).
  - `onboarding`: `o_onboarding_gebucht` (auto `onboarding_gebucht`), `o_onboarding_call`, `o_transkript` (auto `onboarding_transkript`), `o_eingeladen` (auto `eingeladen`), danach die bestehenden Zugangs-/Inhalts-Schritte. `o_kickoff_gebucht`/`o_kickoff` entfallen hier.
  - `setup`: bestehende Schritte + `s_kickoff_gebucht` (auto `kickoff_gebucht`), `s_kickoff` vor `s_freigabe`/`s_launch`.
  - `continuity`: `c_skalierung` (Frist 14, auto `skalierung_durchgefuehrt`), `c_auswertung` (Frist 28, auto `auswertung_durchgefuehrt`) – Frist ab `launch_datum` (bestehende Logik).
- Produces: `setupBezahlt(svc, agencyId): Promise<boolean | null>` (null = kein separates Setup / `setup_verteilt`), aus `finanz_vertraege` + `finanz_rechnungen` (`bezahlt_am`).
- Sperre: `s_kickoff` und `s_launch` können nicht auf erledigt gesetzt werden, solange `setupBezahlt === false` → Fehlermeldung „Setup noch nicht bezahlt (Pflicht vor dem Kick-off)“.

- [ ] **Step 1: Tests:** `stepsForKunde('onboarding', ['meta'])` beginnt mit `o_onboarding_gebucht`; Kick-off-Schritte stehen in `setup`; `continuity` enthält `c_skalierung` (14) und `c_auswertung` (28); Status-Änderung `s_kickoff` → erledigt mit `setupBezahlt false` wirft; mit `null` erlaubt. **Bestandskunde im Setup:** `ergaenzeFehlendeSchritte` (bestehende Funktion ab `engine.ts:372`) legt für einen Kunden in `setup` keine `o_*`-Schritte an und setzt neue Schritte vergangener Phasen nicht offen.
- [ ] **Step 2–4:** FAIL → implementieren → grün. Migration: für Kunden in `setup`/`continuity` vorhandene offene `o_kickoff*`-Schritte auf `nicht_noetig`; für Kunden in `continuity` mit `launch_datum` älter als 28 Tage `c_*` als `nicht_noetig` anlegen.
- [ ] **Step 5:** Commit.

### Task 7: Calendly- und Fireflies-Zuordnung

**Files:**
- Create: `src/lib/calendly/termin-art.ts`, Migration `supabase/migrations/20261106000300_termine_unzugeordnet.sql` (Tabelle `kunden_termine_unzugeordnet`: `id, calendly_event_uri unique, art, name, email, start_time, created_at, zugeordnet_agency_id uuid null`)
- Modify: `src/app/api/webhooks/calendly/route.ts` (`completeAppointmentTask`), `src/lib/gespraeche/kunde.ts` (Art + Signale)
- Test: `src/lib/calendly/__tests__/termin-art.test.ts`, `src/lib/gespraeche/__tests__/kunde.test.ts`

**Interfaces:**
- Produces: `terminArt(eventName: string): 'onboarding' | 'kickoff' | 'skalierung' | 'auswertung' | 'testimonial' | null` (Schlüsselwörter aus Global Constraints, Groß/Klein egal).
- Produces: `findeKundeZuTermin(svc, email: string): Promise<string | null>` – Reihenfolge: `users` (Kundenrollen) → `agencies.email` → `finanz_vertraege.ansprechpartner_email` → gleiche E-Mail-Domain bei genau einem Kunden (Freemail-Domains ausgenommen). Kein Treffer → Zeile in `kunden_termine_unzugeordnet`.
- Signale beim Buchen: onboarding → `onboarding_gebucht`, kickoff → `kickoff_gebucht`, skalierung → `skalierung_gebucht`, auswertung → `auswertung_gebucht`.
- `kunden_gespraeche.art` erweitert um `skalierung`, `auswertung`; Art zuerst per `terminArt(titel)`, sonst KI. Nach dem Speichern: onboarding → `onboarding_transkript`, skalierung → `skalierung_durchgefuehrt`, auswertung → `auswertung_durchgefuehrt` (bestehendes `transkript_hochgeladen` für kickoff/onboarding bleibt).

- **Fireflies muss in jedem dieser Calls sein** (Onboarding, Kick-off, Skalierung, Monatsauswertung, Testimonial; alle Zoom): Job `fireflies.pruefen { calendly_event_uri, agency_id }` 2 h nach Terminende → kein `kunden_gespraeche`-Eintrag dieses Kunden im Zeitfenster ±1 h → Aufgabe „Fireflies war nicht im Call: <Art> <Kunde> – Aufnahme/Transkript hochladen“ (`quelle_ref fireflies:fehlt:<event_uri>`) für den Zuständigen. Pure Funktion `firefliesFehlt(termin: { start: string; ende: string }, gespraeche: Array<{ datum: string }>): boolean`.

- [ ] **Step 1: Tests:** `firefliesFehlt` true ohne Gespräch im Fenster, false mit Gespräch 10 Min. nach Start. `terminArt('30 Minuten Kick-Off')` → kickoff; `'30 Minuten Skalierungs-Call'` → skalierung; `'30 Minuten Monatsauswertung'` → auswertung; `'60min Beratungsgespräch mit Felix Zoepp'` → null. `findeKundeZuTermin` mit `l.argauer@deine-vl.de` → Deine VL über Domain; `stefanberns@googlemail.com` → null (Freemail). Gesprächs-Art aus Titel „30 Minuten Monatsauswertung (Mark Pflug)“ → auswertung ohne KI-Aufruf.
- [ ] **Step 2–4:** FAIL → implementieren → grün.
- [ ] **Step 5:** Commit.

### Task 8: Starts-Überblick + Einladung nach dem Onboarding

**Files:**
- Create: `src/lib/finanzen/starts.ts`, `src/app/api/buchhaltung/starts/route.ts`, `src/app/(internal)/buchhaltung/starts-tab.tsx`, `src/app/api/buchhaltung/starts/[agencyId]/einladen/route.ts`
- Modify: `src/app/(internal)/buchhaltung/page.tsx` (Tab `starts`), `src/app/(internal)/buchhaltung/...` (Liste „Termine nicht zugeordnet“ mit Zuordnen-Knopf)
- Test: `src/lib/finanzen/__tests__/starts.test.ts`

**Interfaces:**
- Produces: `baueStartZeile(x: { vertrag: FinanzVertrag; schritte: Map<string, 'offen'|'erledigt'|'nicht_noetig'>; termine: Partial<Record<'onboarding'|'kickoff'|'skalierung'|'auswertung', string>>; setupBezahlt: boolean | null; launch: string | null; heute: string }): { etappen: Array<{ key: string; label: string; datum: string | null; ampel: 'gruen'|'gelb'|'rot'|'grau' }> }`.
- Ampel-Regeln (Spec 6.5/8.3): Start in ≤ 7 Tagen ohne Onboarding-Termin → rot; Onboarding-Termin vorbei und Setup unbezahlt → gelb + Aufgabe `finanz:setup-offen:<vertrag_id>`; Kick-off in ≤ 3 Tagen und Setup unbezahlt → rot; `launch + 12 Tage` ohne Skalierungs-Termin → rot; `launch + 26 Tage` ohne Auswertungs-Termin → rot.
- Einladen-Route: POST → Job `admin.einladung_senden { agency_id, email, name, role: 'agency_owner' }` (bestehender Weg, inkl. seiner Freigabe) + `signalSafe(svc, agencyId, 'eingeladen')`. Sobald `o_onboarding_call` erledigt ist, entsteht Aufgabe „Kunde zur Cloud einladen: <Kunde>“ (`quelle_ref fulfillment:einladen:<agency_id>`).
- After-Close (`src/app/api/admin/after-close/route.ts`): **kein** `invite_tokens`-Insert mehr; `inviteUrl` entfällt aus Antwort/Mail-Text.

- [ ] **Step 1: Tests:** Ampel-Fälle oben je ein Test; KROHN (`setupBezahlt null`) nie rot wegen Setup.
- [ ] **Step 2–4:** FAIL → implementieren → grün; After-Close-Test (falls vorhanden) anpassen: kein Invite-Token.
- [ ] **Step 5:** Commit.

### Task 9: After-Close-Entwurf automatisch

**Files:**
- Create: Migration `supabase/migrations/20261106000400_after_close_entwuerfe.sql` (`after_close_entwuerfe`: `id, close_lead_id text unique, vertrag_id uuid null, daten jsonb, quellen jsonb, status 'offen'|'abgeschickt', created_at, updated_at`), `src/lib/after-close/entwurf.ts`, `src/app/api/admin/after-close/entwurf/route.ts`
- Modify: `src/app/(internal)/admin/after-close/after-close-form.tsx` (lädt `?entwurf=<id>`), Auslöser in Task-3-PATCH (bestätigt) und `src/lib/sales/protokolle.ts` (Closing-Ergebnis „Abgeschlossen“)
- Test: `src/lib/after-close/__tests__/entwurf.test.ts`

**Interfaces:**
- Produces: `baueEntwurf(q: { lead: { name; contacts }; setting: Record<string, unknown> | null; angebot: AngebotDaten | null; closing: { zusagen: string[]; sonderfaelle: string[]; rolle: string | null; starter: number | null } | null; termine: Partial<Record<string, string>> }): { daten: AfterCloseBody-Felder; quellen: Record<feld, 'close'|'setting'|'angebot'|'transkript'|'calendly'> }` (rein).
- Produces: `erstelleEntwurf(svc, closeLeadId: string): Promise<string>` – lädt Lead (`ladeCloseLead`), Setting-Protokoll (`close_protokolle`), Vertrag zum Lead, Closing-Analyse aus `gespraech_analysen` am Lead (eindeutig, sonst `closing: null`); legt Aufgabe „After-Close prüfen: <Firma>“ (`quelle_ref after-close:<lead_id>`) auf Felix' Board an.
- Beim Absenden: `ordneVertragZu` (Task 3) mit der neuen `agency_id`, Entwurf `abgeschickt`.

- [ ] **Step 1: Tests:** Feld-Quellen-Vorrang (Angebot vor Setting für Beträge/Start); ohne eindeutiges Closing-Transkript bleiben `zusagen_closer`/`sonderfaelle` leer.
- [ ] **Step 2–4:** FAIL → implementieren → grün.
- [ ] **Step 5:** Commit.

### Task 10: Wöchentlicher Lern-Bericht

**Files:**
- Create: Migration `supabase/migrations/20261106000500_lern_berichte.sql` (`lern_berichte`: `id, woche date unique, inhalt jsonb, created_at`), `src/lib/gespraeche/lern-bericht.ts`, Kontrollzentrum-Karte in `src/app/(internal)/admin/kontrollzentrum/kontrollzentrum-client.tsx`
- Modify: `src/app/api/cron/daily/route.ts` (montags einmal, Muster `system_einstellungen`-Tagesschlüssel wie `legeFinanzAufgabenAn`)
- Test: `src/lib/gespraeche/__tests__/lern-bericht.test.ts`

**Interfaces:**
- Produces: `sammleLernDaten(gespraeche, umfragen, health): LernEingabe` (rein: gruppiert Risiken/Probleme/Fragen je Etappe = `kunden_gespraeche.art`, behält Zitat + Kunde + Datum).
- Produces: `LernBerichtSchema` = `{ probleme: [{ thema, etappe, kunden: string[], belege: [{ kunde, zitat, quelle }] }], upsell: [{ kunde, signal, beleg }], rueckfragen: [{ frage, anzahl, masterclass_vorschlag }], vorher_loesen: [{ problem, stelle: 'onboarding_frage'|'checkliste'|'kickoff'|'masterclass', vorschlag }] }`; KI darf nur Belege aus der Eingabe zitieren (Test: Ausgabe mit unbekanntem Zitat wird verworfen via `nurBelegteEintraege(bericht, eingabe)`).
- Ausgabe: Zeile in `lern_berichte`, kurze Slack-Zusammenfassung intern (bestehender Slack-Helfer aus `src/lib/slack`), Aufgaben für Felix je `vorher_loesen`/`rueckfragen` (`quelle_ref lernen:<woche>:<n>`); Upsell-Einträge als Aufgabe beim Zuständigen. Nichts an Kunden; Masterclass-Vorschläge nur als Entwurfstext in der Aufgabe.

- [ ] **Step 1: Tests:** `sammleLernDaten` gruppiert zwei Kunden mit gleichem Risiko unter einem Thema; `nurBelegteEintraege` entfernt Eintrag mit erfundenem Zitat.
- [ ] **Step 2–4:** FAIL → implementieren → grün.
- [ ] **Step 5:** Commit.

### Task 11: Testimonial und Hiring Lisa bei guten Ergebnissen vorschlagen

**Files:**
- Modify: `src/lib/empfehlungen/regeln.ts` (neue Empfehlungen), `src/lib/empfehlungen/kandidaten.ts` (Kriterium wiederverwenden), Portal-Empfehlungen-Seite `src/app/(portal)/empfehlungen/empfehlungen-client.tsx`
- Test: `src/lib/empfehlungen/__tests__/regeln.test.ts`

**Interfaces:**
- Consumes: bestehendes Kandidaten-Kriterium in `kandidaten.ts` (≥ 1 Einstellung oder ≥ 10 Bewerber in 30 Tagen) + Zufriedenheit ≥ 8/10 aus der letzten Umfrage; `kunden_gespraeche.stimmung` nicht „negativ“.
- Produces: Empfehlung `testimonial` (art `tipp`, Titel „Erfolg teilen: 30 Minuten Kunden-Testimonial“, Link = Calendly „30min Kunden-Testimonial“ `https://calendly.com/zoepp-media/30-minuten-kunden-testimonial`) – nur wenn Kriterium erfüllt und kein Testimonial-Termin/-Gespräch in den letzten 90 Tagen; dazu interne Aufgabe „Testimonial anfragen: <Kunde>“ (`quelle_ref testimonial:<agency_id>:<YYYY-MM>`) für den Zuständigen. Empfehlung `hiring_lisa` (art `leistung`, ohne Preis, Knopf = bestehende Anfrage `POST /api/lisa`) bei Speed-to-Lead > 1 h oder Erreichbarkeit < 50 % und Lisa nicht aktiv. Gebuchter Testimonial-Termin → bestehendes Signal `testimonial_gebucht` (Task 7 `terminArt` = testimonial).
- Keine Nachricht an den Kunden: nur Anzeige im Portal + interne Aufgabe.

- [ ] **Step 1: Tests:** Kunde mit 2 Einstellungen + Zufriedenheit 9 → `testimonial` enthalten; Zufriedenheit 6 → nicht; Testimonial-Gespräch vor 30 Tagen → nicht. Lisa-Empfehlung bei Speed-to-Lead 4 h, nicht bei aktiver Lisa.
- [ ] **Step 2–4:** FAIL → implementieren → grün.
- [ ] **Step 5:** Commit, dann Gesamt-Check: `npx tsc --noEmit`, `npx vitest run`, `npx next build` (Prerender-Fehler `/login` wegen fehlender lokaler Supabase-Env ist bekannt und kein Abbruchgrund), Push auf `main`, Deployment `READY` prüfen.

# Abschluss → Start → Rechnung (Design)

Stand 2026-11-05 · Auftraggeber: Felix Zoepp · Zoepp Media Cloud (`~/zoeppmedia-cloud`)

## 1. Warum

Heute weiß Felix nicht verlässlich, **wann welche Rechnung zu schreiben ist, wer wann startet und wie hoch der MRR wird**. Am 05.11. mussten sechs angenommene Angebote von Hand in den Cash-Plan übertragen werden. Dabei kamen Fehler ans Licht: Ein Betrag in Close war falsch (10.550 € statt 10.115 €), im Angebot stand das falsche Startjahr (2026 statt 2027), ein Kunde stand doppelt drin (Lennard Argauer = Deine VL), und mehrere Starts hatten sich verschoben.

Die Vertragsdaten liegen heute an **drei Stellen, die nichts voneinander wissen**:

| Ort | Daten | Problem |
|---|---|---|
| Cash-Plan (`finanz_vertraege`, `/admin/finanzen/cashplan`) | Verträge, abgeglichen mit Lexware | nur von Hand gepflegt, nur Admin |
| Buchhaltung (`/buchhaltung`) | alte Felder an `agencies` (vertragsstart, mrr, setup_betrag), RE-Nummer wird von Hand eingetragen | kennt die neuen Verträge nicht |
| After-Close (`/admin/after-close`) | eigenes Formular → `billing_plans`, `vertraege` | wird weder vom Cash-Plan noch von der Buchhaltung gelesen |

Ziel: **eine Quelle**, aus dem unterschriebenen Angebot befüllt. Daraus folgen die Aufgaben für Rechnungen, der Fahrplan für den Start und der MRR, ohne doppeltes Eintippen.

## 2. Ziele

1. Das unterschriebene Angebot (PDF aus Adobe Acrobat Sign) wird **pro Kunde im Backoffice hochgeladen und gespeichert**. Die Cloud liest es aus und legt daraus einen Vertrag mit dem Status „zu prüfen“ an.
2. **After-Close füllt sich selbst**, aus Angebot, Close-Lead, Setting-Protokoll, Closing-Transkript (Fireflies) und Calendly. Felix prüft nur und schickt ab.
3. **Buchhaltung** zeigt pro Monat, aus derselben Quelle:
   - fällige Rechnungen (Setup und Monatsrate)
   - was schon geschrieben ist (automatisch aus Lexware)
   - was vergessen wurde
   - Starts
   - bald endende Laufzeiten
   - MRR
4. **Fester Onboarding-Ablauf** für jeden Kunden (siehe 5). Termine aus Calendly werden automatisch dem Kunden zugeordnet.
5. **Überblick „Starts“:** eine Zeile pro Kunde mit
   - Abschluss
   - Setup-Rechnung geschrieben / bezahlt
   - Onboarding
   - Zugänge
   - Kampagne gebaut
   - Kick-off / Freigabe
   - Start
   - Call nach 14 Tagen
   - Call nach 28 Tagen
   - Laufzeitende
6. **Lernen aus den Calls:** Transkripte und Zufriedenheit zusammen auswerten. Daraus entstehen Upsell-Chancen, Baustellen, Masterclass-Themen aus häufigen Rückfragen und Probleme, die künftig vorher gelöst werden (6.6).

## 3. Nicht-Ziele

- Keine Online-Buchung und keine Zahlung durch Kunden. Kein eigenes Signatur-Tool, Adobe bleibt.
- Kein Ersatz für Lexware.
- Der Anrufmodus (Ergebnis „Unqualifiziert“, Erreichbarkeit nach Uhrzeit) ist ein **eigenes, kleines Vorhaben**.
- Hiring Lisa ist schon angebunden (Commit 1f33932) und gehört nicht hierher.

## 4. Anti-Ziele (Fehlschlag, auch wenn es technisch läuft)

- **Die Cloud schreibt oder verschickt eine Rechnung oder Mahnung.** Verboten: Rechnungen und Mahnstufen macht immer ein Mensch. Die Cloud legt **nur Aufgaben** an (Regel von Felix vom 05.11.).
- **Irgendeine Nachricht an Kunden oder Leads ohne Freigabe** (AGENTS.md, Regel 1 und 2). Fixes und Deploys lösen keine alten Nachrichten aus.
- **Preise öffentlich oder im Kundenportal** (Regel 4).
- **Eine zweite Wahrheit bleibt bestehen**, zum Beispiel die Buchhaltung rechnet weiter mit `agencies.mrr`.
- **Ein KI-gelesener Wert wird ungeprüft zur Grundlage für Aufgaben.** Erst nach Felix' Bestätigung wird ein Vertrag „aktiv“.

## 5. Onboarding-Ablauf (so von Felix festgelegt, dauerhaft)

| # | Schritt | Wer | Erkennung |
|---|---|---|---|
| 0 | **Unterschriebenes Angebot hochgeladen** → Vertrag geprüft | Backoffice/Felix | Upload + Bestätigung |
| 0b | Setup-Rechnung geschrieben → bezahlt (**Ziel:** vor dem Onboarding, **Pflicht:** vor dem Kick-off) | Backoffice | Lexware-Abgleich (automatisch) |
| 1 | **Onboarding-Call** (Calendly „30 Minuten Onboarding“): alle Infos sammeln (Funnel, Branding, Provisionsstruktur usw.), **Transkript hochladen** → daraus wird alles automatisch erstellt | Zoepp (CSM) | Calendly-Termin + Transkript-Upload |
| 1b | **Kunde zur Cloud einladen**: erst **nach dem Onboarding-Call**, weil dann die Arbeit beginnt. Angelegt wird er in der Cloud schon nach der Vertragsunterschrift (After-Close), aber ohne Einladung | Zoepp (CSM) | Einladung verschickt bzw. erster Login |
| 2 | **Kunde gibt in der Cloud die Zugänge** (Meta, Indeed, WhatsApp, Kalender …) | Kunde | bestehende Auto-Signale |
| 3 | **Kampagnen bauen, alles reinladen** (Generator: Ads, Video-Skripte, Funnel-Texte, Indeed) | Zoepp (Media Buyer) | bestehende Setup-Schritte |
| 4 | **Kick-off zum Start** (Calendly „30 Minuten Kick-Off“): **Kunde gibt dort frei**, Kampagne geht live | Kunde + Zoepp | Calendly-Termin + Freigabe-Signal + `launch_datum` |
| 5 | **Call 14 Tage nach Kampagnenstart** (Upsell) | Zoepp | Calendly-Termin gebucht |
| 6 | **Call 28 Tage nach Kampagnenstart** | Zoepp | Calendly-Termin gebucht |

**Was sich gegenüber heute ändert** (`src/lib/fulfillment/catalog.ts`):
- Der Kick-off steht heute am Anfang des Onboardings (`o_kickoff_gebucht`, `o_kickoff`). Er wandert ans Ende des Setups und wird zum Termin für Freigabe und Start, zusammen mit `s_freigabe`, `s_starttermin` und `s_launch`.
- Am Anfang des Onboardings stehen dafür neue Schritte: „Onboarding-Call gebucht“ und „Onboarding-Call durchgeführt“.
- Das Transkript (`o_transkript`) gehört zum Onboarding-Call.
- Die laufende Betreuung (Continuity) bekommt zwei feste Schritte, „Call nach 14 Tagen (Upsell)“ und „Call nach 28 Tagen“. Die Frist zählt ab `launch_datum`, das funktioniert in der Continuity schon so. Jeder Schritt hakt sich selbst ab, sobald ein passender Calendly-Termin gebucht ist.
- Für Kunden, die schon unterwegs sind, gilt dasselbe wie heute bei neuen Schritten (`ergaenzeFehlendeSchritte` o. ä. in `engine.ts`): Fehlende Schritte werden ergänzt, Phasen werden nicht zurückgesetzt.

Bestehende Bausteine, auf denen das aufbaut:
- `processTranscript`: extrahiert Antworten nach dem Fragenkatalog in `transcript_answers` mit `ziel_feld` und erzeugt eine Prüfaufgabe für den CSM.
- `ladeBriefing`: liest `onboarding_submissions` und `client_profiles`.
- `generator.ts`: erzeugt aus dem Briefing Ads, Videos, Funnel-Texte und die Indeed-Anzeige.

**Zu prüfen:** Gehen alle Themen aus dem Onboarding-Call (Funnel, Branding, **Provisionsstruktur**) über den Fragenkatalog wirklich ins Briefing? Fehlende Fragen kommen in `transcript_questions` dazu.

## 6. Bausteine

### 6.1 Unterschriebenes Angebot hochladen

- Die PDF wird beim Kunden (Backoffice-Bereich der Kundenakte) hochgeladen und im Storage gespeichert, pro Kunde und mit Angebotsnummer.
- Die KI liest daraus (Claude, strukturierte Ausgabe):
  - Angebotsnummer, Datum, Firma, Anschrift, Ansprechpartner
  - Positionen: Setup netto, Monatsrate netto × Laufzeit, Werbebudget (durchlaufend oder vom Kunden gezahlt)
  - Start, Laufzeit, Rechnungstag
  - Fälligkeit des Setups („vor Start“ oder „verteilt auf die Raten“)
  - Folgegebühr nach Laufzeitende
  - Firmierung und Steuernummer des Absenders (Hinweis, wenn UG und GmbH gemischt sind)
- **Plausibilitätsprüfung**, vor der Bestätigung als Warnung angezeigt:
  - Startdatum liegt vor dem Angebotsdatum (z. B. Jahr 2026 statt 2027)
  - Summe der Positionen weicht vom Gesamtbetrag ab
  - Betrag in Close weicht vom Angebot ab
  - Kunde existiert schon (Name, Lexware-Kontakt oder E-Mail-Domain, Beispiel Deine VL = Lennard Argauer)
- Ergebnis: Eintrag in `finanz_vertraege` mit dem neuen Status **„zu prüfen“**. Felix bestätigt ihn oder korrigiert und bestätigt, dann wird er „aktiv“ bzw. „startet“.

Wie der Cash-Plan die Felder heute nutzt (`start` = erster abgerechneter Monat, `setup_monat`, `laufzeit_monate`, `verlaengerung_monatlich`, `rechnungstag`, `notiz` mit „Start TT.MM.“), bleibt erhalten.

### 6.2 After-Close automatisch

- **Auslöser:** Der Close-Deal geht auf „Close“ (gewonnen), oder ein Angebot wird hochgeladen.
- Daraus entsteht ein **After-Close-Entwurf**, vorausgefüllt aus den Quellen in der Tabelle. Felix bekommt die Aufgabe „After-Close prüfen“.

| Feld | Quelle |
|---|---|
| Firma, Ansprechpartner, Telefon, E-Mail | Close-Lead |
| Branche, Produkt, Region, Budget, möglicher Start | Setting-Protokoll (Close Custom Activity) |
| Setup, Monatsrate, Laufzeit, Start, Werbebudget | Angebot (6.1) |
| Anschrift, Rechnungsadresse | Angebot bzw. Lexware-Kontakt |
| Zusagen, Sonderfälle, gesuchte Rolle, Anzahl Starter | KI aus dem Fireflies-Transkript des Closings |
| Onboarding- und Kick-off-Termin | Calendly über die E-Mail |

- Beim Absenden wird der Kunde **angelegt** (Agentur, Fulfillment, Vertragslink), aber **nicht zur Cloud eingeladen**: weder Einladungs-Token noch Mail. Die Einladung ist der eigene Schritt 1b nach dem Onboarding-Call (Felix, 05.11.). Sie entsteht als Aufgabe „Kunde zur Cloud einladen“, sobald der Onboarding-Call durchgeführt ist, und geht nur per Knopf raus, mit dem bestehenden Einladungsweg und dessen Freigabe. Zusätzlich wird der Vertrag aus 6.1 mit der Agentur verknüpft (`finanz_vertraege.agency_id`, neu).
- Die Willkommens-Mail bleibt an die Freigabe `finanz_vertrag_mails` gebunden.

### 6.3 Rechnungs- und Mahnaufgaben (nur Aufgaben)

- Pro aktivem Vertrag: Aufgabe „Setup-Rechnung schreiben“, fällig vor dem Start. Vor jeder Monatsrate: „Monatsrechnung zum X. schreiben“.
- Taucht die Rechnung im Lexware-Abgleich auf (gleicher Kontakt, Monat, Betrag, wie heute schon in `rechnungsCheck`), **erledigt sich die Aufgabe von selbst**.
- „Rechnung fehlt“: fällig seit X Tagen und nicht in Lexware. Daraus wird eine dringende Aufgabe auf dem Board Buchhaltung.
- Mahnwesen bleibt wie heute: Aufgaben je Stufe, Versand nur von Hand (`finanz_mahn_mail` ist aus).
- Ausbau von `src/lib/finanzen/aufgaben.ts` (Boards „Buchhaltung (Petra)“ und „Felix“, `quelle_ref` eindeutig).

### 6.4 Buchhaltung = eine Quelle

- `/buchhaltung` liest Rechnungsplan, Starts, Laufzeitenden und MRR aus `finanz_vertraege` und dem Lexware-Abgleich, mit derselben Logik wie der Cash-Plan (`rechnungsplan`, `rechnungsCheck`).
- Die RE-Nummer wird nicht mehr von Hand eingetragen.
- Die alten Felder (`agencies.vertragsstart`, `mrr`, `setup_betrag`) und `billing_plans` werden nicht mehr als Quelle benutzt. Sie werden erst gelöscht, wenn nichts mehr sie liest.
- Sicht fürs Backoffice ohne Admin-Rechte. Die Funktion `buchhaltung` gibt es schon.

### 6.5 Überblick „Starts“ und Calendly-Abgleich

- Eine Zeile pro Kunde mit den Schritten aus Abschnitt 5, jeweils mit Datum und Status.
- **Rot**, wenn etwas fehlt, zum Beispiel:
  - Start in 7 Tagen, aber kein Onboarding gebucht
  - Setup-Rechnung nicht bezahlt
  - Call nach 14 Tagen nicht gebucht
- **Calendly-Zuordnung:** Die E-Mail der Buchenden wird verglichen mit Nutzern der Agentur, dem Close-Lead, dem Ansprechpartner aus dem Vertrag oder der Domain. Termine ohne Treffer landen in der Liste „nicht zugeordnet“ zum manuellen Zuordnen. Beispiele vom 05.11.: Stefan Berns, Alexander Großkurth (pearlcap.de).
- Der Calendly-Webhook (`src/app/api/webhooks/calendly/route.ts`) erkennt Onboarding und Kick-off schon heute am Namen des Termins. Dazu kommen „14 Tage“ und „28 Tage“, neue Calendly-Terminarten oder ein Namensschema, das der Builder festlegt.

### 6.6 Lernen aus Kundengesprächen und Zufriedenheit (Felix, 05.11.)

Alle Kunden-Calls (Onboarding, Kick-off, Skalierungs-Call, Monatsauswertung, Service) werden transkribiert (Fireflies, landet in `kunden_gespraeche`) und **zusammen mit den Zufriedenheitsumfragen** (`src/lib/surveys`) und dem Health-Score (`kunden_health`) ausgewertet:

- **Je Kunde:** Probleme und Risiken, offene Zusagen, Stimmung im Verlauf. Daraus Upsell-Chancen (z. B. „will mehr Starter“, „Innendienst überlastet“ → Hiring Lisa) und Baustellen. Beides sind Aufgaben für den Zuständigen, keine Nachricht an den Kunden.
- **Über alle Kunden, als Bericht:**
  - **Häufige Probleme / Baustellen:** Was taucht bei mehreren Kunden auf, in welcher Etappe (Onboarding, Setup, Start, Tag 14, Tag 28)?
  - **Upsell-Liste:** welche Kunden, welches Signal, aus welchem Call
  - **Häufige Rückfragen:** Vorschläge für neue oder bessere **Masterclass**-Lektionen (`src/lib/masterclass`), als Entwurf. Felix gibt frei, nichts wird automatisch veröffentlicht.
  - **Vorher lösen:** Für jedes wiederkehrende Problem ein Vorschlag, an welcher Stelle im Ablauf (Abschnitt 5) es künftig vorab gelöst wird, zum Beispiel:
    - zusätzliche Frage im Onboarding-Call bzw. im Fragenkatalog
    - neuer Schritt in der Checkliste
    - Hinweis im Kick-off
    - Masterclass-Lektion vor dem Start

  Die Vorschläge landen als Aufgaben bei Felix. Den Ablauf ändert nur er.
- *Entscheidung von Claude (Felix prüft):* Der Bericht kommt **wöchentlich am Montag** ins Kontrollzentrum, mit einer kurzen internen Zusammenfassung in Slack (kein Kunde sieht ihn). Er arbeitet nur mit dem, was in Transkripten oder Umfragen steht, und zitiert die Stelle als Beleg.

## 7. Rahmenbedingungen

- Regeln aus `AGENTS.md`/`CLAUDE.md` gelten:
  - Freigaben
  - Mandantentrennung
  - DB-Änderungen nur als Migration
  - keine Secrets im Code
  - vor jedem Push tsc, vitest und bei Bedarf build
  - Commit-Autor `felix@zh-digitalisierung.de`
- **Beträge** im Cash-Plan sind netto. Beträge in Close sind brutto und stehen in Cent.
- Seit 11/2026 schreibt die **Zoepp Consulting GmbH** die Angebote, sie ist aus der Zoepp Media UG entstanden (Umwandlung, ein Lexware-Konto).
- Bestehende Verträge im Cash-Plan (Stand 05.11.: 40 aktive) bleiben gültig. Neue Felder dürfen sie nicht verändern.

## 8. Entscheidungen nach der Builder-Prüfung

**Von Felix:**
- Calendly-Namen für die festen Calls (8.1), ein Lexware-Konto (8.2), Setup-Zahlung: Ziel vor dem Onboarding, Pflicht vor dem Kick-off (8.3).

**Als Entscheidung von Claude markiert (Felix prüft beim Lesen):**
- *Upload vor dem Kunden:* Das Angebot wird in der Backoffice-Liste **„Neue Abschlüsse“** hochgeladen, verknüpft mit dem Close-Lead. Der Vertrag entsteht zuerst ohne `agency_id`. Beim Absenden des After-Close wird er mit dem neuen Kunden verknüpft. Gibt es den Kunden schon (Upsell, Verlängerung), wird direkt in seiner Akte hochgeladen.
- *Werbebudget:* Neues Feld `werbebudget_monatlich` mit der Kennzeichnung „über unsere Rechnung“ (z. B. Bröskamp, über die Zoepp-Kreditkarte) oder „zahlt der Kunde selbst“. Nur die erste Variante zählt in Rechnungsplan und Abgleich, **nicht in den MRR** (MRR ohne durchlaufendes Werbebudget).
- *Setup verteilt auf die Raten* (z. B. KROHN): Es gibt keine eigene Setup-Rechnung, die Monatsrate enthält das Setup. Dann gibt es auch keine Aufgabe „Setup-Rechnung“, und „Setup nicht bezahlt“ gilt nicht.
- *Bestehende Verträge und Kunden:* Die `agency_id` wird automatisch vorgeschlagen (Name, Lexware-Kontakt, E-Mail-Domain) und in einer Zuordnungsliste bestätigt. Laufende Kunden bekommen neue Schritte nur für **künftige** Etappen. Schon vergangene Schritte (z. B. der Onboarding-Call bei Kunden im Setup) stehen auf „nicht nötig“. Am ersten Tag gibt es keine roten Warnungen und keine Aufgaben für Vergangenes.
- *Auslöser „gewonnen“:* Upload des Angebots oder Protokoll „Abgeschlossen“ (gibt es schon über `sales.protokoll`). Der Builder prüft, ob der Close-Webhook auch Statuswechsel von Opportunities liefert. Wenn nicht, gibt es einen Abgleich im Minuten-Takt.
- *Closing-Transkript:* Es wird über `gespraech_analysen` am Close-Lead gefunden (Fireflies ordnet Beratungsgespräche schon heute dem Lead zu). Ohne eindeutigen Treffer bleiben die Felder im Entwurf leer, es wird nichts geraten.

### 8.1 Namen der Calendly-Termine (für die Zuordnung)

Die Cloud erkennt die Art des Termins am **Namen der Calendly-Terminart**. Sie sucht dabei nach dem Schlüsselwort. Der Kunde sieht den Namen, deshalb kommt nie „Upsell“ darin vor.

| Etappe | Calendly-Name | Schlüsselwort | Art im Kundengespräch |
|---|---|---|---|
| Onboarding | 30 Minuten Onboarding | `onboarding` | onboarding |
| Kick-off / Start | 30 Minuten Kick-Off | `kick-off` / `kickoff` | kickoff |
| Tag 14 (Upsell) | **30 Minuten Skalierungs-Call** | `skalierung` | skalierung (neu) |
| Tag 28 | **30 Minuten Monatsauswertung** | `monatsauswertung` | auswertung (neu) |

Die Fireflies-Transkripte landen schon heute pro Kunde in `kunden_gespraeche` (`src/lib/gespraeche/kunde.ts`, Zuordnung über die Teilnehmer-E-Mail bzw. den Namen im Titel). Neu: Die Art wird **zuerst am Titel** (Schlüsselwort) bestimmt und erst dann von der KI. Die Arten „skalierung“ und „auswertung“ kommen dazu. Sie haken die Schritte „Call nach 14/28 Tagen durchgeführt“ ab. Der Calendly-Webhook unterscheidet künftig zwischen Onboarding und Kick-off. Heute setzen beide dasselbe Signal `kickoff_gebucht`.

Ergänzungen von Felix (05.11.): **Fireflies muss in jedem Kunden-Call dabei sein.** Fehlt das Transkript, entsteht eine Aufgabe. **Kunden-Testimonial** („30min Kunden-Testimonial“) wird bei guten Ergebnissen in der Cloud vorgeschlagen: als Empfehlung im Portal mit Buchungslink und als interne Aufgabe, ohne Nachricht. **Firmenname überall Zoepp Consulting GmbH.**

### 8.2 Lexware-Konto (Felix)
Die UG wurde **in die GmbH umgewandelt**, und es gibt **ein einziges Lexware-Konto**. Der bestehende Abgleich (ein `LEXOFFICE_API_KEY`) sieht also alle Rechnungen. Ein zweiter Zugang ist nicht nötig. Ein Vertrag braucht keine Kennung, zu welcher Firma er gehört. Die Firmierung ist nur ein Hinweis auf dem Angebot.

### 8.3 Setup-Zahlung (Felix)
- **Ziel:** Das Setup ist **vor dem Onboarding-Call** bezahlt.
- **Pflicht:** Das Setup ist **vor dem Kick-off** bezahlt.
- Daraus folgt:
  - Die Phase `zahlung` blockiert das Onboarding **nicht** mehr.
  - Ist zum Onboarding-Termin noch nicht bezahlt, wird der Punkt im Starts-Überblick gelb, und das Backoffice bekommt eine Aufgabe.
  - Der Kick-off- bzw. Start-Schritt bleibt **gesperrt**, bis die Zahlung im Lexware-Abgleich steht. Im Starts-Überblick wird es rot, wenn der Kick-off in 3 Tagen ist und noch nicht bezahlt wurde.
  - Ist das Setup auf die Raten verteilt, gibt es diese Sperre nicht.

## 9. Was dem Builder überlassen ist

- Datenmodell im Detail: neuer Status „zu prüfen“, `agency_id`/`close_lead_id`/`angebot_pdf_pfad` an `finanz_vertraege` oder eine eigene Tabelle `angebote`.
- Form der KI-Ausgabe und Wortlaut der Warnungen.
- Wie die Seite „Starts“ aussieht und wo sie liegt (eigene Seite oder Tab im Cash-Plan bzw. in der Buchhaltung).
- Reihenfolge des Baus. Vorschlag: 6.1 → 6.3 → 6.4 → 5 → 6.5 → 6.2 → 6.6.

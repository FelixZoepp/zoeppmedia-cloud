# Aufgaben-Boards + Video-Freigabe (Plan, 2026-10-09)

Auftrag (Felix, Nacht 08./09.10.): über Nacht planen + bauen, morgens reviewen. Danach Review durch Codex + Claude, Funde umsetzen.

## 1. Aufgaben-Boards (wie Monday)

**Ziel:** Jeder Mitarbeiter hat ein eigenes Board, dazu Team-Boards (z. B. „Kundensupport“). Aufgaben einmalig oder wiederkehrend
(täglich / wöchentlich / monatlich). Felix legt Aufgaben per Sprachnachricht an – in der Cloud (Mikrofon) oder per WhatsApp an die
Zoepp-Nummer –, die KI verteilt sie auf die richtigen Boards, der Mitarbeiter bekommt sofort Push + Glocke („Neue Aufgabe auf deinem Board“).

**Daten**
- `aufgaben_boards` (persönlich: `besitzer_id`; Team-Board: `besitzer_id` leer)
- `internal_tasks` erweitert: `board_id`, `serie_id`, `quelle` (manuell/sprachnachricht/whatsapp/serie), `position`, `erledigt_am`
- `aufgaben_serien`: Rhythmus, Wochentag/Monatstag, nur Werktage, `naechste_am` – der Minuten-Tick legt fällige Aufgaben an (dedupe je Serie + Tag)
- `aufgaben_sprachnachrichten`: Protokoll (Transkript, erkannte Aufgaben, Quelle)

**Bausteine**
- `src/lib/aufgaben/serien.ts` – nächste Fälligkeit (rein, getestet) + täglicher Lauf
- `src/lib/aufgaben/diktat.ts` – Transkript → Aufgaben (Claude, strukturierte Ausgabe, Teamliste als Kontext)
- `src/lib/aufgaben/benachrichtigen.ts` – Push/Glocke an den Zuständigen
- API `/api/boards` (Boards + Aufgaben), `/api/boards/aufgaben/[id]`, `/api/boards/serien`, `/api/boards/sprachnachricht`
- Seite `/boards` (Board-Liste links, Spalten Offen / In Arbeit / Prüfung / Erledigt mit Drag & Drop, Liste „Wiederkehrend“, Mikrofon-Knopf mit Vorschau vor dem Anlegen)
- WhatsApp: Sprachnachricht eines internen Nutzers (Nummer in `users.phone`) an die Zoepp-Nummer → Aufgaben werden direkt angelegt, Antwort mit Zusammenfassung
- Sidebar: „Boards“ für alle internen Nutzer; Board-Aufgaben erscheinen weiter in „Meine Aufgaben“

## 2. Video-Freigabe (wie Frame.io)

**Ziel:** Nils lädt Ads-, Website- und Reel-Videos hoch, die KI prüft Texte im Video auf Rechtschreibung, Felix gibt zeitgenaues Feedback
im Player (anhalten → Kommentar bei 0:12), Nils lädt die überarbeitete Version hoch – bis zur Freigabe. Nichts mehr in WhatsApp verstreut.

**Daten**
- `videos` (Titel, Kunde, Art, Status `in_pruefung` / `aenderungen` / `freigegeben`, Bearbeiter, Prüfer, aktuelle Version)
- `video_versionen` (Datei im privaten Bucket `videos`, Dauer, KI-Status + KI-Ergebnis)
- `video_kommentare` (Zeitpunkt, Text, Autor, erledigt, KI-Hinweis ja/nein)

**Bausteine**
- Upload direkt in Supabase Storage (signierte Upload-URL), Limit wie beim Ads-Upload (Plan-Limit beachten)
- KI-Rechtschreibprüfung: Browser zieht Standbilder (alle ~1,5 s, max. 40), Claude liest sichtbaren Text und meldet Fehler mit Zeitpunkt → erscheinen als KI-Kommentare auf der Zeitleiste
- Seite `/videos` (Tabs: Zu prüfen / Änderungen nötig / Freigegeben), Detailseite mit Player, Zeitleisten-Markern, Kommentarliste, Versionen, Freigeben / Änderungen anfordern
- Benachrichtigungen: neue Version → Prüfer; Änderungen angefordert / freigegeben → Bearbeiter; täglich 17 Uhr Sammelhinweis an Prüfer, wenn Videos warten

## Später
- WhatsApp-Bot zur Vorqualifizierung für Recruiting-Kunden (separat)

-- Template database: reusable content templates + branch profiles for D2D recruiting

-- 1. content_templates table
CREATE TABLE IF NOT EXISTS content_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  branch TEXT CHECK (branch IN ('solar', 'glasfaser', 'strom_gas', 'telko', 'versicherung', 'all')),
  content_type TEXT NOT NULL CHECK (content_type IN (
    'ad_winkel_1', 'ad_winkel_2', 'ad_winkel_3',
    'funnel', 'phone_script', 'vg_leitfaden', 'follow_up',
    'absage_telefon', 'absage_vg', 'absage_schriftlich',
    'indeed', 'generator_rules'
  )),
  title TEXT NOT NULL,
  template_text TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(template_key, branch)
);

ALTER TABLE content_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can manage templates" ON content_templates FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

-- 2. branch_profiles table
CREATE TABLE IF NOT EXISTS branch_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch TEXT NOT NULL UNIQUE CHECK (branch IN ('solar', 'glasfaser', 'strom_gas', 'telko', 'versicherung')),
  default_values JSONB NOT NULL DEFAULT '{}',
  strongest_angle TEXT,
  target_audience TEXT,
  common_rejection TEXT,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE branch_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can manage branch_profiles" ON branch_profiles FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

-- ============================================================
-- SEED: Generator Rules
-- ============================================================
INSERT INTO content_templates (template_key, branch, content_type, title, template_text, sort_order) VALUES
('generator_rules_main', 'all', 'generator_rules', 'Generator-Regeln (Haupt)', E'HARTE REGELN FÜR ALLE GENERIERTEN INHALTE:

1. TONALITÄT: Immer {{tone}}-Ansprache. Durchgehend. Kein Wechsel.
2. VERDIENSTANGABEN: Nur den Bereich {{monthly_earning_from}}–{{monthly_earning_to}} EUR/Monat nennen. Niemals "bis zu" ohne Untergrenze. Niemals unrealistische Zahlen.
3. QUEREINSTEIGER: {{#wenn experience_needed=false}}Aktiv betonen dass KEINE Erfahrung nötig ist. "Quereinsteiger willkommen" in jeder Anzeige.{{/wenn}}{{#wenn experience_needed=true}}Vertriebserfahrung als Anforderung klar benennen, aber nicht abschreckend formulieren.{{/wenn}}
4. AUFGABENTYP: {{#wenn task_type=leads_only}}NIEMALS "Verkauf" oder "Abschluss" schreiben. Es geht NUR um Leads/Termine erfassen. Das ist der USP.{{/wenn}}{{#wenn task_type=contract_close}}Vertragsabschluss klar benennen — das zieht Vertriebler an die abschließen wollen.{{/wenn}}
5. KUNDENNAME: {{#wenn client_nameable=true}}Den Auftraggeber "{{client_name}}" namentlich nennen — das schafft Vertrauen.{{/wenn}}{{#wenn client_nameable=false}}Den Auftraggeber NIEMALS namentlich nennen. Stattdessen "namhafter Auftraggeber" oder "führendes Unternehmen".{{/wenn}}
6. EMOJIS: In Anzeigen und Funnels erlaubt. In Skripten und Leitfäden KEINE Emojis.
7. REGION: Immer {{regions}} als Einsatzgebiet nennen. {{#wenn radius_km}}Radius: {{radius_km}} km.{{/wenn}}
8. FÜHRERSCHEIN: {{#wenn drivers_license_needed=true}}Führerschein als Voraussetzung klar benennen.{{/wenn}}{{#wenn drivers_license_needed=false}}Führerschein NICHT als Muss-Kriterium nennen.{{/wenn}}
9. STARTDATUM: {{start_date}} als frühesten Start nennen.
10. KEINE FLOSKELN: Kein "dynamisches Team", kein "flache Hierarchien", kein "attraktives Gehalt". Stattdessen konkrete Zahlen und Fakten.', 0);

-- ============================================================
-- SEED: Ad Winkel 1 — Geld/Verdienst
-- ============================================================
INSERT INTO content_templates (template_key, branch, content_type, title, template_text, sort_order) VALUES
('ad_winkel_1_template', 'all', 'ad_winkel_1', 'Winkel 1: Geld/Verdienst', E'WINKEL 1 — GELD / VERDIENST
Zielemotion: Gier, Neid, FOMO
Hook-Pattern: Konkreter Verdienst + Unglaube

TEMPLATE:
---
HOOK: {{monthly_earning_from}}–{{monthly_earning_to}} EUR/Monat als {{job_title}} in {{regions}} — {{#wenn experience_needed=false}}ohne Vorerfahrung{{/wenn}}{{#wenn experience_needed=true}}mit deiner Erfahrung{{/wenn}}? So geht''s:

PRIMARY TEXT:
{{company_name}} sucht {{job_title}} in {{regions}} für {{product_label}}.

Was {{tone_pronoun}} verdien{{tone_verb_suffix}}:
- {{compensation_label}}: {{commission_per_unit}}
- Realistisch {{monthly_earning_from}}–{{monthly_earning_to}} EUR/Monat
{{#wenn company_car_from}}- Firmenwagen ab {{company_car_from_label}}{{/wenn}}
{{#wenn extras}}- Extras: {{extras_label}}{{/wenn}}

{{#wenn experience_needed=false}}Keine Erfahrung nötig — {{training_label}} von Tag 1.{{/wenn}}
{{#wenn experience_needed=true}}{{tone_pronoun_cap}} bring{{tone_verb_suffix}} Vertriebserfahrung mit — wir bringen den Rest.{{/wenn}}

Jetzt bewerben (dauert 60 Sekunden): [LINK]

HEADLINE: {{monthly_earning_from}}–{{monthly_earning_to}} EUR/Monat | {{job_title}} in {{regions}}
CTA: Jetzt bewerben
---

Variationen generieren:
- 4 Varianten mit leicht unterschiedlichen Hooks
- Verdienst IMMER prominent
- Zahlen > Adjektive', 1);

-- ============================================================
-- SEED: Ad Winkel 2 — Freiheit/Lifestyle
-- ============================================================
INSERT INTO content_templates (template_key, branch, content_type, title, template_text, sort_order) VALUES
('ad_winkel_2_template', 'all', 'ad_winkel_2', 'Winkel 2: Freiheit/Lifestyle', E'WINKEL 2 — FREIHEIT / LIFESTYLE
Zielemotion: Autonomie, Unabhängigkeit, Selbstbestimmung
Hook-Pattern: Kontrastieren mit 9-to-5 / Chef-Abhängigkeit

TEMPLATE:
---
HOOK: Kein Büro. Kein Chef im Nacken. Kein Deckel auf {{tone_possessive}} Gehalt. {{#wenn task_type=leads_only}}Und nicht mal verkaufen musst {{tone_pronoun}} —{{/wenn}}{{#wenn task_type=contract_close}}Abschlüsse machen, die sich direkt auf {{tone_possessive}} Konto auswirken —{{/wenn}} willkommen im D2D-Vertrieb.

PRIMARY TEXT:
Als {{job_title}} bei {{company_name}} in {{regions}} bestimm{{tone_verb_suffix}} {{tone_pronoun}} selbst:

- Wann {{tone_pronoun}} arbeit{{tone_verb_suffix}}
- Wie viel {{tone_pronoun}} verdien{{tone_verb_suffix}} ({{monthly_earning_from}}–{{monthly_earning_to}} EUR/Monat)
- Wie schnell {{tone_pronoun}} aufsteig{{tone_verb_suffix}} ({{career_levels_label}})

{{#wenn employment_type=self_employed}}Selbstständig nach §84 HGB — maximale Freiheit.{{/wenn}}
{{#wenn employment_type=employed}}Festanstellung mit allen Vorteilen — plus ungedeckelter Provision.{{/wenn}}

{{#wenn experience_needed=false}}Quereinsteiger? Perfekt. {{training_label}} sorgt dafür, dass {{tone_pronoun}} vom ersten Tag an klar komm{{tone_verb_suffix}}.{{/wenn}}

60 Sekunden Bewerbung: [LINK]

HEADLINE: {{tone_possessive_cap}} Job, {{tone_possessive}} Regeln | {{job_title}} {{regions}}
CTA: Jetzt starten
---

Variationen generieren:
- 3 Varianten mit Freiheit-Fokus
- Kontrast zu "normalen" Jobs betonen', 2);

-- ============================================================
-- SEED: Ad Winkel 3 — Karriere/Aufstieg
-- ============================================================
INSERT INTO content_templates (template_key, branch, content_type, title, template_text, sort_order) VALUES
('ad_winkel_3_template', 'all', 'ad_winkel_3', 'Winkel 3: Karriere/Aufstieg', E'WINKEL 3 — KARRIERE / AUFSTIEG
Zielemotion: Ehrgeiz, Anerkennung, Status
Hook-Pattern: Karrierestufen als konkreter Aufstiegsplan

TEMPLATE:
---
HOOK: Vom {{job_title}} zum {{top_career_level}} — in {{regions}}. Kein Studium nötig. Kein jahrelanges Warten. Nur Leistung zählt.

PRIMARY TEXT:
Bei {{company_name}} gibt es einen klaren Karriereweg:

{{career_path_formatted}}

Jede Stufe = mehr Verantwortung + mehr Verdienst.
{{#wenn company_car_from}}Ab {{company_car_from_label}} gibt es den Firmenwagen dazu.{{/wenn}}

{{#wenn experience_needed=false}}{{tone_pronoun_cap}} brauch{{tone_verb_suffix}} keine Erfahrung — nur den Willen, {{tone_pronoun_refl}} zu beweisen. {{training_label}} gibt {{tone_pronoun_dat}} das Werkzeug.{{/wenn}}
{{#wenn experience_needed=true}}Mit {{tone_possessive}} Vertriebserfahrung überspring{{tone_verb_suffix}} {{tone_pronoun}} die erste Stufe.{{/wenn}}

Start: {{start_date}}. Verdienst: {{monthly_earning_from}}–{{monthly_earning_to}} EUR/Monat.

Bewirb {{tone_pronoun_refl}} jetzt (60 Sek.): [LINK]

HEADLINE: Karriere im Vertrieb | {{career_levels_label}}
CTA: Aufsteigen starten
---

Variationen generieren:
- 3 Varianten mit Karriere-Fokus
- Stufen immer auflisten', 3);

-- ============================================================
-- SEED: Funnel (7 Screens)
-- ============================================================
INSERT INTO content_templates (template_key, branch, content_type, title, template_text, sort_order) VALUES
('funnel_7screens', 'all', 'funnel', 'Perspective Funnel — 7 Screens', E'PERSPECTIVE FUNNEL — 7 SCREENS
Produkt: {{product_label}}
Firma: {{company_display}}
Region: {{regions}}

=== SCREEN 1: STARTSEITE ===
Headline: {{job_title}} in {{regions}} — {{monthly_earning_from}}–{{monthly_earning_to}} EUR/Monat verdienen
Subline: {{#wenn task_type=leads_only}}Kein Verkauf nötig — {{tone_pronoun}} erfass{{tone_verb_suffix}} nur Leads für {{product_label}}.{{/wenn}}{{#wenn task_type=contract_close}}{{tone_pronoun_cap}} schließ{{tone_verb_suffix}} Verträge für {{product_label}} ab — ungedeckelt provisiert.{{/wenn}}
{{#wenn experience_needed=false}}Subline 2: Keine Erfahrung? Kein Problem — Quereinsteiger willkommen.{{/wenn}}
CTA: Jetzt in 60 Sekunden bewerben

=== SCREEN 2: QUALIFIZIERUNG — ERFAHRUNG ===
Frage: {{tone_pronoun_cap_frage}} {{tone_pronoun}} bereits Vertriebserfahrung?
Antwort A: Ja, im Außendienst
Antwort B: Ja, aber nicht im D2D
Antwort C: Nein, bin Quereinsteiger
(Alle Antworten führen weiter — keine Disqualifizierung)

=== SCREEN 3: QUALIFIZIERUNG — FÜHRERSCHEIN ===
{{#wenn drivers_license_needed=true}}Frage: {{tone_pronoun_cap_frage}} {{tone_pronoun}} einen Führerschein + Auto?
Antwort A: Ja, beides
Antwort B: Führerschein ja, Auto nein
Antwort C: Nein{{/wenn}}
{{#wenn drivers_license_needed=false}}Frage: Wie komm{{tone_verb_suffix}} {{tone_pronoun}} zu {{tone_possessive}} Einsatzorten?
Antwort A: Eigenes Auto
Antwort B: ÖPNV / Fahrrad
Antwort C: Muss ich noch klären{{/wenn}}

=== SCREEN 4: QUALIFIZIERUNG — STARTDATUM ===
Frage: Wann könn{{tone_verb_suffix_2}} {{tone_pronoun}} starten?
Antwort A: Sofort / ab {{start_date}}
Antwort B: In 2–4 Wochen
Antwort C: In 1–2 Monaten

=== SCREEN 5: BENEFITS / PROOF ===
Headline: Das erwartet {{tone_pronoun_akk}}
- Verdienst: {{monthly_earning_from}}–{{monthly_earning_to}} EUR/Monat ({{compensation_label}})
- Ausbildung: {{training_label}} — vom ersten Tag an begleitet
- Karriere: {{career_levels_label}}
{{#wenn company_car_from}}- Firmenwagen ab Stufe {{company_car_from_label}}{{/wenn}}
{{#wenn client_nameable=true}}- Auftraggeber: {{client_name}}{{/wenn}}
{{#wenn extras}}- Extras: {{extras_label}}{{/wenn}}
CTA: Fast geschafft — jetzt Daten eingeben

=== SCREEN 6: KONTAKTDATEN ===
Headline: Noch 30 Sekunden — {{tone_possessive}} Bewerbung
Felder: Vorname, Nachname, Telefon, E-Mail
Hinweis: Wir melden uns innerhalb von 24h bei {{tone_pronoun_dat}}.
CTA: Bewerbung absenden

=== SCREEN 7: DANKE ===
Headline: Bewerbung erhalten!
Text: Wir melden uns innerhalb von 24 Stunden bei {{tone_pronoun_dat}}. {{tone_pronoun_cap}} erreich{{tone_verb_suffix}} uns auch direkt unter {{contact_phone}}.
Optional: Link zum Instagram/Karriereseite', 1);

-- ============================================================
-- SEED: Telefon-Skript (Vorqualifizierung)
-- ============================================================
INSERT INTO content_templates (template_key, branch, content_type, title, template_text, sort_order) VALUES
('phone_script_vorquali', 'all', 'phone_script', 'Telefon-Skript: Vorqualifizierung', E'TELEFON-SKRIPT: VORQUALIFIZIERUNG

Anrufer: {{contact_name}}
Firma: {{company_name}}
Stelle: {{job_title}}
Produkt: {{product_label}}
Ansprache: {{tone}}

=== 1. BEGRÜßUNG ===
"{{tone_gruss}} [Bewerbername], hier ist {{contact_name}} von {{company_name}}. {{tone_pronoun_cap}} ha{{tone_verb_suffix_2}} {{tone_pronoun_refl}} bei uns auf die Stelle als {{job_title}} beworben — ich rufe kurz an wegen {{tone_possessive}} Bewerbung. Passt es gerade kurz?"

=== 2. BEZUG HERSTELLEN ===
"Super! {{tone_pronoun_cap}} ha{{tone_verb_suffix_2}} {{tone_pronoun_refl}} über [Quelle: Facebook/Indeed/etc.] beworben. Kurz zu uns: Wir suchen {{job_title}} in {{regions}} für {{product_label}}. {{#wenn task_type=leads_only}}Es geht dabei NICHT um Verkauf — {{tone_pronoun}} erfass{{tone_verb_suffix}} nur Kundendaten und Termine.{{/wenn}}{{#wenn task_type=contract_close}}Es geht um den Vertrieb von {{product_label}} — {{tone_pronoun}} gehst direkt zum Kunden und schließ{{tone_verb_suffix}} Verträge ab.{{/wenn}}"

=== 3. 3 QUALIFIZIERUNGSFRAGEN ===

Frage 1 — Erfahrung:
{{#wenn experience_needed=false}}"Ha{{tone_verb_suffix_2}} {{tone_pronoun}} schon mal im Vertrieb gearbeitet? — Nicht schlimm wenn nicht, wir bilden komplett aus mit {{training_label}}."{{/wenn}}
{{#wenn experience_needed=true}}"Welche Vertriebserfahrung bring{{tone_verb_suffix}} {{tone_pronoun}} mit? Besonders D2D oder Außendienst interessiert uns."{{/wenn}}

Frage 2 — Führerschein/Mobilität:
{{#wenn drivers_license_needed=true}}"Ha{{tone_verb_suffix_2}} {{tone_pronoun}} einen Führerschein und ein eigenes Auto? Das brauchen wir für die Einsatzgebiete in {{regions}}."{{/wenn}}
{{#wenn drivers_license_needed=false}}"Wie komm{{tone_verb_suffix}} {{tone_pronoun}} zu {{tone_possessive}} Einsatzorten in {{regions}}?"{{/wenn}}

Frage 3 — Startdatum:
"Wann könn{{tone_verb_suffix_2}} {{tone_pronoun}} denn starten? Wir suchen ab {{start_date}}."

=== 4. VERDIENST-TEASER ===
"Kurz zum Verdienst: {{compensation_label}}, {{commission_per_unit}}. Realistisch sind {{monthly_earning_from}}–{{monthly_earning_to}} EUR im Monat nach Einarbeitung. {{#wenn company_car_from}}Ab {{company_car_from_label}} gibt es den Firmenwagen dazu.{{/wenn}}"

=== 5. TERMIN VEREINBAREN ===
"Das klingt alles super. Lass uns doch ein kurzes Vorstellungsgespräch machen — {{#wenn tone=du}}wann passt es dir diese Woche?{{/wenn}}{{#wenn tone=sie}}wann passt es Ihnen diese Woche?{{/wenn}} Dauert ca. 20 Minuten, [online/vor Ort in {{regions}}]."

=== 6. EINWANDBEHANDLUNG ===

"Kein Interesse mehr":
→ "Verstehe ich. Darf ich fragen, was {{tone_pronoun_refl}} geändert hat? [Pause abwarten] Viele unserer besten Leute waren am Anfang skeptisch. Der Verdienst von {{monthly_earning_from}}–{{monthly_earning_to}} EUR/Monat hat sie dann überzeugt."

"Keine Zeit gerade":
→ "Kein Problem! Wann passt es {{tone_pronoun_dat}} besser? Ich rufe dann nochmal an. [Konkreten Termin vereinbaren, nicht vage lassen]"

"Muss überlegen":
→ "Absolut verständlich. Ich melde mich morgen nochmal kurz bei {{tone_pronoun_dat}} — dann {{tone_modal}} {{tone_pronoun}} in Ruhe entscheiden. Passt das?"

"Klingt nach Drückerei":
→ "Das ist genau der Punkt — bei uns {{#wenn task_type=leads_only}}muss{{tone_verb_suffix}} {{tone_pronoun}} NICHT verkaufen. Es geht nur um Leads und Termine. Kein Klinkenputzen.{{/wenn}}{{#wenn task_type=contract_close}}ist es kein Klinkenputzen. {{tone_pronoun_cap}} ha{{tone_verb_suffix_2}} qualifizierte Termine und {{training_label}}.{{/wenn}}"

=== 7. VERABSCHIEDUNG ===
"Perfekt, dann sehen wir uns am [Datum/Uhrzeit]. Ich schicke {{tone_pronoun_dat}} gleich eine Bestätigung per [SMS/WhatsApp/E-Mail]. Bis dann!"

WICHTIG:
- Natürlich sprechen, nicht ablesen
- Pausen lassen nach Fragen
- Bei Absage: freundlich bleiben, kein Druck', 1);

-- ============================================================
-- SEED: VG-Leitfaden (Vorstellungsgespräch)
-- ============================================================
INSERT INTO content_templates (template_key, branch, content_type, title, template_text, sort_order) VALUES
('vg_leitfaden_main', 'all', 'vg_leitfaden', 'VG-Leitfaden: Vorstellungsgespräch', E'VORSTELLUNGSGESPRÄCH-LEITFADEN

Firma: {{company_name}}
Stelle: {{job_title}}
Produkt: {{product_label}}
Dauer: 20–30 Minuten

=== PHASE 1: WARM-UP (3 Min.) ===
- Smalltalk: Anreise, Wetter, allgemeine Stimmung
- "Schön, dass {{tone_pronoun}} da {{tone_verb_suffix_sein}}. Ich bin {{contact_name}}, [Position] bei {{company_name}}."
- "Wie {{tone_verb_suffix_sein}} {{tone_pronoun}} auf uns aufmerksam geworden?"

=== PHASE 2: FIRMA VORSTELLEN (5 Min.) ===
- Was macht {{company_name}}? → {{product_label}}, D2D-Vertrieb
- {{#wenn client_nameable=true}}Auftraggeber: {{client_name}} — [1-2 Sätze warum der Auftraggeber relevant ist]{{/wenn}}
- Einsatzgebiete: {{regions}}
- Team: [Teamgröße nennen]
- "Wir sind kein klassisches Callcenter — {{tone_pronoun}} {{tone_verb_suffix_sein}} draußen unterwegs, triff{{tone_verb_suffix}} echte Menschen."

=== PHASE 3: BEWERBER KENNENLERNEN (10 Min.) ===
Kern-Fragen:
1. "Erzähl mir kurz {{tone_possessive}} bisherigen Werdegang."
2. "Was hat {{tone_pronoun_akk}} an unserer Stelle angesprochen?"
3. {{#wenn experience_needed=false}}"Ha{{tone_verb_suffix_2}} {{tone_pronoun}} schon mal was im Vertrieb gemacht? Ist nicht schlimm wenn nicht — wir bilden aus."{{/wenn}}{{#wenn experience_needed=true}}"Welche Vertriebserfahrung bring{{tone_verb_suffix}} {{tone_pronoun}} mit?"{{/wenn}}
4. "Was ist {{tone_pronoun_dat}} bei einem Job am wichtigsten?"
5. "Wo {{tone_modal_2}} {{tone_pronoun}} in einem Jahr stehen?"

Rote Flaggen:
- Fragt nur nach Gehalt ohne Interesse an der Tätigkeit
- Kann nicht erklären warum D2D
- Will nur Homeoffice

=== PHASE 4: STELLE ERKLÄREN (5 Min.) ===
Der typische Tag:
- {{#wenn task_type=leads_only}}"{{tone_pronoun_cap}} fähr{{tone_verb_suffix}} in {{tone_possessive}} Einsatzgebiet, klingel{{tone_verb_suffix}} bei Privathaushalten und erfass{{tone_verb_suffix}} Kundendaten / Termine für {{product_label}}. {{tone_pronoun_cap}} muss{{tone_verb_suffix}} NICHT verkaufen."{{/wenn}}
- {{#wenn task_type=contract_close}}"{{tone_pronoun_cap}} fähr{{tone_verb_suffix}} in {{tone_possessive}} Einsatzgebiet, berä{{tone_verb_suffix}} Kunden zu {{product_label}} und schließ{{tone_verb_suffix}} Verträge ab. Provision pro Abschluss."{{/wenn}}

Karriere:
{{career_path_formatted}}
{{#wenn company_car_from}}"Ab {{company_car_from_label}} bekomm{{tone_verb_suffix}} {{tone_pronoun}} den Firmenwagen."{{/wenn}}

Verdienst:
"{{compensation_label}}: {{commission_per_unit}}. Realistisch {{monthly_earning_from}}–{{monthly_earning_to}} EUR/Monat."

=== PHASE 5: FRAGEN BEANTWORTEN (3 Min.) ===
"Ha{{tone_verb_suffix_2}} {{tone_pronoun}} noch Fragen?"

Häufige Fragen + Antworten:
- "Was muss ich mitbringen?" → {{#wenn drivers_license_needed=true}}Führerschein + Auto{{/wenn}}{{#wenn drivers_license_needed=false}}Motivation und Lernbereitschaft{{/wenn}}
- "Wie sieht die Einarbeitung aus?" → {{training_label}}, [Dauer nennen]
- "Ist das Selbstständigkeit?" → {{#wenn employment_type=self_employed}}Ja, nach §84 HGB — maximale Flexibilität{{/wenn}}{{#wenn employment_type=employed}}Nein, Festanstellung mit allen Vorteilen{{/wenn}}

=== PHASE 6: ABSCHLUSS (2 Min.) ===
Wenn positiv:
"Ich finde, das passt sehr gut. Mein Vorschlag: {{tone_pronoun}} komm{{tone_verb_suffix}} [Datum] zum Probetag. Da {{tone_modal}} {{tone_pronoun}} dir das Team und die Arbeit live anschauen. Klingt gut?"

Wenn unsicher:
"Ich melde mich morgen bei {{tone_pronoun_dat}} mit einer Rückmeldung. Bis dahin: Falls {{tone_pronoun}} Fragen ha{{tone_verb_suffix_2}}, ruf einfach an."

Wenn Absage:
"Danke für {{tone_possessive}} Zeit. Falls sich etwas ändert, melde {{tone_pronoun_refl}} gerne wieder bei uns."', 1);

-- ============================================================
-- SEED: Follow-Up Scripts
-- ============================================================
INSERT INTO content_templates (template_key, branch, content_type, title, template_text, sort_order) VALUES
('follow_up_nach_vq', 'all', 'follow_up', 'Follow-Up: Nach Vorqualifizierung (24h)', E'FOLLOW-UP NACH VORQUALIFIZIERUNG (24h)

Kanal: WhatsApp / SMS
Ansprache: {{tone}}

=== VARIANTE 1: TERMIN BESTÄTIGUNG ===
"{{tone_gruss}} [Name], hier ist {{contact_name}} von {{company_name}}. Wir hatten gestern telefoniert wegen der Stelle als {{job_title}}.

Kurze Erinnerung: {{tone_possessive_cap}} Vorstellungsgespräch ist am [Datum] um [Uhrzeit]. [Ort/Link].

Bis dann!"

=== VARIANTE 2: KEIN TERMIN VEREINBART ===
"{{tone_gruss}} [Name], hier nochmal {{contact_name}} von {{company_name}}.

Wir hatten gestern kurz telefoniert. {{tone_pronoun_cap}} woll{{tone_verb_suffix_2}} noch kurz überlegen — hab ich {{tone_pronoun_akk}} richtig verstanden?

Ich melde mich kurz: Die Stelle als {{job_title}} in {{regions}} ist noch offen — {{monthly_earning_from}}–{{monthly_earning_to}} EUR/Monat, {{#wenn experience_needed=false}}keine Erfahrung nötig{{/wenn}}.

Soll ich {{tone_pronoun_dat}} einen Termin für ein 20-minütiges Gespräch vorschlagen?"

=== VARIANTE 3: NICHT ERREICHT ===
"{{tone_gruss}} [Name], ich hatte versucht {{tone_pronoun_akk}} zu erreichen. Ich bin {{contact_name}} von {{company_name}} — wegen {{tone_possessive}} Bewerbung als {{job_title}}.

Wann passt es {{tone_pronoun_dat}} am besten? Ich rufe gerne nochmal an.

Viele Grüße"', 1);

INSERT INTO content_templates (template_key, branch, content_type, title, template_text, sort_order) VALUES
('follow_up_nach_vg', 'all', 'follow_up', 'Follow-Up: Nach VG (48h)', E'FOLLOW-UP NACH VORSTELLUNGSGESPRÄCH (48h)

Kanal: WhatsApp / Telefon
Ansprache: {{tone}}

=== POSITIV — PROBETAG EINLADEN ===
"{{tone_gruss}} [Name], hier ist {{contact_name}}.

Danke nochmal für das Gespräch — hat mir gut gefallen! Ich möchte {{tone_pronoun_akk}} gerne zum Probetag einladen.

Termin: [Datum], [Uhrzeit]
Ort: [Ort]
Dauer: ca. [X] Stunden

{{tone_pronoun_cap}} fähr{{tone_verb_suffix}} mit einem erfahrenen Kollegen mit und schau{{tone_verb_suffix}} {{tone_pronoun_dat}} alles in Ruhe an. Kein Druck — einfach reinschnuppern.

Passt das?"

=== NOCH UNSICHER ===
"{{tone_gruss}} [Name], {{contact_name}} hier.

Ich wollte kurz nachfragen wie es {{tone_pronoun_dat}} nach unserem Gespräch geht. Gibt es noch offene Fragen?

Ich schlage vor: Komm einfach zum unverbindlichen Probetag am [Datum]. Da sieh{{tone_verb_suffix}} {{tone_pronoun}} live wie der Job aussieht — ganz ohne Verpflichtung."', 2);

INSERT INTO content_templates (template_key, branch, content_type, title, template_text, sort_order) VALUES
('follow_up_nach_probetag', 'all', 'follow_up', 'Follow-Up: Nach Probetag', E'FOLLOW-UP NACH PROBETAG

Kanal: Telefon → WhatsApp
Ansprache: {{tone}}

=== POSITIV — EINSTELLEN ===
"{{tone_gruss}} [Name]! {{contact_name}} hier.

Wie war {{tone_possessive}} Eindruck vom Probetag? [Pause abwarten]

Von unserer Seite: Das Team fand {{tone_pronoun_akk}} super. Wir würden {{tone_pronoun_akk}} gerne einstellen.

Nächste Schritte:
- Vertrag vorbereiten ({{employment_type_label}})
- Start: [Datum]
- Einarbeitung: {{training_label}}

Bist {{tone_pronoun}} dabei?"

=== NOCH UNSICHER ===
"{{tone_gruss}} [Name], danke für den Probetag!

Ich verstehe, wenn {{tone_pronoun}} noch eine Nacht drüber schlafen möchte. Eine Sache: Die nächste Einarbeitungsrunde startet am [Datum] — wenn {{tone_pronoun}} dabei sein möchte, müssten wir bis [Deadline] Bescheid wissen.

Keine Eile — aber damit {{tone_pronoun}} es im Hinterkopf ha{{tone_verb_suffix_2}}."', 3);

-- ============================================================
-- SEED: Absage Scripts
-- ============================================================
INSERT INTO content_templates (template_key, branch, content_type, title, template_text, sort_order) VALUES
('absage_telefon', 'all', 'absage_telefon', 'Absage: Telefonisch', E'ABSAGE-SKRIPT: TELEFONISCH

"{{tone_gruss}} [Name], hier ist {{contact_name}} von {{company_name}}.

Ich melde mich wegen {{tone_possessive}} Bewerbung als {{job_title}}. Leider muss ich {{tone_pronoun_dat}} mitteilen, dass wir uns für einen anderen Kandidaten entschieden haben.

Das liegt nicht an {{tone_pronoun_dat}} persönlich — wir hatten viele gute Bewerbungen und mussten eine Auswahl treffen.

{{tone_pronoun_cap}} {{tone_modal}} sich aber gerne in Zukunft wieder bei uns bewerben, falls eine neue Stelle frei wird.

Ich wünsche {{tone_pronoun_dat}} alles Gute für die Zukunft!"', 1);

INSERT INTO content_templates (template_key, branch, content_type, title, template_text, sort_order) VALUES
('absage_nach_vg', 'all', 'absage_vg', 'Absage: Nach Vorstellungsgespräch', E'ABSAGE NACH VORSTELLUNGSGESPRÄCH

Kanal: Telefon → Nachricht
Ansprache: {{tone}}

Telefon:
"{{tone_gruss}} [Name], danke nochmal für das Gespräch. Leider müssen wir {{tone_pronoun_dat}} absagen — wir haben uns für jemanden entschieden, der etwas besser auf die Stelle passt.

Das war keine leichte Entscheidung. Falls in Zukunft etwas frei wird, melde ich mich gerne bei {{tone_pronoun_dat}}."

Nachricht (wenn nicht erreichbar):
"{{tone_gruss}} [Name], hier {{contact_name}} von {{company_name}}. Danke für das Gespräch letzte Woche.

Leider müssen wir {{tone_pronoun_dat}} mitteilen, dass wir uns für einen anderen Kandidaten entschieden haben. Das lag nicht an {{tone_pronoun_dat}} — wir hatten einfach sehr viele starke Bewerber.

Falls sich in Zukunft etwas ergibt, melden wir uns gerne. Alles Gute!"', 2);

INSERT INTO content_templates (template_key, branch, content_type, title, template_text, sort_order) VALUES
('absage_schriftlich', 'all', 'absage_schriftlich', 'Absage: Schriftlich (E-Mail/WhatsApp)', E'ABSAGE SCHRIFTLICH

Kanal: E-Mail oder WhatsApp
Ansprache: {{tone}}

=== E-MAIL ===
Betreff: {{tone_possessive_cap}} Bewerbung bei {{company_name}}

{{tone_gruss}} [Name],

vielen Dank für {{tone_possessive}} Bewerbung als {{job_title}} und {{tone_possessive}} Interesse an {{company_name}}.

Nach sorgfältiger Prüfung aller Bewerbungen müssen wir {{tone_pronoun_dat}} leider mitteilen, dass wir uns für einen anderen Kandidaten entschieden haben.

Dies ist keine Bewertung {{tone_possessive}} Qualifikationen — wir mussten eine Auswahl treffen und haben uns auf Basis des Gesamtpakets entschieden.

Wir wünschen {{tone_pronoun_dat}} für {{tone_possessive}} berufliche Zukunft alles Gute und viel Erfolg!

Mit freundlichen Grüßen
{{contact_name}}
{{company_name}}

=== WHATSAPP (KURZ) ===
"{{tone_gruss}} [Name], hier {{contact_name}} von {{company_name}}. Danke für {{tone_possessive}} Bewerbung! Leider haben wir uns für jemand anderen entschieden. Alles Gute!"', 3);

-- ============================================================
-- SEED: Branch Profile — Solar
-- ============================================================
INSERT INTO branch_profiles (branch, default_values, strongest_angle, target_audience, common_rejection, notes) VALUES
('solar', '{
  "product_label": "Photovoltaik / Solaranlagen",
  "typical_commission": "200–400 EUR pro Termin/Lead",
  "typical_earning_from": 3500,
  "typical_earning_to": 7000,
  "typical_task_type": "leads_only",
  "typical_pitch": "Kunden informieren sich gerne über Solaranlagen wegen steigender Strompreise. Du erfasst nur den Termin — verkaufen muss ein Experte.",
  "hook_keywords": ["Strompreise", "Energiewende", "Solaranlage", "Dach", "Eigenheim"],
  "objection_handling": {
    "klingt_nach_drueckerei": "Es geht nur darum Termine zu erfassen — du verkaufst NICHT. Ein Solar-Experte macht den Rest.",
    "kenne_mich_nicht_aus": "Musst du auch nicht — du lernst in 2 Tagen alles was du brauchst. Es geht um Terminvereinbarungen, nicht um Technik.",
    "will_nicht_von_tuer_zu_tuer": "Verstehe ich. Aber unsere Leute sind keine Staubsauger-Verkäufer — du informierst Eigenheimbesitzer über eine echte Ersparnis."
  },
  "funnel_specifics": {
    "screen1_visual": "Haus mit Solaranlage, sonniger Tag",
    "benefit_keywords": ["Keine Kaltakquise im klassischen Sinn", "Produkt das sich von selbst erklärt", "Hausbesitzer haben echtes Interesse"]
  }
}', 'winkel_1', 'Quereinsteiger 20–35, sportlich, autark, kein Bock auf Büro', 'Klingt nach Drückerei / Will nicht von Tür zu Tür', 'Solar hat die höchste Lead-Conversion weil Eigenheimbesitzer echtes Interesse haben. Stärkster Winkel: Geld (hohe Provisionen für einfache Leads).');

-- ============================================================
-- SEED: Branch Profile — Glasfaser
-- ============================================================
INSERT INTO branch_profiles (branch, default_values, strongest_angle, target_audience, common_rejection, notes) VALUES
('glasfaser', '{
  "product_label": "Glasfaser-Internet",
  "typical_commission": "80–150 EUR pro Vertrag",
  "typical_earning_from": 3000,
  "typical_earning_to": 6000,
  "typical_task_type": "contract_close",
  "typical_pitch": "Du berätst Privathaushalte zum Glasfaser-Ausbau in ihrer Straße und schließt Verträge ab. Oft steht der Ausbau schon fest — du musst nur noch den Vertrag klarmachen.",
  "hook_keywords": ["Glasfaser", "Internet", "Ausbau", "schnelles Internet", "Straße wird ausgebaut"],
  "objection_handling": {
    "klingt_nach_drueckerei": "Du kommst nicht unangekündigt — die Straße wird sowieso ausgebaut und die Leute warten darauf. Du bist der Bote mit guten Nachrichten.",
    "schon_internet": "Genau — aber Glasfaser ist 10x schneller und zukunftssicher. Die meisten Kunden wollen upgraden.",
    "will_nicht_verkaufen": "Es ist eher Beratung als Verkauf. Der Ausbau steht fest, du erklärst nur die Konditionen."
  },
  "funnel_specifics": {
    "screen1_visual": "Glasfaserkabel, moderne Technik, Straße mit Ausbau",
    "benefit_keywords": ["Produkt erklärt sich selbst", "Nachbarschaftseffekt", "Kunden warten auf dich"]
  }
}', 'winkel_2', 'Kommunikativ, 22–40, gerne draußen unterwegs, Überzeugungsstark', 'Will nicht Haustüren abklappern / Habe keine Ahnung von Technik', 'Glasfaser hat den Vorteil dass Kunden oft schon wissen dass ausgebaut wird. Stärkster Winkel: Freiheit (eigener Chef, draußen unterwegs).');

-- ============================================================
-- SEED: Branch Profile — Strom & Gas
-- ============================================================
INSERT INTO branch_profiles (branch, default_values, strongest_angle, target_audience, common_rejection, notes) VALUES
('strom_gas', '{
  "product_label": "Strom- und Gas-Tarife",
  "typical_commission": "50–120 EUR pro Vertrag",
  "typical_earning_from": 2500,
  "typical_earning_to": 5000,
  "typical_task_type": "contract_close",
  "typical_pitch": "Du vergleichst Strom- und Gas-Tarife für Privathaushalte und wechselst sie in einen günstigeren Tarif. Die Ersparnis ist real — das macht das Gespräch leicht.",
  "hook_keywords": ["Stromkosten", "Gaskosten", "Tarifwechsel", "sparen", "Energiekosten"],
  "objection_handling": {
    "klingt_unserioes": "Wir arbeiten mit [Anbieter] zusammen — einem etablierten Energieversorger. Der Tarifvergleich zeigt schwarz auf weiß die Ersparnis.",
    "kunden_wollen_nicht_wechseln": "Die meisten Kunden zahlen zu viel und wissen es. Wenn du ihnen 300 EUR/Jahr Ersparnis zeigst, wechseln sie gerne.",
    "zu_viel_konkurrenz": "Genau deshalb zählt Schnelligkeit. Unsere Leads sind frisch und exklusiv."
  },
  "funnel_specifics": {
    "screen1_visual": "Stromrechnung, Euro-Zeichen, Familie am Küchentisch",
    "benefit_keywords": ["Jeder braucht Strom und Gas", "Einfacher Tarifvergleich", "Echte Ersparnis für Kunden"]
  }
}', 'winkel_1', 'Kommunikativ, 20–45, kann mit Zahlen umgehen, überzeugend', 'Gibt es genug Kunden? / Klingt nach Drückerei', 'Strom & Gas hat den Vorteil dass JEDER Haushalt Kunde ist. Stärkster Winkel: Geld (hohes Volumen = hohes Einkommen).');

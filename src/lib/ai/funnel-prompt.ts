/**
 * Builds the Perspective MCP funnel prompt based on CGMS Köln structure.
 * 8 screens: Start → Führerschein → Erfahrung → Branche → Erreichbarkeit → Motivation → Kontakt → Danke
 */

interface FunnelContext {
  company_name: string;
  job_title: string;
  regions: string[];
  product: string;
  task_type: string;
  compensation: string;
  commission_per_unit: string;
  monthly_earning_from: number;
  monthly_earning_to: number;
  employment_type: string;
  career_levels: string[];
  company_car_from: string;
  training_type: string;
  client_nameable: boolean;
  client_name: string | null;
  extras: string[];
  experience_needed: boolean;
  drivers_license_needed: boolean;
  tone: string;
  primary_color: string;
}

const PRODUCT_LABELS: Record<string, string> = {
  pv: 'Photovoltaik',
  glasfaser: 'Glasfaser',
  strom_gas: 'Strom & Gas',
  telko: 'Telekommunikation',
  versicherung: 'Versicherung',
};

const TASK_LABELS: Record<string, string> = {
  leads_only: 'Du fragst nur ab, ob Interesse besteht. Kein Verkaufen.',
  contract_close: 'Du berätst und schließt direkt ab.',
};

const TRAINING_LABELS: Record<string, string> = {
  one_on_one: '1:1 Einarbeitung & Mentoring',
  video_course: 'Videokurs + Praxisphase',
  mentor: 'Mentor-Programm',
  learning_by_doing: 'Learning by Doing mit Team-Support',
};

const COMPENSATION_LABELS: Record<string, string> = {
  pure_commission: 'Reine Provision, ungedeckelt',
  commission_guarantee: 'Provision + Garantiegehalt',
  fixed_commission: 'Fixum + Provision',
};

export function buildFunnelPrompt(ctx: FunnelContext): string {
  const productLabel = PRODUCT_LABELS[ctx.product] || ctx.product;
  const taskLabel = TASK_LABELS[ctx.task_type] || '';
  const trainingLabel = TRAINING_LABELS[ctx.training_type] || ctx.training_type;
  const compensationLabel = COMPENSATION_LABELS[ctx.compensation] || ctx.compensation;
  const regionsText = ctx.regions?.join(', ') || 'Deutschland';
  const careerText = ctx.career_levels?.join(' → ') || 'Vertriebler → Teamleiter';
  const extrasText = ctx.extras?.join(', ') || '';
  const du = ctx.tone === 'sie' ? 'Sie' : 'du';

  const auftraggeber = ctx.client_nameable && ctx.client_name
    ? `Arbeit für ${ctx.client_name}`
    : 'Renommierter Auftraggeber';

  return `Erstelle einen 8-Screen D2D Recruiting Funnel auf Deutsch im Stil der bestehenden CGMS Köln Vorlage. Mobiloptimiert, professionell, ${ctx.primary_color || 'orange'} als Akzentfarbe. Ansprache: ${du}.

SCREEN 1 — START (Hero):
Headline: "${ctx.job_title} in ${regionsText}: ungedeckelt verdienen"
${ctx.task_type === 'leads_only' ? `Subline: "Kein Verkaufen. ${du === 'Sie' ? 'Sie fragen' : 'Du fragst'} nur ab, ob Interesse an ${productLabel} besteht."` : `Subline: "${du === 'Sie' ? 'Sie beraten' : 'Du berätst'} Kunden zu ${productLabel} und ${du === 'Sie' ? 'schließen' : 'schließt'} direkt ab."`}
Trust-Zeile: "${compensationLabel} · Quereinsteiger willkommen · ${regionsText}"
Button: "Passt das zu mir? →"
Darunter ein motivierendes Bild eines selbstbewussten jungen Menschen im Außendienst.

SCREEN 2 — FÜHRERSCHEIN (Quiz, Single-Select, auto-weiter):
Frage: "${du === 'Sie' ? 'Haben Sie' : 'Hast du'} einen Führerschein und ein eigenes Auto?"
Optionen:
A) Ja, habe ich mit KFZ
B) Nur Führerschein
C) Nein, habe ich nicht
Fortschrittsanzeige: Schritt 1 von 5

SCREEN 3 — ERFAHRUNG (Quiz, Single-Select, auto-weiter):
Frage: "${du === 'Sie' ? 'Haben Sie' : 'Hast du'} schon im Vertrieb gearbeitet?"
Optionen:
A) Ja, im Außendienst
B) Ja, in einem anderen Bereich
C) Nein, ich bin Quereinsteiger
Fortschrittsanzeige: Schritt 2 von 5

SCREEN 4 — ERREICHBARKEIT (Quiz, Single-Select, auto-weiter):
Frage: "Wann ${du === 'Sie' ? 'sind Sie' : 'bist du'} am besten erreichbar?"
Optionen:
A) Vormittags (8-12 Uhr)
B) Nachmittags (12-18 Uhr)
C) Jederzeit
Fortschrittsanzeige: Schritt 3 von 5

SCREEN 5 — MOTIVATION (Quiz, Single-Select, auto-weiter):
Frage: "Was ist ${du === 'Sie' ? 'Ihnen' : 'dir'} am wichtigsten?"
Optionen:
A) Geld verdienen
B) Weiterentwicklung
C) Geiles Umfeld & Team
Fortschrittsanzeige: Schritt 4 von 5

SCREEN 6 — VERDIENST & BENEFITS (Beweis-Seite):
Headline: "Das verdienen unsere Leute wirklich"
Große Zahl: "${ctx.monthly_earning_from?.toLocaleString('de-DE')}–${ctx.monthly_earning_to?.toLocaleString('de-DE')} €"
Text: "im Monat, realistisch nach der Einarbeitung. Ungedeckelt: wer mehr Türen macht, verdient mehr."

Benefits als Liste mit Emojis:
🎓 ${trainingLabel}
📈 Aufstiegsstufen: ${careerText}
${ctx.company_car_from && ctx.company_car_from !== 'nein' ? `🚗 Firmenwagen ab ${ctx.company_car_from}` : ''}
🗂️ ${auftraggeber}
${extrasText ? `🤑 ${extrasText}` : ''}
🥩 Firmenevents & Teamausflüge

${!ctx.experience_needed ? `Hinweis: "Kein Vertriebshintergrund? ${du === 'Sie' ? 'Brauchen Sie' : 'Brauchst du'} nicht. Was ${du === 'Sie' ? 'Sie brauchen' : 'du brauchst'}: Führerschein, ein Auto und Motivation."` : ''}

Button: "Ich bin dabei →"
Fortschrittsanzeige: Schritt 5 von 5

SCREEN 7 — KONTAKT (Formular):
Headline: "Fast geschafft: wo erreichen wir ${du === 'Sie' ? 'Sie' : 'dich'}?"
Felder: Vorname, Nachname, Handynummer (tel), E-Mail, PLZ
Einwilligungshinweis: "Wir melden uns innerhalb von 24 Stunden telefonisch. Mit dem Absenden ${du === 'Sie' ? 'sind Sie' : 'bist du'} einverstanden, dass wir ${du === 'Sie' ? 'Sie' : 'dich'} per Telefon und WhatsApp kontaktieren."
Button: "Jetzt bewerben"
PLZ ist Pflichtfeld.

SCREEN 8 — DANKE:
Großes Häkchen-Icon in der Akzentfarbe.
Headline: "Danke: wir rufen ${du === 'Sie' ? 'Sie' : 'dich'} an."
Text: "${du === 'Sie' ? 'Sie bekommen' : 'Du bekommst'} gleich eine WhatsApp von uns. ${du === 'Sie' ? 'Antworten Sie' : 'Antworte'} einfach darauf, dann finden wir schneller einen Termin."
Kein Button, kein Weiterleiten.

DESIGN-REGELN:
- Emojis NUR im Benefit-Block (Screen 6), nirgendwo sonst
- Keine Em-Dashes, Doppelpunkte stattdessen
- Mobiloptimiert, Single-Column
- Quiz-Optionen als große, klickbare Karten (volle Breite)
- Fortschrittsanzeige als Schrittbalken oben
- Einheitliche Akzentfarbe: ${ctx.primary_color || '#ff8c00'}
- Professionelle Bilder: Außendienst-Mitarbeiter, Teamfotos
- Footer mit Firmenname und Cookie-Einstellungen Link`;
}

export function buildFunnelName(companyName: string): string {
  return `${companyName} Recruiting Funnel`;
}

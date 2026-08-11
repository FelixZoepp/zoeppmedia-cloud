import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export type ContentType = 'ad_copy' | 'phone_script' | 'video_script' | 'funnel_text' | 'job_posting' | 'creative_brief';

export interface OnboardingContext {
  company_name: string | null;
  industry: string | null;
  region: string | null;
  employee_count: string | null;
  hiring_target: number | null;
  hiring_timeframe: string | null;
  experience_required: string | null;
  compensation_model: string | null;
  usps: string | null;
  primary_color: string | null;
}

export function buildSystemPrompt(type: ContentType, ctx: OnboardingContext): string {
  const base = `Du bist ein Experte für D2D-Recruiting und Personalmarketing. Du erstellst Content für die Firma "${ctx.company_name || 'Unbekannt'}" in der Branche ${ctx.industry || 'D2D-Vertrieb'}, Region ${ctx.region || 'Deutschland'}.

Kontext:
- Aktuelle Mitarbeiter: ${ctx.employee_count || 'k.A.'}
- Einstellungsziel: ${ctx.hiring_target || 'k.A.'} Mitarbeiter in ${ctx.hiring_timeframe || 'k.A.'}
- Erfahrung: ${ctx.experience_required || 'Quereinsteiger willkommen'}
- Vergütung: ${ctx.compensation_model || 'k.A.'}
- USPs: ${ctx.usps || 'k.A.'}`;

  const typePrompts: Record<ContentType, string> = {
    ad_copy: `${base}

Erstelle Facebook/Instagram Recruiting-Anzeigentexte. Erstelle 3 Varianten:
1. Kurz (< 125 Zeichen) — Hook für Feed
2. Mittel (< 250 Zeichen) — Standard Ad Text
3. Lang (< 500 Zeichen) — Detaillierte Anzeige

Jede Variante mit: Headline, Primary Text, Description, CTA-Vorschlag.
Tonalität: Direkt, motivierend, keine Floskeln. Spreche Quereinsteiger an.`,

    phone_script: `${base}

Erstelle ein Telefon-Skript für das Nachfassen von Bewerbern. Struktur:
1. Begrüßung (mit Firmenname)
2. Grund des Anrufs
3. Kurze Vorstellung der Position
4. Qualifizierende Fragen (3-4)
5. Terminvereinbarung
6. Verabschiedung

Tonalität: Freundlich, professionell, nicht aufdringlich. Inklusive Einwandbehandlung für "Kein Interesse" und "Keine Zeit".`,

    video_script: `${base}

Erstelle ein Skript für ein 60-90 Sekunden Recruiting-Video. Struktur:
1. Hook (erste 3 Sekunden)
2. Problem/Situation ansprechen
3. Lösung/Jobangebot vorstellen
4. 3 Key Benefits
5. Social Proof (Teamgröße, Erfolge)
6. Call-to-Action

Tonalität: Authentisch, energisch, wie ein echter Mitarbeiter spricht.`,

    job_posting: `${base}

Erstelle eine Indeed-Stellenanzeige. Struktur:
- Stellentitel (SEO-optimiert)
- Einleitung (2-3 Sätze, Hook)
- Deine Aufgaben (5-6 Punkte)
- Dein Profil (4-5 Punkte, Quereinsteiger willkommen betonen)
- Wir bieten (6-8 Benefits)
- Gehalt/Provision transparent

Tonalität: Modern, direkt, Du-Ansprache.`,

    funnel_text: `${base}

Erstelle Texte für eine Recruiting-Landingpage (Perspective Funnel). Struktur:
- Headline (max 8 Wörter, Aufmerksamkeit)
- Subheadline (1 Satz, Nutzenversprechen)
- 3 Benefit-Blöcke (Icon-Titel + 1 Satz)
- Testimonial-Platzhalter
- CTA-Button Text
- Formular-Überschrift
- Dankeseite-Text

Tonalität: Klar, motivierend, conversion-optimiert.`,

    creative_brief: `${base}

Erstelle ein Creative-Brief für Recruiting-Anzeigenbilder. Beschreibe:
- 3 Bildkonzepte mit Beschreibung (was ist zu sehen, Stimmung, Farben)
- Text-Overlays pro Bild (Headline + Subline)
- Empfohlene Primärfarbe: ${ctx.primary_color || '#E0354B'}
- Format-Empfehlungen (1080x1080 Feed, 1080x1920 Story)
- Do's und Don'ts für D2D-Recruiting Creatives`,
  };

  return typePrompts[type] || base;
}

export async function generateContent(
  type: ContentType,
  context: OnboardingContext,
  previousVersion?: string,
  feedback?: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt(type, context);

  let userMessage = `Generiere den Content jetzt.`;
  if (previousVersion && feedback) {
    userMessage = `Hier ist die vorherige Version:\n\n${previousVersion}\n\nFeedback: ${feedback}\n\nBitte überarbeite den Content basierend auf dem Feedback.`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock?.text || '';
}

export async function chatWithClaude(
  messages: { role: 'user' | 'assistant'; content: string }[],
  systemPrompt: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages,
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock?.text || '';
}

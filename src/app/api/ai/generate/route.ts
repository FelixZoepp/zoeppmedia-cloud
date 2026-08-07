import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { type, agency_id, context, fulfillment_task_id } = await req.json();

  // Fetch onboarding data for context
  const { data: onboarding } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .eq('agency_id', agency_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const prompts: Record<string, string> = {
    ad_copy: `Erstelle 3 Facebook/Instagram Ad Copys für eine D2D-Recruiting-Kampagne.
Unternehmen: ${onboarding?.company_name || 'N/A'}
Branche: ${onboarding?.industry || 'D2D Vertrieb'}
Region: ${onboarding?.region || 'Deutschland'}
USPs: ${onboarding?.usps || 'Attraktive Provision, Quereinsteiger willkommen'}
Gehalt/Provision: ${onboarding?.compensation_model || 'N/A'}
Zusätzlicher Kontext: ${context || ''}

Schreibe die Copys auf Deutsch, mit einem Hook, Haupttext und CTA. Jede Copy sollte anders sein (emotional, rational, social proof).`,

    script: `Erstelle ein Telefon-Skript für die Erstansprache von Bewerbern aus einer D2D-Recruiting-Kampagne.
Unternehmen: ${onboarding?.company_name || 'N/A'}
Branche: ${onboarding?.industry || 'D2D Vertrieb'}
Region: ${onboarding?.region || 'Deutschland'}
USPs: ${onboarding?.usps || 'N/A'}
Zusätzlicher Kontext: ${context || ''}

Das Skript soll: Begrüßung, Qualifizierungsfragen, Termin-Pitch und Einwandbehandlung enthalten.`,

    funnel_text: `Erstelle die Texte für eine Recruiting-Landingpage (Perspective Funnel).
Unternehmen: ${onboarding?.company_name || 'N/A'}
Branche: ${onboarding?.industry || 'D2D Vertrieb'}
Region: ${onboarding?.region || 'Deutschland'}
USPs: ${onboarding?.usps || 'N/A'}
Zusätzlicher Kontext: ${context || ''}

Liefere: Headline, Subheadline, 3 Benefit-Punkte, Testimonial-Placeholder, CTA-Text.`,
  };

  const prompt = prompts[type] || prompts.ad_copy;

  // For now, return a placeholder. In production, this would call Claude API.
  // The structure is ready for API integration.
  const generatedContent = `[AI-generierter ${type} Content]\n\n${prompt}\n\n---\nHinweis: Verbinde die Claude API (ANTHROPIC_API_KEY) für echte AI-Generierung.`;

  // Save to generated_content table
  const { data: saved, error } = await supabase
    .from('generated_content')
    .insert({
      agency_id,
      fulfillment_task_id: fulfillment_task_id || null,
      content_type: type,
      content: generatedContent,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(saved);
}

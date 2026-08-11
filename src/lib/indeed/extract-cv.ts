import Anthropic from '@anthropic-ai/sdk';

export interface CvData {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  experience_summary: string | null;
  last_employer: string | null;
}

const EMPTY_CV: CvData = {
  full_name: null,
  email: null,
  phone: null,
  location: null,
  experience_summary: null,
  last_employer: null,
};

export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text || '';
  } catch {
    return '';
  }
}

export async function extractCvData(pdfText: string): Promise<CvData> {
  if (!pdfText || pdfText.length < 20) return EMPTY_CV;

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `Du extrahierst strukturierte Daten aus einem Lebenslauf-Text.
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

Wenn ein Feld nicht findbar ist, setze null.`,
      messages: [{ role: 'user', content: pdfText.slice(0, 4000) }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock) return EMPTY_CV;

    const jsonMatch = (textBlock as { type: 'text'; text: string }).text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return EMPTY_CV;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      full_name: parsed.full_name || null,
      email: parsed.email || null,
      phone: parsed.phone || null,
      location: parsed.location || null,
      experience_summary: parsed.experience_summary || null,
      last_employer: parsed.last_employer || null,
    };
  } catch {
    return EMPTY_CV;
  }
}

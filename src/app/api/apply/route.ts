// Oeffentliches Bewerbungsformular — kein Auth erforderlich, multipart/form-data.
// TODO Phase 7: Turnstile-Captcha-Pruefung hinzufuegen.
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestApplication } from '@/lib/recruiting/ingest';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const ApplySchema = z.object({
  agencyId: z.string().uuid(),
  jobId: z.string().uuid(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional().default(''),
  phone: z.string().min(1).max(30),
  email: z.string().email().max(200).optional().or(z.literal('')),
  postalCode: z.string().max(10).optional().default(''),
  city: z.string().max(100).optional().default(''),
  consentWhatsapp: z.enum(['true', 'false']).transform((v) => v === 'true'),
  campaign: z.string().optional().default('{}'),
});

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const raw: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') raw[key] = value;
  });

  const parsed = ApplySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validierungsfehler', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { agencyId, jobId, firstName, lastName, phone, email, consentWhatsapp, campaign: campaignStr } = parsed.data;

  let campaign: Record<string, unknown> = {};
  try { campaign = JSON.parse(campaignStr); } catch { /* ignore */ }

  const supabase = createAdminClient();

  // Resume-Upload
  let resume: { storagePath: string; mime: string; size: number } | null = null;
  const resumeFile = formData.get('resume');
  if (resumeFile && resumeFile instanceof File && resumeFile.size > 0) {
    if (resumeFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Datei zu gross (max. 10 MB)' }, { status: 400 });
    }
    const timestamp = Date.now();
    const safeName = resumeFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50);
    const storagePath = `${agencyId}/apply/${timestamp}-${safeName}`;
    const buffer = Buffer.from(await resumeFile.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from('candidate-resumes')
      .upload(storagePath, buffer, { contentType: resumeFile.type || 'application/pdf' });

    if (!uploadError) {
      resume = { storagePath, mime: resumeFile.type || 'application/pdf', size: resumeFile.size };
    }
  }

  try {
    const result = await ingestApplication(supabase, {
      agencyId,
      jobId,
      firstName,
      lastName: lastName || null,
      phone,
      email: email || null,
      source: 'form',
      campaign: Object.keys(campaign).length > 0 ? campaign : null,
      consentWhatsapp,
      consentSource: 'form',
      resume,
    });

    return NextResponse.json({
      ok: true,
      candidateId: result.candidateId,
      applicationId: result.applicationId,
      duplicateWithin30Days: result.duplicateWithin30Days,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Verarbeitung fehlgeschlagen' }, { status: 500 });
  }
}

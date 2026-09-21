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
    return NextResponse.json({ error: 'Validierungsfehler' }, { status: 400 });
  }

  const { agencyId, jobId, firstName, lastName, phone, email, consentWhatsapp, campaign: campaignStr } = parsed.data;

  let campaign: Record<string, unknown> = {};
  try { campaign = JSON.parse(campaignStr); } catch { /* ignore */ }

  const supabase = createAdminClient();

  // Serverseitige Job-Re-Validierung: Job muss zur Agency gehoeren und aktiv sein
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .eq('agency_id', agencyId)
    .eq('status', 'active')
    .single();
  if (jobError || !job) {
    return NextResponse.json({ error: 'Stellenanzeige nicht gefunden' }, { status: 404 });
  }

  // Resume-Upload
  let resume: { storagePath: string; mime: string; size: number } | null = null;
  const resumeFile = formData.get('resume');
  if (resumeFile && resumeFile instanceof File && resumeFile.size > 0) {
    if (resumeFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Datei zu gross (max. 10 MB)' }, { status: 400 });
    }
    // MIME-Check: nur PDF erlaubt (client-kontrollierter type-Header nicht vertrauenswuerdig)
    if (resumeFile.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Nur PDF-Dateien erlaubt' }, { status: 400 });
    }
    const buffer = Buffer.from(await resumeFile.arrayBuffer());
    // Magic-Byte-Check: %PDF = 0x25 0x50 0x44 0x46
    if (buffer.length < 4 || buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
      return NextResponse.json({ error: 'Nur PDF-Dateien erlaubt' }, { status: 400 });
    }
    // storagePath ausschliesslich aus UUIDs + eigenem Timestamp — kein Client-Dateiname im Pfad
    const { randomUUID } = await import('crypto');
    const storagePath = `${agencyId}/apply/${randomUUID()}`;
    const { error: uploadError } = await supabase.storage
      .from('candidate-resumes')
      .upload(storagePath, buffer, { contentType: 'application/pdf' });

    if (!uploadError) {
      resume = { storagePath, mime: 'application/pdf', size: resumeFile.size };
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
    console.error('[apply] ingestApplication fehlgeschlagen:', err);
    return NextResponse.json({ error: 'Verarbeitung fehlgeschlagen. Bitte später erneut versuchen.' }, { status: 500 });
  }
}

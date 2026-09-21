import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';

/** Screening-Fragen für Indeed Apply (Spec §5): Pflicht sind Telefon + WhatsApp-Opt-in. */
export function buildQuestions() {
  return {
    schemaVersion: '1.0',
    questions: [
      {
        id: 'phone',
        type: 'phone',
        question: 'Wie lautet deine Telefonnummer?',
        required: true,
      },
      {
        id: 'consent_whatsapp',
        type: 'select',
        question: 'Dürfen wir dich zur Bewerbung per WhatsApp kontaktieren?',
        required: true,
        options: [
          { label: 'Ja', value: 'ja' },
          { label: 'Nein', value: 'nein' },
        ],
      },
    ],
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  const { job_id: raw } = await params;
  const jobId = raw.replace(/\.json$/, '');

  if (!isUuid(jobId)) {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  }

  const svc = createAdminClient();
  const { data: job } = await svc
    .from('jobs')
    .select('id, status, indeed_mode')
    .eq('id', jobId)
    .single();

  if (!job || job.status !== 'active' || job.indeed_mode !== 'apply') {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  }

  return NextResponse.json(buildQuestions());
}
